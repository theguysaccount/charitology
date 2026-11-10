"""Build an offline, sharded financial edition from the Commission's exact ZIP captures."""
import csv
import gzip
import io
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import date
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile


BASE = 'https://ccewuksprdoneregsadata1.blob.core.windows.net/data/txt/'
CAPTURES = {
    'register': ('charity-register.zip', 'publicextract.charity', '9457e2d45addfbeac7e3689c8cb5999edb1fa77c672b3bf0eef1459da86a0c24'),
    'returns': ('annual-return-history.zip', 'publicextract.charity_annual_return_history', 'd251fdea46a3603cf363b2bad83487bb8dcf44772c59ad282a9521379974aa56'),
}
CAPTURE_DAY = '2026-11-10'
YEARS = ('2023', '2024', '2025')
OGL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'


@contextmanager
def open_capture(directory, label):
    file_name, entry, expected = CAPTURES[label]
    path = directory / file_name
    with path.open('rb') as raw:
        assert sha256(raw.read()).hexdigest() == expected, f'Capture changed: {file_name}'
    with ZipFile(path) as archive, archive.open(entry + '.txt') as raw:
        stream = io.TextIOWrapper(raw, encoding='utf-8-sig', newline='')
        yield csv.DictReader(stream, delimiter='\t', quoting=csv.QUOTE_NONE)


def day(raw):
    return date.fromisoformat(raw[:10]).isoformat()


def amount(raw):
    if not raw:
        return None
    if not re.fullmatch(r'-?\d{1,13}(?:\.\d{1,2})?', raw):
        raise ValueError('Unexpected GBP figure.')
    return raw


def name_bucket(name):
    normalized = unicodedata.normalize('NFKD', name).lower()
    initial = next((char for char in normalized if unicodedata.category(char)[0] in 'LN'), '_')
    return initial if initial in 'abcdefghijklmnopqrstuvwxyz0123456789' else '_'


def write_shard(output, path, rows):
    raw = (json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    packed = io.BytesIO()
    with gzip.GzipFile(filename='', fileobj=packed, mode='wb', mtime=0, compresslevel=9) as archive:
        archive.write(raw)
    body = packed.getvalue()
    (output / path).write_bytes(body)
    return {'path': path, 'rows': len(rows), 'bytes': len(body), 'decodedBytes': len(raw),
            'sha256': sha256(body).hexdigest(), 'decodedSha256': sha256(raw).hexdigest()}


def build(inputs, output):
    organizations = {}
    with open_capture(inputs, 'register') as rows:
        for row in rows:
            assert None not in row and day(row['date_of_extract']) == CAPTURE_DAY
            if row['linked_charity_number'] != '0' or row['charity_registration_status'] != 'Registered':
                continue
            regulator_id = row['organisation_number']
            number = row['registered_charity_number']
            name = row['charity_name'].strip()
            assert re.fullmatch(r'[0-9]{6,8}', number) and name and len(name) <= 250 and regulator_id not in organizations
            organizations[regulator_id] = (number, name)
    assert len({number for number, _ in organizations.values()}) == len(organizations)

    counts = Counter()
    histories = defaultdict(dict)
    with open_capture(inputs, 'returns') as rows:
        for record, row in enumerate(rows, 1):
            assert None not in row and day(row['date_of_extract']) == CAPTURE_DAY
            counts['input'] += 1
            if row['suppression_ind'] != 'False':
                counts['suppressedOrUnknown'] += 1
                continue
            regulator_id = row['organisation_number']
            organization = organizations.get(regulator_id)
            if not organization or row['registered_charity_number'] != organization[0]:
                counts['outsideRegisteredMainScope'] += 1
                continue
            if row['fin_period_end_date'][:4] not in YEARS:
                counts['outsidePeriod'] += 1
                continue
            if not row['date_annual_return_received']:
                counts['returnNotReceived'] += 1
                continue
            start, end = day(row['fin_period_start_date']), day(row['fin_period_end_date'])
            received = day(row['date_annual_return_received'])
            key = (end, start)
            assert start <= end and key not in histories[regulator_id]
            histories[regulator_id][key] = [start, end, received, amount(row['total_gross_income']), amount(row['total_gross_expenditure']), record]
            counts['included'] += 1
    assert counts['input'] == sum(value for key, value in counts.items() if key != 'input')

    names, ids = defaultdict(list), defaultdict(list)
    for regulator_id, periods in histories.items():
        number, name = organizations[regulator_id]
        bucket = name_bucket(name)
        names[bucket].append([number, name, regulator_id, [periods[key] for key in sorted(periods, reverse=True)]])
        ids[number[:2]].append([number, bucket])

    output.mkdir(parents=True)
    (output / 'names').mkdir()
    (output / 'ids').mkdir()
    manifest = {
        'format': 'charitology-ew-returns-v1', 'date': CAPTURE_DAY, 'currency': 'GBP',
        'license': OGL, 'jurisdiction': 'England and Wales', 'registeredMain': len(organizations),
        'organizations': len(histories), 'multiPeriod': sum(len(periods) > 1 for periods in histories.values()),
        'counts': dict(counts), 'periodFields': ['start', 'end', 'annualReturnReceived', 'grossIncomeGBP', 'grossExpenditureGBP', 'sourceRecord'],
        'sources': {label: {'publisher': 'Charity Commission for England and Wales', 'url': BASE + entry + '.zip', 'sha256': digest}
                    for label, (_, entry, digest) in CAPTURES.items()},
        'names': {bucket: write_shard(output, f'names/{bucket}.json.gz', sorted(rows, key=lambda row: (row[1].casefold(), row[0])))
                  for bucket, rows in sorted(names.items())},
        'ids': {bucket: write_shard(output, f'ids/{bucket}.json.gz', sorted(rows)) for bucket, rows in sorted(ids.items())},
    }
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print(f"{manifest['organizations']} charities, {counts['included']} dated returns.")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 scripts/build-ew-charity-financials.py <input-directory> <new-output-directory>')
    build(Path(sys.argv[1]), Path(sys.argv[2]))
