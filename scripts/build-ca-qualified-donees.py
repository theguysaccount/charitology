"""Build the two-way CRA T1236 lookup from pinned public captures."""
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path

from ca_charity_sources import (ACCOUNT, CAD, CAPTURED_ON, CAPTURES, LICENCE, PUBLISHER,
                                account, source_info, source_rows, write_shard)


ROW_FIELDS = ['filerAccount', 'recipientAccount', 'filerPeriodEnd', 'formVersion', 'worksheetRecord',
              'worksheetSequence', 'filerFinancialRecord', 'totalGiftCAD', 'giftInKindCAD']


@dataclass
class Worksheet:
    sequences: set = field(default_factory=set)
    repeated_or_missing_sequence: bool = False
    unavailable_amount: bool = False
    total: Decimal = Decimal(0)

    def record(self, sequence, total):
        self.repeated_or_missing_sequence |= not sequence or sequence in self.sequences
        self.sequences.add(sequence)
        if total is None:
            self.unavailable_amount = True
        else:
            self.total += total


def return_key(row):
    return (row['BN'].strip().upper(), date.fromisoformat(row['FPE'].strip().replace('/', '-')).isoformat(),
            row['Form ID'].strip())


def report_amount(raw):
    return Decimal(raw) if CAD.fullmatch(raw) else None


def compare_worksheet_totals(worksheets, returns):
    coverage = Counter({'returnsWithMatchedWorksheetRows': len(worksheets)})
    for key, worksheet in worksheets.items():
        total_5050 = returns[key][1]
        if worksheet.repeated_or_missing_sequence:
            coverage['sequenceUnavailable'] += 1
        elif worksheet.unavailable_amount:
            coverage['worksheetAmountUnavailable'] += 1
        elif total_5050 is None:
            coverage['line5050Unavailable'] += 1
        elif worksheet.total == total_5050:
            coverage['equal'] += 1
        elif worksheet.total < total_5050:
            coverage['worksheetBelow'] += 1
        else:
            coverage['worksheetAbove'] += 1
    fields = ('returnsWithMatchedWorksheetRows', 'sequenceUnavailable', 'worksheetAmountUnavailable',
              'line5050Unavailable', 'equal', 'worksheetBelow', 'worksheetAbove')
    return {name: coverage[name] for name in fields}


def read_edition(inputs, year, sources):
    identities = {}
    for _, row in source_rows(inputs, sources['identification']):
        registration = account(row['BN'])
        name = unicodedata.normalize('NFC', row['Legal Name'].strip())
        if registration in identities or not name:
            raise ValueError(f'Invalid or repeated legal-name record in edition {year}.')
        identities[registration] = name

    returns, filer_periods = {}, set()
    for record, row in source_rows(inputs, sources['finance']):
        key = return_key(row)
        if key[:2] in filer_periods or key[0] not in identities or key[1][:4] != year:
            raise ValueError(f'Invalid or repeated financial period in edition {year}, record {record}.')
        filer_periods.add(key[:2])
        returns[key] = (record, report_amount(row['5050'].strip()))

    counts = Counter()
    worksheets = defaultdict(Worksheet)
    pairs = Counter()
    candidates = []
    for record, row in source_rows(inputs, sources['gifts']):
        counts['sourceRows'] += 1
        key = return_key(row)
        finance = returns.get(key)
        if not finance:
            counts['noMatchedFilerReturn'] += 1
            continue

        sequence = row['#'].strip()
        raw_total, raw_in_kind = row['Total Gifts'].strip(), row['Gifts in Kind'].strip()
        total, in_kind = report_amount(raw_total), report_amount(raw_in_kind)
        worksheets[key].record(sequence, total)
        recipient = row['Donee BN'].strip().upper()
        if recipient not in identities:
            counts['recipientOutsideIdentityExtract'] += 1
        elif recipient == key[0]:
            counts['sameAccount'] += 1
        else:
            pair = (key, recipient)
            pairs[pair] += 1
            candidates.append((pair, record, sequence, finance[0], raw_total, raw_in_kind, total, in_kind))

    included = []
    for pair, record, sequence, finance_record, raw_total, raw_in_kind, total, in_kind in candidates:
        (filer, end, version), recipient = pair
        if pairs[pair] != 1:
            counts['repeatedPairRows'] += 1
        elif total is None or total <= 0:
            counts['nonpositiveOrUnavailableTotal'] += 1
        elif raw_in_kind and (in_kind is None or not 0 <= in_kind <= total):
            counts['unusableNoncashComponent'] += 1
        elif not re.fullmatch(r'[0-9]+', sequence):
            counts['unusableWorksheetSequence'] += 1
        else:
            included.append([filer, recipient, end, version, record, sequence, finance_record,
                             raw_total, raw_in_kind or None])
    counts['includedRows'] = len(included)
    counts['includedFilerAccounts'] = len({row[0] for row in included})
    counts['includedRecipientAccounts'] = len({row[1] for row in included})
    counts['repeatedPairs'] = sum(size > 1 for size in pairs.values())
    exclusions = ('noMatchedFilerReturn', 'recipientOutsideIdentityExtract', 'sameAccount', 'repeatedPairRows',
                  'nonpositiveOrUnavailableTotal', 'unusableNoncashComponent', 'unusableWorksheetSequence')
    if len(included) + sum(counts[name] for name in exclusions) != counts['sourceRows']:
        raise ValueError(f'Coverage does not balance for {year}.')
    stats = {'sourceRows': counts['sourceRows'], 'includedRows': counts['includedRows'],
             'includedFilerAccounts': counts['includedFilerAccounts'], 'includedRecipientAccounts': counts['includedRecipientAccounts'],
             'repeatedPairs': counts['repeatedPairs'], 'excluded': {name: counts[name] for name in exclusions}}
    return identities, included, stats, compare_worksheet_totals(worksheets, returns)


def write_edition(output, year, identities, rows):
    result = {}
    for direction, endpoint in (('given', 0), ('received', 1)):
        directory = f'{year}/{direction}'
        (output / directory).mkdir(parents=True)
        shards = defaultdict(list)
        for row in rows:
            shards[row[endpoint][7:9]].append(row)
        result[direction] = {}
        for key, group in sorted(shards.items()):
            accounts = sorted({registration for row in group for registration in row[:2]})
            asset = {'identities': {registration: identities[registration] for registration in accounts}, 'gifts': group}
            result[direction][key] = write_shard(output, f'{directory}/{key}.json.gz', asset, row_count=len(group))
    return result


def build(inputs, output):
    output.mkdir(parents=True)
    editions = {}
    for year in sorted(CAPTURES):
        sources = {kind: source_info(year, kind) for kind in ('identification', 'finance', 'gifts')}
        identities, rows, counts, comparison = read_edition(inputs, year, sources)
        editions[year] = {'sources': sources, 'counts': counts, 'worksheetComparison': comparison,
                          'indexes': write_edition(output, year, identities, rows)}
        print(f"{year}: {counts['includedRows']} distinct reported gift rows of {counts['sourceRows']} source rows.")
    manifest = {'format': 'charitology-ca-t1236-v1', 'jurisdiction': 'Canada', 'currency': 'CAD',
                'capturedOn': CAPTURED_ON, 'publisher': PUBLISHER, 'licence': LICENCE,
                'includedRows': sum(item['counts']['includedRows'] for item in editions.values()),
                'rowFields': ROW_FIELDS, 'editions': editions}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 scripts/build-ca-qualified-donees.py <input-directory> <new-output-directory>')
    build(Path(sys.argv[1]), Path(sys.argv[2]))
