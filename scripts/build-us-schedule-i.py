"""Rebuild the organization-only Schedule I Part II financial edition."""
import gzip
import io
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from hashlib import sha256
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ARCHIVE = '2024_TEOS_XML_01A.zip'
ARCHIVE_SHA = '40b0aab9a3ae153a1d5945d9bd23e7414bdcf3b6b66819fd64819665701191d1'
REGISTRY_SHA = '85daef9189479e24a7892cc7b055913f6e7b3cf393feb029ce67235f1e045ec5'
SOURCE_URL = 'https://apps.irs.gov/pub/epostcard/990/xml/2024/' + ARCHIVE


def text(parent, name):
    return (parent.findtext(f'{{*}}{name}') or '').strip()


def load_registry(directory):
    raw = (directory / 'manifest.json').read_bytes()
    assert sha256(raw).hexdigest() == REGISTRY_SHA
    manifest = json.loads(raw)
    eins = set()
    for prefix, asset in manifest['shards']['eins'].items():
        packed = (directory / asset['path']).read_bytes()
        assert sha256(packed).hexdigest() == asset['sha256']
        lines = gzip.decompress(packed).decode('ascii').splitlines()
        assert len(lines) == asset['rows']
        eins.update(prefix + line[:7] for line in lines)
    assert len(eins) == manifest['recordCount']
    return eins, manifest['dataDate']


def amount(value):
    if value == '':
        return None
    if not re.fullmatch(r'[0-9]{1,15}', value):
        raise ValueError('Unsupported amount')
    return int(value)


def project(archive_path, registry):
    counts = Counter()
    duplicates = Counter()
    filings = defaultdict(list)
    source_files = {}
    with archive_path.open('rb') as stream:
        digest = sha256()
        while chunk := stream.read(1_048_576):
            digest.update(chunk)
        assert digest.hexdigest() == ARCHIVE_SHA
    with ZipFile(archive_path) as archive:
        assert len(archive.namelist()) == len(set(archive.namelist()))
        for member in archive.infolist():
            if member.is_dir() or not member.filename.endswith('.xml'):
                continue
            match = re.fullmatch(r'2024_TEOS_XML_01A/([0-9]{18})_public\.xml', member.filename)
            assert match and member.file_size <= 20_000_000, member.filename
            counts['xmlMembers'] += 1
            raw = archive.read(member)
            document = ET.fromstring(raw)
            header = document.find('{*}ReturnHeader')
            data = document.find('{*}ReturnData')
            if header is None or data is None or text(header, 'ReturnTypeCd') != '990':
                continue
            counts['form990'] += 1
            filer = header.find('{*}Filer')
            filer_ein = text(filer, 'EIN') if filer is not None else ''
            start, end = text(header, 'TaxPeriodBeginDt'), text(header, 'TaxPeriodEndDt')
            try:
                assert date.fromisoformat(start) <= date.fromisoformat(end)
            except (ValueError, AssertionError):
                counts['invalidPeriod'] += 1
                continue
            key = (filer_ein, end)
            duplicates[key] += 1
            tables = [row for schedule in data.findall('{*}IRS990ScheduleI') for row in schedule.findall('{*}RecipientTable')]
            if not tables:
                continue
            counts['partIIOrganizationRows'] += len(tables)
            if filer_ein not in registry or end[:4] not in ('2022', '2023'):
                counts['filerOrPeriodOutOfScope'] += len(tables)
                continue
            amended = text(header, 'AmendedReturnInd')
            assert amended in ('', '0', 'false', '1', 'X', 'true')
            if amended in ('1', 'X', 'true'):
                counts['amendedFilingRows'] += len(tables)
                continue
            recipients = Counter(text(row, 'RecipientEIN') for row in tables)
            candidate = []
            for row_number, row in enumerate(tables, 1):
                recipient = text(row, 'RecipientEIN')
                if row.find('{*}RecipientBusinessName') is None or recipient not in registry or recipient == filer_ein:
                    counts['unresolvedOrSelfRecipient'] += 1
                    continue
                if recipients[recipient] != 1:
                    counts['repeatedRecipientRows'] += 1
                    continue
                try:
                    cash = amount(text(row, 'CashGrantAmt'))
                    noncash = amount(text(row, 'NonCashAssistanceAmt'))
                except ValueError:
                    counts['unusableAmountRows'] += 1
                    continue
                if not cash and not noncash:
                    counts['noPositiveAmountRows'] += 1
                    continue
                candidate.append([recipient, row_number, cash, noncash])
            if candidate:
                object_id = match[1]
                assert object_id not in source_files
                source_files[object_id] = sha256(raw).hexdigest()
                filings[key].append([filer_ein, start, end, object_id, candidate])
    records = []
    for key, values in filings.items():
        if duplicates[key] > 1:
            counts['competingFilingRows'] += sum(len(value[4]) for value in values)
            continue
        assert len(values) == 1
        records.append(values[0])
    counts['includedFilings'] = len(records)
    counts['includedRows'] = sum(len(record[4]) for record in records)
    counts['includedRecipientEINs'] = len({row[0] for record in records for row in record[4]})
    classified = ('filerOrPeriodOutOfScope', 'amendedFilingRows', 'unresolvedOrSelfRecipient', 'repeatedRecipientRows',
                  'unusableAmountRows', 'noPositiveAmountRows', 'competingFilingRows', 'includedRows')
    assert sum(counts[key] for key in classified) == counts['partIIOrganizationRows']
    return counts, sorted(records), {record[3]: source_files[record[3]] for record in records}


def build(archive, registry_path, output):
    registry, registry_date = load_registry(registry_path)
    counts, records, source_files = project(archive, registry)
    snapshot = {'filings': records, 'filingSha256': source_files}
    raw = json.dumps(snapshot, separators=(',', ':'), sort_keys=True).encode() + b'\n'
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, filename='', mode='wb', mtime=0, compresslevel=9) as packed:
        packed.write(raw)
    body = buffer.getvalue()
    manifest = {
        'format': 'charitology-us-schedule-i-v1', 'capturedOn': '2026-11-10', 'currency': 'USD',
        'source': {'publisher': 'Internal Revenue Service', 'archive': SOURCE_URL, 'sha256': ARCHIVE_SHA,
                   'publicationBatch': '2024_TEOS_XML_01A', 'scope': 'Form 990 Schedule I, Part II'},
        'registry': {'date': registry_date, 'manifestSha256': REGISTRY_SHA},
        'counts': dict(sorted(counts.items())),
        'filingFields': ['filerEin', 'taxPeriodStart', 'taxPeriodEnd', 'filingObjectId', 'grants'],
        'grantFields': ['recipientEin', 'partIIRow', 'cashGrantUSD', 'nonCashAssistanceUSD'],
        'asset': {'path': 'filings.json.gz', 'rows': len(records), 'bytes': len(body), 'decodedBytes': len(raw),
                  'sha256': sha256(body).hexdigest(), 'decodedSha256': sha256(raw).hexdigest()},
    }
    output.mkdir(parents=True)
    (output / manifest['asset']['path']).write_bytes(body)
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print(json.dumps(manifest['counts']))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: python3 scripts/build-us-schedule-i.py <archive> <pinned-registry> <new-output>')
    build(*map(Path, sys.argv[1:]))
