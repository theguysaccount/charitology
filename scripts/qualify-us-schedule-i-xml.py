"""Read the exact candidate IRS XML members and compare reporting periods."""
import argparse
import io
import json
import re
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
from hashlib import sha256
from pathlib import Path
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from zipfile import ZipFile


BASE = 'https://apps.irs.gov/pub/epostcard/990/xml/'


class RangeFile(io.RawIOBase):
    def __init__(self, url):
        super().__init__()
        self.url = url
        self.position = 0
        with urlopen(Request(url, method='HEAD', headers={'Accept-Encoding': 'identity'}), timeout=20) as result:
            self.size = int(result.headers['Content-Length'])
            self.tag = result.headers.get('ETag')
            self.modified = result.headers.get('Last-Modified')
        assert self.size > 0 and (self.tag or self.modified)

    def tell(self):
        return self.position

    def seekable(self):
        return True

    def seek(self, offset, whence=io.SEEK_SET):
        base = {io.SEEK_SET: 0, io.SEEK_CUR: self.position, io.SEEK_END: self.size}[whence]
        if base + offset < 0:
            raise ValueError('Negative file position.')
        self.position = base + offset
        return self.position

    def read(self, size=-1):
        start = self.position
        end = self.size if size is None or size < 0 else min(self.size, start + size)
        if end <= start:
            return b''
        if end - start > 24_000_000:
            raise ValueError('Unexpectedly large requested ZIP range.')
        headers = {'Range': f'bytes={start}-{end - 1}', 'Accept-Encoding': 'identity'}
        with urlopen(Request(self.url, headers=headers), timeout=25) as response:
            if response.status != 206 or response.headers.get('Content-Range') != f'bytes {start}-{end - 1}/{self.size}':
                raise ValueError(f'Unexpected range response from {self.url}.')
            if response.headers.get('ETag') != self.tag or response.headers.get('Last-Modified') != self.modified:
                raise ValueError(f'Archive changed during read: {self.url}.')
            data = response.read(end - start + 1)
        if len(data) != end - start:
            raise ValueError('Incomplete ZIP range.')
        self.position = end
        return data


def archive_url(year, batch):
    assert re.fullmatch(r'[0-9]{4}_TEOS_XML_[0-9]{2}[A-Z]', batch) and batch.startswith(str(year))
    return f'{BASE}{year}/{batch}.zip'


def read_metadata(raw):
    doc = ET.fromstring(raw)
    head = doc.find('{*}ReturnHeader')
    data = doc.find('{*}ReturnData')
    assert head is not None and data is not None and head.findtext('{*}ReturnTypeCd') == '990'
    amendment = head.findtext('{*}AmendedReturnInd', '').strip()
    assert amendment in ('', '0', 'false', '1', 'X', 'true')
    schedule = Counter()
    for part in data.findall('{*}IRS990ScheduleI'):
        for row in part.findall('{*}RecipientTable'):
            identity, cash, noncash = (row.findtext('{*}' + field, '').strip() for field in ('RecipientEIN', 'CashGrantAmt', 'NonCashAssistanceAmt'))
            schedule[(identity, cash, noncash)] += 1
    return {
        'ein': head.findtext('{*}Filer/{*}EIN'), 'taxPeriodStart': head.findtext('{*}TaxPeriodBeginDt'),
        'taxPeriodEnd': head.findtext('{*}TaxPeriodEndDt'), 'amended': amendment in ('1', 'X', 'true'),
        'partIIRows': sum(schedule.values()), 'xmlSha256': sha256(raw).hexdigest(),
    }, schedule


def read_selected(archive, target_ids):
    found = {}
    for member in archive.infolist():
        match = re.search(r'(?:^|/)([0-9]{18})_public\.xml$', member.filename)
        if not match or match[1] not in target_ids:
            continue
        assert match[1] not in found and member.file_size <= 20_000_000
        meta, schedule = read_metadata(archive.read(member))
        found[match[1]] = ({'member': member.filename, **meta}, schedule)
    return found


def probe(item):
    url, target_ids = item
    with RangeFile(url) as remote, ZipFile(remote) as archive:
        records = read_selected(archive, target_ids)
        return url, {'bytes': remote.size, 'etag': remote.tag, 'lastModified': remote.modified}, records


def qualify(candidates, original):
    requirements = {}
    for entry in candidates:
        for object_id, locations in entry['otherObjects'].items():
            for location in locations:
                year, batch = location['indexYear'], location['batchId']
                batches = [batch.upper()] if batch else [f'{year}_TEOS_XML_{month:02}A' for month in range(1, 13)]
                for candidate in batches:
                    requirements.setdefault(archive_url(year, candidate), set()).add(object_id)

    errors = {}
    sources = {}
    found = {}
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {url: pool.submit(probe, (url, ids)) for url, ids in requirements.items()}
        for url, future in futures.items():
            try:
                _, source, records = future.result()
            except Exception as error:
                errors[url] = f'{type(error).__name__}: {error}'
                continue
            sources[url] = source
            for object_id, (meta, schedule) in records.items():
                found.setdefault(object_id, []).append(({'archive': url, **meta}, schedule))

    with ZipFile(original) as archive:
        original_meta = read_selected(archive, {entry['selectedObject'] for entry in candidates})
    records = []
    for entry in candidates:
        selected, original_rows = original_meta[entry['selectedObject']]
        assert (selected['ein'], selected['taxPeriodStart'], selected['taxPeriodEnd']) == (entry['ein'], entry['taxPeriodStart'], entry['taxPeriodEnd'])
        for alternative in entry['otherObjects']:
            if alternative not in found:
                records.append({'selectedObject': entry['selectedObject'], 'candidateObject': alternative, 'status': 'not-located'})
                continue
            for alternate, other_rows in found[alternative]:
                assert alternate['ein'] == selected['ein']
                end_matches = alternate['taxPeriodEnd'] == selected['taxPeriodEnd']
                start_matches = alternate['taxPeriodStart'] == selected['taxPeriodStart']
                records.append({
                    'selectedObject': entry['selectedObject'], 'selectedTaxPeriodStart': selected['taxPeriodStart'],
                    'selectedTaxPeriodEnd': selected['taxPeriodEnd'], 'candidateObject': alternative, 'candidate': alternate,
                    'status': 'same-period' if start_matches and end_matches else 'different-period',
                    'sameEndDate': end_matches, 'samePartIIAmountsAndRecipientIdentifiers': original_rows == other_rows,
                    'publishedGrantRows': entry['selectedGrantRows'],
                })
    return {'sources': sources, 'errors': errors, 'counts': Counter(row['status'] for row in records), 'records': records}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidates', type=Path)
    parser.add_argument('original', type=Path)
    args = parser.parse_args()
    candidates = json.loads(args.candidates.read_text(encoding='utf-8'))['candidates']
    print(json.dumps(qualify(candidates, args.original), indent=2))
