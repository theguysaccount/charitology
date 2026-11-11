"""Build the sharded CRA financial lookup from the four pinned public CSVs."""
import csv
import gzip
import io
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from hashlib import sha256
from pathlib import Path


CATALOGUE = 'https://open.canada.ca/data/dataset/'
LICENCE = 'https://open.canada.ca/en/open-government-licence-canada'
CAPTURED_ON = '2026-11-11'
PUBLISHER = 'Canada Revenue Agency'
CAPTURES = {
    '2023': {
        'dataset': '05b3abd0-e70f-4b3b-a9c5-acc436bd15b6',
        'identification': (
            '31a52caf-fa79-4ab3-bded-1ccc7b61c17f',
            'ident_2023_updated.csv',
            '416c98d1ff52303f9f042c4e7ef5ac36bc1c16b146cd11eb64627ba8ceabee11',
        ),
        'finance': (
            '0b9b4b01-5cb6-4981-b007-ae88f48cc799',
            'financial_d_and_schedule_6_2023_updated.csv',
            '65c6321c4d58de4012d1011e0b39378ae5ebffaf76a231c295e7c1b3d9d3d974',
        ),
    },
    '2024': {
        'dataset': '80c00cdb-1358-415c-bb8b-0de7f12675b8',
        'identification': (
            '694fdc72-eae4-4ee0-83eb-832ab7b230e3',
            'ident_2024_updated.csv',
            '4f214ff2a9e659185b20f50431fd98f1d89e2d08fff8c2a9583b82b24fc4cd8e',
        ),
        'finance': (
            'e545170c-3689-4833-b2a8-e9e83100ab59',
            'financial_d_and_schedule_6_2024_updated.csv',
            '221ab68ea499a51bb9ecf84ae189cd48fe7919f1d7cc21abe4ad5f13aa891165',
        ),
    },
}
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


def source_info(year, kind):
    edition = CAPTURES[year]
    resource, file, digest = edition[kind]
    return {'url': f'{CATALOGUE}{edition["dataset"]}/resource/{resource}/download/{file}',
            'file': file, 'sha256': digest}


def source_rows(inputs, source):
    path = inputs / source['file']
    digest = sha256()
    with path.open('rb') as raw:
        for block in iter(lambda: raw.read(1_048_576), b''):
            digest.update(block)
    if digest.hexdigest() != source['sha256']:
        raise ValueError(f'Pinned capture changed: {path.name}')
    with path.open(encoding='utf-8-sig', newline='') as raw:
        for number, row in enumerate(csv.DictReader(raw), 1):
            if None in row or None in row.values():
                raise ValueError(f'Unexpected CSV layout in {path.name}, record {number}')
            yield number, row


def account(raw):
    value = raw.strip().upper()
    if not re.fullmatch(r'[0-9]{9}RR[0-9]{4}', value):
        raise ValueError('Invalid registered-charity account.')
    return value


def amount(raw):
    value = raw.strip()
    if value and not re.fullmatch(r'-?[0-9]{1,18}(?:\.[0-9]{1,2})?', value):
        raise ValueError('Invalid reported CAD amount.')
    return value or None


def name_bucket(name):
    initial = next(char for char in unicodedata.normalize('NFKD', name).lower() if char.isalnum())
    return initial if initial in 'abcdefghijklmnopqrstuvwxyz0123456789' else '_'


def write_shard(output, path, rows):
    raw = (json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, filename='', mode='wb', mtime=0, compresslevel=9) as stream:
        stream.write(raw)
    packed = compressed.getvalue()
    (output / path).write_bytes(packed)
    return {'path': path, 'rows': len(rows), 'bytes': len(packed), 'decodedBytes': len(raw),
            'sha256': sha256(packed).hexdigest(), 'decodedSha256': sha256(raw).hexdigest()}


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
