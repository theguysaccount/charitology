"""Project IRS Form 990 financial extracts into small, source-pinned EIN partitions."""
import csv
import gzip
import io
import json
import re
import sys
from collections import Counter, defaultdict
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile


IRS_BASE = 'https://www.irs.gov/pub/irs-soi/'
EDITION = '2026-11-10'
REGISTRY_SHA256 = '85daef9189479e24a7892cc7b055913f6e7b3cf393feb029ce67235f1e045ec5'
FILES = {
    2023: ('a32f2744b6d7b1456579cd668eff5dd51f7f79f6e13e21a832c3654353dcd99f', '5cd4d5bc7b63d85479f5986c84e468cb14666c6bb4c58cc3f9c3c392dd100426'),
    2024: ('dc3898cad2007fdb194d73281c3eb625773ea90626c22ca167e842d205a49d10', '80319c89b3a80c28f09a941fad8433d487e60594c606d8a49a13349485c7e5ba'),
}
FIELDS = {
    'totrevenue': 'totalRevenueUSD',
    'totfuncexpns': 'totalFunctionalExpensesUSD',
    'totprgmrevnue': 'programServiceRevenueUSD',
    'grntstogovt': 'grantsToUSGovernmentsAndOrganizationsUSD',
    'grntstofrgngovt': 'grantsToOrganizationsAndIndividualsOutsideUSUSD',
}


def digest(body):
    return sha256(body).hexdigest()


def checked_file(path, expected):
    with path.open('rb') as stream:
        if sha256_stream(stream) != expected:
            raise ValueError(f'Original file changed: {path.name}')
    return path


def sha256_stream(stream):
    h = sha256()
    while chunk := stream.read(1024 * 1024):
        h.update(chunk)
    return h.hexdigest()


def load_eins(directory):
    manifest = json.loads(checked_file(directory / 'manifest.json', REGISTRY_SHA256).read_bytes())
    eins = set()
    for prefix, asset in manifest['shards']['eins'].items():
        body = checked_file(directory / asset['path'], asset['sha256']).read_bytes()
        decoded = gzip.decompress(body)
        if digest(decoded) != asset['decodedSha256']:
            raise ValueError('Registry decoded bytes did not verify.')
        records = decoded.decode('ascii').splitlines()
        assert len(records) == asset['rows']
        eins.update(prefix + row[:7] for row in records)
    assert len(eins) == manifest['recordCount']
    return eins, manifest['dataDate']


def normalize_amount(raw):
    if not raw:
        return None
    if not re.fullmatch(r'-?[0-9]{1,15}(?:\.[0-9]{1,2})?', raw):
        raise ValueError('Unexpected USD figure.')
    return raw


def read_extract(inputs, year, history):
    archive_name = f'{year % 100:02d}eoextract990.zip'
    documentation = f'{year % 100:02d}eofinextractdoc.xlsx'
    archive_hash, documentation_hash = FILES[year]
    checked_file(inputs / documentation, documentation_hash)
    counts = Counter()
    with ZipFile(checked_file(inputs / archive_name, archive_hash)) as archive:
        with archive.open(archive_name.removesuffix('.zip') + '.csv') as raw:
            reader = csv.reader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''))
            header = [column.strip().lower() for column in next(reader)]
            assert len(set(header)) == len(header)
            indexes = [header.index(column) for column in ('ein', 'tax_pd', 'subseccd', *FIELDS)]
            for source_record, row in enumerate(reader, 1):
                assert len(row) == len(header)
                counts['input'] += 1
                raw_ein, month, subsection, *amounts = [row[index].strip() for index in indexes]
                if subsection != '03':
                    counts['otherSubsection'] += 1
                    continue
                assert re.fullmatch(r'[0-9]{1,9}', raw_ein) and re.fullmatch(r'20[0-9]{2}(?:0[1-9]|1[0-2])', month)
                if month[:4] not in ('2022', '2023', '2024'):
                    counts['outsidePeriod'] += 1
                    continue
                ein, period = raw_ein.zfill(9), f'{month[:4]}-{month[4:]}'
                selected = [normalize_amount(value) for value in amounts]
                history[ein][period].append([year, source_record, *selected])
                counts['selected'] += 1
    assert counts['input'] == counts['otherSubsection'] + counts['outsidePeriod'] + counts['selected']
    return {'archive': IRS_BASE + archive_name, 'sha256': archive_hash, 'documentation': IRS_BASE + documentation,
            'documentationSha256': documentation_hash, 'counts': dict(counts)}


def write_shard(target, prefix, records):
    raw = (json.dumps(records, separators=(',', ':')) + '\n').encode()
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, filename='', mode='wb', mtime=0, compresslevel=9) as packed:
        packed.write(raw)
    body = buffer.getvalue()
    path = f'{prefix}.json.gz'
    (target / path).write_bytes(body)
    return {'path': path, 'rows': len(records), 'bytes': len(body), 'decodedBytes': len(raw),
            'sha256': digest(body), 'decodedSha256': digest(raw)}


def build(inputs, registry, target):
    eins, registry_date = load_eins(registry)
    histories = defaultdict(lambda: defaultdict(list))
    sources = {str(year): read_extract(inputs, year, histories) for year in FILES}
    counts = Counter()
    shards = defaultdict(list)
    for ein, history in histories.items():
        periods = []
        for period, observations in sorted(history.items(), reverse=True):
            comparable = {tuple(row[2:]) for row in observations}
            if len(comparable) > 1:
                counts['conflictingPeriods'] += 1
                counts['conflictingRecords'] += len(observations)
                continue
            counts['identicalRecordsCollapsed'] += len(observations) - 1
            counts['includedPeriods'] += 1
            references = [[year, record] for year, record, *_ in observations]
            periods.append([period, *observations[0][2:], references])
        if not periods:
            continue
        matched = ein in eins
        counts['organizations'] += 1
        counts['registryMatches'] += matched
        counts['multiPeriod'] += len(periods) > 1
        shards[ein[:2]].append([ein, matched, periods])

    assert sum(source['counts']['selected'] for source in sources.values()) == counts['includedPeriods'] + counts['identicalRecordsCollapsed'] + counts['conflictingRecords']
    target.mkdir(parents=True)
    manifest = {
        'format': 'charitology-us-form990-v1', 'capturedOn': EDITION, 'currency': 'USD', 'form': '990',
        'registry': {'date': registry_date, 'manifestSha256': REGISTRY_SHA256},
        'sourcePage': 'https://www.irs.gov/statistics/soi-tax-stats-annual-extract-of-tax-exempt-organization-financial-data',
        'counts': {key: counts[key] for key in ('organizations', 'registryMatches', 'multiPeriod', 'includedPeriods',
                    'identicalRecordsCollapsed', 'conflictingPeriods', 'conflictingRecords')},
        'periodFields': ['taxPeriodEndMonth', *FIELDS.values(), 'sourceRecords'],
        'sources': sources,
        'shards': {prefix: write_shard(target, prefix, sorted(rows)) for prefix, rows in sorted(shards.items())},
    }
    (target / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print(json.dumps(manifest['counts']))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: python3 scripts/build-us-charity-financials.py <captures> <pinned-irs-registry> <new-output>')
    build(*map(Path, sys.argv[1:]))
