"""Build the sharded CRA financial lookup from the four pinned public CSVs."""
import json
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from ca_charity_sources import (CAPTURED_ON, CAPTURES, CATALOGUE, LICENCE, PUBLISHER,
                                account, amount, source_info, source_rows, write_shard)


AMOUNTS = {
    '4700': 'totalRevenueCAD',
    '5100': 'totalExpendituresCAD',
    '5000': 'charitableProgramExpendituresCAD',
    '4510': 'receivedFromRegisteredCharitiesCAD',
    '5050': 'giftsToQualifiedDoneesCAD',
    '5045': 'grantsToOtherGranteesCAD',
}
PERIOD_FIELDS = ['periodEnd', 'formVersion', 'financialSection', 'accountingBasis',
                 'financialSourceRecord', 'identificationSourceRecord', *AMOUNTS.values()]


def name_bucket(name):
    initial = next(char for char in unicodedata.normalize('NFKD', name).lower() if char.isalnum())
    return initial if initial in 'abcdefghijklmnopqrstuvwxyz0123456789' else '_'


def read_edition(inputs, year):
    identification = source_info(year, 'identification')
    finance = source_info(year, 'finance')
    names, periods = {}, {}
    for source_record, row in source_rows(inputs, identification):
        registration = account(row['BN'])
        name = unicodedata.normalize('NFC', row['Legal Name'].strip())
        if registration in names or not name or not any(char.isalnum() for char in name):
            raise ValueError(f'Invalid or repeated legal-name record in edition {year}, record {source_record}.')
        names[registration] = (name, source_record)

    sections = Counter()
    for source_record, row in source_rows(inputs, finance):
        registration = account(row['BN'])
        period_end = date.fromisoformat(row['FPE'].strip().replace('/', '-')).isoformat()
        section, basis, version = (row[key].strip() for key in ('Section Used', '4020', 'Form ID'))
        key = (registration, period_end)
        if (registration not in names or key in periods or period_end[:4] != year
                or section not in ('D', '6') or basis not in ('', 'A', 'C') or not version.isdigit()):
            raise ValueError(f'Unusable or repeated financial record in edition {year}, record {source_record}.')
        periods[key] = [period_end, version, section, basis or None, source_record,
                        names[registration][1], *[amount(row[line]) for line in AMOUNTS]]
        sections[section] += 1

    info = {'catalogue': CATALOGUE + CAPTURES[year]['dataset'], 'identification': identification,
            'finance': finance, 'identityAccounts': len(names), 'financialPeriods': len(periods),
            'financialSections': dict(sorted(sections.items()))}
    return names, periods, info


def build(inputs, output):
    history = defaultdict(list)
    legal_names, editions = {}, {}
    for year in sorted(CAPTURES):
        names, periods, editions[year] = read_edition(inputs, year)
        for (registration, _), row in periods.items():
            legal_names[registration] = names[registration][0]
            history[registration].append(row)

    names, ids = defaultdict(list), defaultdict(list)
    for registration, periods in history.items():
        name = legal_names[registration]
        bucket = name_bucket(name)
        names[bucket].append([registration, name, sorted(periods, key=lambda row: row[0], reverse=True)])
        ids[registration[7:9]].append([registration, bucket])

    output.mkdir(parents=True)
    (output / 'names').mkdir()
    (output / 'ids').mkdir()
    manifest = {
        'format': 'charitology-ca-t3010-v1', 'jurisdiction': 'Canada',
        'capturedOn': CAPTURED_ON, 'publisher': PUBLISHER, 'licence': LICENCE, 'currency': 'CAD',
        'accounts': len(history), 'multiYearAccounts': sum(len({row[0][:4] for row in rows}) > 1 for rows in history.values()),
        'financialPeriods': sum(len(rows) for rows in history.values()), 'editions': editions,
        'amountLines': AMOUNTS, 'periodFields': PERIOD_FIELDS,
        'names': {key: write_shard(output, f'names/{key}.json.gz', sorted(rows, key=lambda row: (row[1].casefold(), row[0])))
                  for key, rows in sorted(names.items())},
        'ids': {key: write_shard(output, f'ids/{key}.json.gz', sorted(rows)) for key, rows in sorted(ids.items())},
    }
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f"{manifest['accounts']} charity accounts, {manifest['financialPeriods']} dated returns.")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 scripts/build-ca-charity-financials.py <input-directory> <new-output-directory>')
    build(Path(sys.argv[1]), Path(sys.argv[2]))
