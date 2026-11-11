"""Project pinned CRA T1441 files to disjoint, privacy-pooled geographic totals."""
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from functools import lru_cache
from hashlib import sha256
from html import unescape
from pathlib import Path

from ca_charity_sources import ACCOUNT, CAD, CAPTURED_ON, LICENCE, PUBLISHER, source_info, source_rows


GUIDE_ROOT = 'https://www.canada.ca/'
EN = 'en/revenue-agency/services/forms-publications/publications/t4033/t4033-completing-registered-charity-information-return'
FR = 'fr/agence-revenu/services/formulaires-publications/publications/t4033/t4033-comment-remplir-declaration-renseignements-organismes-bienfaisance-enregistres.html'
GUIDES = {
    'cra-guide-en.html': (EN + '.html', 'Country codes', 'bbe362a089b23895580a1fb21d2b9604333adf753e460f80c4ea2e56013166d4'),
    'cra-guide-en-2023.html': (EN + '-23.html', 'Country codes', 'bbe362a089b23895580a1fb21d2b9604333adf753e460f80c4ea2e56013166d4'),
    'cra-guide-fr.html': (FR, 'Code de pays', 'b7a7e49c47fc7548ecc0c66cd65c1daecd703ecddd81204572b831fa969f65ff'),
}
REGIONS = frozenset(('QM', 'QN', 'QO', 'QP', 'QR', 'QS'))
THRESHOLD = 5
COMPONENTS = {'cash': 'Cash amount', 'noncash': 'Non-cash amount'}
COVERAGE = ('country', 'multiple', 'region', 'blank', 'unresolved')
EXCLUSIONS = ('unmatchedReturn', 'invalidSequence', 'repeatedSequence')


def normalize(value):
    return ' '.join(unicodedata.normalize('NFKC', value).casefold().split())


def codebook(inputs):
    maps = []
    for name, (_, caption, digest) in GUIDES.items():
        html = (inputs / name).read_text(encoding='utf-8')
        table = re.search(r'<caption[^>]*>' + caption + r'</caption>(.*?)</table>', html, re.S)
        if table is None:
            raise ValueError(f'Country table not found in {name}.')
        entries = re.findall(r'<td[^>]*>\s*([A-Z]{2})-([^<]+)</td>', table.group(1))
        regions = re.findall(r'<p[^>]*>\s*(Q[MNOPRS])-([^<]+)</p>', html[table.end():table.end() + 1800])
        if len(entries) != 118 or {key for key, _ in regions} != REGIONS:
            raise ValueError(f'Country or regional code count changed in {name}.')
        codes = {key: unescape(label).strip() for key, label in entries + regions}
        if sha256(json.dumps(codes, ensure_ascii=False, sort_keys=True).encode()).hexdigest() != digest:
            raise ValueError(f'Pinned country code table changed in {name}.')
        maps.append(codes)
    if maps[0] != maps[1] or maps[0].keys() != maps[2].keys():
        raise ValueError('Guide code tables disagree.')
    aliases = defaultdict(set)
    for codes in (maps[0], maps[2]):
        for code, name in codes.items():
            for alias in (code, name, f'{code}-{name}'):
                aliases[normalize(alias)].add(code)
    return maps[0], {alias: next(iter(values)) for alias, values in aliases.items() if len(values) == 1}


def place(value, aliases):
    cleaned = normalize(value)
    if not cleaned:
        return 'blank', None
    parts = tuple(part.strip() for part in cleaned.split(','))
    # Some official French country labels themselves contain a comma.
    # Match complete documented labels and reject ambiguous or partial parses.
    @lru_cache(maxsize=None)
    def match(index):
        if index == len(parts):
            return {frozenset()}
        found = set()
        for end in range(index + 1, min(index + 2, len(parts)) + 1):
            code = aliases.get(', '.join(parts[index:end]))
            if code:
                found.update(rest | {code} for rest in match(end))
        return found

    matches = match(0) if len(parts) <= 48 else set()
    if len(matches) != 1:
        return 'unresolved', None
    codes = next(iter(matches))
    if len(codes) != 1:
        return 'multiple', None
    code = next(iter(codes))
    return ('region', None) if code in REGIONS else ('country', code)


def return_key(row, year):
    registration = row['BN'].strip().upper()
    version = row['Form ID'].strip()
    try:
        end = date.fromisoformat(row['FPE'].strip().replace('/', '-'))
    except ValueError:
        return None
    if not ACCOUNT.fullmatch(registration) or end.year != int(year) or not re.fullmatch(r'[0-9]+', version):
        return None
    return registration, end.isoformat(), version


