"""Project the dated Cabinet Office NPO downloads into searchable records."""
import csv
import gzip
import io
import json
import re
import sys
import unicodedata
from collections import Counter
from contextlib import contextmanager
from datetime import date
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile


PORTAL = 'https://www.npo-homepage.go.jp/npoportal/'
CAPTURED_ON = '2026-11-11'
AS_OF = '2026-11-10'
SOURCES = {
    'administrative': {
        'file': 'gyousei_000.zip', 'member': '000_AdministrativeInputData_20261110.csv',
        'sha256': '7300cba5148b1f0c2a2d6a2a1be035678e9e96d257df93d71481c7bfce91f719',
    },
    'organization': {
        'file': 'houjin_000.zip', 'member': '000_CorporateInputData_20261110.csv',
        'sha256': 'f638d7e06570fcda2c560c8dddd0172eb224ff974a63949fd6a0c18b0b2945ec',
    },
}
FINANCE_COLUMNS = {
    '活動計算書 経常収益計-合計': 'ordinaryRevenueJPY',
    '活動計算書 経常費用計-合計': 'ordinaryExpensesJPY',
    '活動計算書 経常収益計（受取寄附金）-合計': 'donationsReceivedJPY',
    '活動計算書 経常収益計（受取助成金等）-合計': 'grantsAndSimilarIncomeReceivedJPY',
}
FIELDS = ['portalId', 'name', 'nameKana', 'supervisingAuthority', 'corporateNumber', 'formationCertificationDate',
          'dissolutionInformationRecorded', 'administrativeSourceRecord', 'reportedFinance']
FINANCE_FIELDS = ['organizationSourceRecord', 'fiscalYearLabel', *FINANCE_COLUMNS.values()]


@contextmanager
def captured_rows(inputs, source):
    path = inputs / source['file']
    if sha256(path.read_bytes()).hexdigest() != source['sha256']:
        raise ValueError(f'The {path.name} capture changed.')
    with ZipFile(path) as archive, archive.open(source['member']) as member:
        yield csv.DictReader(io.TextIOWrapper(member, encoding='cp932', newline=''))


def label(raw):
    value = ''.join(' ' if unicodedata.category(char) == 'Cc' else char for char in raw)
    return unicodedata.normalize('NFC', value.strip())


def corporate_number(raw):
    if not re.fullmatch(r'[1-9][0-9]{12}', raw):
        return None
    weighted = sum(int(digit) * (1 + index % 2) for index, digit in enumerate(reversed(raw[1:])))
    return raw if int(raw[0]) == 9 - weighted % 9 else None


def full_date(raw):
    if re.fullmatch(r'[0-9]{8}', raw):
        pieces = (raw[:4], raw[4:6], raw[6:])
    elif re.fullmatch(r'[0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}', raw):
        pieces = re.split(r'[-/]', raw)
    else:
        return None
    try:
        return date(*map(int, pieces)).isoformat()
    except ValueError:
        return None


def financial_rows(inputs):
    projection = []
    with captured_rows(inputs, SOURCES['organization']) as rows:
        for row in rows:
            period = row['事業年度（直近の決算）'].strip()
            amounts = [row[column].strip() or None for column in FINANCE_COLUMNS]
            projection.append((label(row['法人名称']), period, amounts))
    return projection


def build(inputs, output):
    projection = financial_rows(inputs)
    unique_names = Counter(row[0] for row in projection)
    portal_ids = set()
    number_frequency = Counter()
    authorities = Counter()
    counts = Counter()
    rows = []
    with captured_rows(inputs, SOURCES['administrative']) as entries:
        for record, entry in enumerate(entries, 1):
            name = label(entry['法人名称'])
            finance_name, period, amounts = projection[record - 1]
            if not name or name != finance_name:
                raise ValueError(f'The same-date captures differ at record {record}.')
            match = re.fullmatch(re.escape(PORTAL + 'detail/') + r'([0-9]{9})', entry['法人情報URL'].strip())
            if not match or match[1] in portal_ids:
                raise ValueError(f'Missing or repeated portal link at record {record}.')
            portal_id = match[1]
            portal_ids.add(portal_id)
            kana = label(entry['法人名称カナ']) or None
            authority = label(entry['所轄庁'])
            if not authority:
                raise ValueError(f'Authority not supplied at record {record}.')
            authorities[authority] += 1
            raw_number = entry['法人番号'].strip()
            number = corporate_number(raw_number)
            if number:
                number_frequency[number] += 1
            counts['missingCorporateNumberRows'] += not raw_number
            counts['invalidCorporateNumberRows'] += bool(raw_number and not number)
            certification = full_date(entry['法人設立認証年月日'].strip())
            counts['withCertificationDate'] += certification is not None
            dissolution = bool(entry['解散情報'].strip())
            counts['withDissolutionInformation'] += dissolution
            finance = None
            if any(amount is not None for amount in amounts):
                counts['organizationRowsWithSelectedAmounts'] += 1
                if unique_names[name] != 1:
                    counts['financeExcludedRepeatedName'] += 1
                elif not re.fullmatch(r'[0-9]{4}', period):
                    counts['financeExcludedWithoutUsableYear'] += 1
                elif any(amount is not None and not re.fullmatch(r'-?[0-9]{1,16}', amount) for amount in amounts):
                    counts['financeExcludedUnusableAmount'] += 1
                else:
                    finance = [record, period, *amounts]
                    counts['financialSummaries'] += 1
            rows.append([portal_id, name, kana, authority, number, certification, dissolution, record, finance])
    if len(rows) != len(projection):
        raise ValueError('The two captures contain different numbers of records.')

    counts.update({'portalRows': len(rows), 'validCorporateNumberRows': sum(number_frequency.values()),
                   'repeatedCorporateNumbers': sum(size > 1 for size in number_frequency.values()),
                   'rowsWithRepeatedCorporateNumber': sum(size for size in number_frequency.values() if size > 1),
                   'repeatedLegalNames': sum(size > 1 for size in unique_names.values())})
    raw = (json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    if len(raw) > 16_000_000:
        raise ValueError('The edition exceeds the browser load limit.')
    packed = io.BytesIO()
    with gzip.GzipFile(filename='', fileobj=packed, mode='wb', mtime=0, compresslevel=9) as archive:
        archive.write(raw)
    body = packed.getvalue()
    asset = {'path': 'registry.json.gz', 'rows': len(rows), 'bytes': len(body), 'decodedBytes': len(raw),
             'sha256': sha256(body).hexdigest(), 'decodedSha256': sha256(raw).hexdigest()}
    manifest = {
        'format': 'charitology-japan-npo-v1', 'jurisdiction': 'Japan', 'currency': 'JPY',
        'asOf': AS_OF, 'capturedOn': CAPTURED_ON, 'publisher': 'Cabinet Office, Government of Japan',
        'portal': PORTAL, 'licence': 'https://www.cao.go.jp/notice/rule.html', 'fields': FIELDS, 'financeFields': FINANCE_FIELDS,
        'authorities': sorted(authorities), 'counts': {**dict(counts), 'byAuthority': dict(sorted(authorities.items()))},
        'sources': {key: {**value, 'url': PORTAL + 'download/zip/' + value['file']} for key, value in SOURCES.items()},
        'asset': asset,
    }
    output.mkdir(parents=True)
    (output / asset['path']).write_bytes(body)
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"{len(rows):,} portal records, {counts['financialSummaries']:,} dated financial summaries, {len(body):,} gzip bytes.")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 scripts/build-japan-npo.py <input-directory> <new-output-directory>')
    build(Path(sys.argv[1]), Path(sys.argv[2]))
