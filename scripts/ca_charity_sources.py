"""Exact source pins and sharded JSON output for CRA data editions."""
import csv
import gzip
import io
import json
import re
from hashlib import sha256


CATALOGUE = 'https://open.canada.ca/data/dataset/'
LICENCE = 'https://open.canada.ca/en/open-government-licence-canada'
CAPTURED_ON = '2026-11-11'
PUBLISHER = 'Canada Revenue Agency'
CAPTURES = {
    '2023': {
        'disbursements': (
            'd205c11b-9803-4d3a-8ac8-ab7b648d145b',
            'non_qualified_donees_2023_updated.csv',
            '6abc1abb33eb5bd00675a8f5a25cacc9a5cf31c69300f434a9ed1b314f39bee6',
        ),
        'gifts': (
            'c603fe1f-cc4c-480e-b1cd-7fd949c42487',
            'qualified_donees_2023_updated.csv',
            'e5d36e37576b577168a22cfa0d7cac667bbecb6e4a2113a37baa3f734f78273b',
        ),
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
        'disbursements': (
            'f4eb196a-d0c1-45b0-bc48-e9b48c06cbce',
            'non_qualified_donees_2024_updated.csv',
            '373b2f8fc8576041cbb89d69793270f52efd5008c3e00ebbcc2b124e373b5417',
        ),
        'gifts': (
            '8195b2cb-ce2d-4cd2-b829-6d07f4959f49',
            'qualified_donees_2024_updated.csv',
            '99e1c0eb80393c8809659bd4ed071dd8286f4926134a203bdf663f2db8ac2f44',
        ),
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


ACCOUNT = re.compile(r'[0-9]{9}RR[0-9]{4}')
CAD = re.compile(r'-?[0-9]{1,18}(?:\.[0-9]{1,2})?')


def account(raw):
    value = raw.strip().upper()
    if not ACCOUNT.fullmatch(value):
        raise ValueError('Invalid registered-charity account.')
    return value


def amount(raw):
    value = raw.strip()
    if value and not CAD.fullmatch(value):
        raise ValueError('Invalid reported CAD amount.')
    return value or None


def write_shard(output, path, rows, *, row_count=None):
    raw = (json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, filename='', mode='wb', mtime=0, compresslevel=9) as stream:
        stream.write(raw)
    packed = compressed.getvalue()
    (output / path).write_bytes(packed)
    return {'path': path, 'rows': len(rows) if row_count is None else row_count, 'bytes': len(packed), 'decodedBytes': len(raw),
            'sha256': sha256(packed).hexdigest(), 'decodedSha256': sha256(raw).hexdigest()}