@dataclass
class Amounts:
    total: Decimal = Decimal(0)
    records: int = 0
    accounts: set = field(default_factory=set)
    nonzero_accounts: set = field(default_factory=set)

    def add(self, value, filer):
        self.total += value
        self.records += 1
        self.accounts.add(filer)
        if value:
            self.nonzero_accounts.add(filer)

    def pool(self, group):
        self.total += group.total
        self.records += group.records
        self.accounts.update(group.accounts)
        self.nonzero_accounts.update(group.nonzero_accounts)

    def public(self):
        return {'amountCAD': format(self.total, '.2f') if self.records else None,
                'amountRows': self.records, 'reportingAccounts': len(self.accounts)}


def edition(inputs, year, names, aliases):
    finance = source_info(year, 'finance')
    grants = source_info(year, 'disbursements')
    returns = set()
    periods = set()
    for record, row in source_rows(inputs, finance):
        key = return_key(row, year)
        if key is None or key[:2] in periods:
            raise ValueError(f'Unusable or repeated financial period in {year}, record {record}.')
        periods.add(key[:2])
        returns.add(key)

    coverage, excluded, sequences = Counter(), Counter(), Counter()
    matched = []
    source_count = 0
    for record, row in source_rows(inputs, grants):
        source_count += 1
        key = return_key(row, year)
        if key not in returns:
            excluded['unmatchedReturn'] += 1
            continue
        sequence = row['#'].strip()
        if not re.fullmatch(r'[0-9]+', sequence) or int(sequence) < 1:
            excluded['invalidSequence'] += 1
            continue
        coordinate = (*key, int(sequence))
        sequences[coordinate] += 1
        matched.append((coordinate, row['Country'], *(row[column].strip() for column in COMPONENTS.values())))

    totals = {component: Amounts() for component in COMPONENTS}
    groups = {component: defaultdict(Amounts) for component in COMPONENTS}
    unavailable = Counter()
    included = set()
    for coordinate, country, *raw_amounts in matched:
        if sequences[coordinate] != 1:
            excluded['repeatedSequence'] += 1
            continue
        included.add(coordinate[:3])
        category, code = place(country, aliases)
        coverage[category] += 1
        for component, raw in zip(COMPONENTS, raw_amounts):
            if not raw:
                unavailable[component] += 1
                continue
            if not CAD.fullmatch(raw):
                raise ValueError(f'Unexpected reported {component} amount in {year}.')
            value = Decimal(raw)
            totals[component].add(value, coordinate[0])
            groups[component][code].add(value, coordinate[0])

    result = {}
    for component, amounts in groups.items():
        pooled = amounts.pop(None, Amounts())
        countries = []
        for code, group in sorted(amounts.items(), key=lambda item: names[item[0]].casefold()):
            if len(group.nonzero_accounts) < THRESHOLD:
                pooled.pool(group)
            else:
                countries.append({'code': code, 'name': names[code], **group.public()})
        if pooled.records and len(pooled.nonzero_accounts) < THRESHOLD:
            raise ValueError(f'Unallocated total needs additional pooling in {year}, {component}.')
        result[component] = {'reported': totals[component].public(), 'unavailableRows': unavailable[component],
                             'unallocated': pooled.public(), 'countries': countries}

    if sum(coverage.values()) + sum(excluded.values()) != source_count:
        raise ValueError(f'Grant coverage does not balance in {year}.')
    return {
        'sources': {'finance': finance, 'grants': grants},
        'sourceRows': source_count, 'includedRows': sum(coverage.values()), 'filerPeriods': len(included),
        'excluded': {key: excluded[key] for key in EXCLUSIONS}, 'geography': {key: coverage[key] for key in COVERAGE},
        'amounts': result,
    }


def build(inputs, output):
    names, aliases = codebook(inputs)
    document = {
        'format': 'charitology-ca-t1441-geography-v1', 'publisher': PUBLISHER, 'capturedOn': CAPTURED_ON,
        'currency': 'CAD', 'licence': LICENCE, 'stage': 'filer-reported-disbursement',
        'minimumNonzeroReportingAccounts': THRESHOLD,
        'countryGuides': [{'file': file, 'url': GUIDE_ROOT + url, 'countryTableSha256': digest}
                          for file, (url, _, digest) in GUIDES.items()],
        'editions': {year: edition(inputs, year, names, aliases) for year in ('2023', '2024')},
    }
    with output.open('x', encoding='utf-8') as file:
        file.write(json.dumps(document, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 scripts/build-ca-grant-geography.py <pinned-input-directory> <new-output-file>')
    build(Path(sys.argv[1]), Path(sys.argv[2]))
