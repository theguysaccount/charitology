"""Build the Taiwan institutional lookup and fund reporting edition from pinned public sources."""
import csv
from collections import Counter, defaultdict
from datetime import date
import gzip
from hashlib import sha256
import io
import json
from pathlib import Path
import re
import sys
import unicodedata

ID = re.compile(r'[0-9]{8}')
PLAN = re.compile(r'[（(]([0-9]{4}[A-Z][0-9]{3})[）)]')
MONEY = re.compile(r'(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)')
LICENSE = 'https://data.gov.tw/license'
REGISTRY = 'nonprofit-registrations.csv'
APPROVALS = 'approvals-2024.pdf'
APPROVAL_ROWS = {
    '1132D342': (8, 270710, 254610),
    '1132D346': (8, 229535, 224485),
    '1132D350': (9, 266000, 186000),
    '1132D424': (6, 322395, 133235),
    '1132F507': (11, 299000, 195584),
    '1133F514': (14, 296669, 285269),
}
REGISTRY_COLUMNS = ['統一編號', '單位名稱', '機關所在縣市', '最近異動日期', '最近異動原因', '原因說明文字']
LOCATION_LABELS = {
    '南投縣', '嘉義市', '嘉義縣', '基隆市', '宜蘭縣', '屏東縣', '彰化縣', '新北市', '新竹市', '新竹縣',
    '桃園市', '澎湖縣', '臺中市', '臺北市', '臺北縣', '臺南市', '臺東縣', '花蓮縣', '苗栗縣', '連江縣', '金門縣',
    '雲林縣', '高雄市',
}
CODE_VALUES = {'01', '02', '03', '04', '11', '12', '13', '17', '18', '20', '49'}

def verified_sources(captures):
    sources = {}
    expected = {REGISTRY, APPROVALS, 'new-resident-fund-2024.csv', 'new-resident-fund-2025.csv'}
    pins = Path(__file__).resolve().parent.parent / 'src/data/taiwan-index-sources.tsv'
    with pins.open(encoding='utf-8', newline='') as file:
        for item in csv.DictReader(file, delimiter='\t'):
            name = item['file']
            assert name in expected and name not in sources
            source = (captures / name).read_bytes()
            assert len(source) == int(item['bytes']) and sha256(source).hexdigest() == item['sha256'], name
            sources[name] = {'url': item['url'], 'bytes': int(item['bytes']), 'sha256': item['sha256']}
    assert set(sources) == expected
    return sources

def local_day(year, month, day):
    try:
        return date(int(year) + 1911, int(month), int(day)).isoformat()
    except ValueError:
        return None

def registry_day(raw):
    return local_day(raw[:3], raw[3:5], raw[5:]) if re.fullmatch(r'[0-9]{7}', raw) else None

def reported_day(raw):
    match = re.fullmatch(r'([0-9]{3})[./]([0-9]{1,2})[./]([0-9]{1,2})', raw.strip())
    return local_day(*match.groups()) if match else None

def amount(raw):
    raw = raw.strip()
    assert MONEY.fullmatch(raw), raw
    return int(raw.replace(',', ''))

def name_key(value):
    return unicodedata.normalize('NFKC', value).strip()

def name_bucket(value):
    normalized = unicodedata.normalize('NFKD', value).lower()
    first = next((char for char in normalized if unicodedata.category(char)[0] in 'LN'), '')
    return f'{ord(first) % 64:02x}' if first else 'other'

def registry_rows(captures):
    counts = Counter()
    known = set()
    rows = []
    names = defaultdict(list)
    path = captures / REGISTRY
    with path.open(encoding='utf-8-sig', newline='') as file:
        reader = csv.reader(file)
        assert next(reader) == REGISTRY_COLUMNS
        for record, row in enumerate(reader, 1):
            code, name, location, changed, reason, _ = row
            counts['inputRecords'] += 1
            if not ID.fullmatch(code):
                assert not code
                counts['blankIdentifier'] += 1
                continue
            assert code not in known and name.strip()
            assert location in LOCATION_LABELS or not location
            assert reason in CODE_VALUES
            known.add(code)
            normalized = registry_day(changed)
            counts['unknownChangeDate'] += normalized is None
            counts['unknownLocation'] += not location
            names[name_key(name)].append(code)
            rows.append([code, name, location or None, changed, normalized, reason, record])
    assert counts['inputRecords'] == len(rows) + counts['blankIdentifier']
    counts['includedIdentities'] = len(rows)
    counts['repeatedNormalizedNames'] = sum(len(values) > 1 for values in names.values())
    return rows, names, dict(counts)

def fund_report(captures, year, names):
    counts = Counter()
    projects = {}
    with (captures / f'new-resident-fund-{year}.csv').open(encoding='utf-8-sig', newline='') as file:
        reader = csv.reader(file)
        header = next(reader)
        assert len(header) == (26 if year == 2024 else 16383)
        assert all(header[:26]) and not any(header[26:])
        assert header[:5] == [
            '受補捐助單位名稱_全銜', '計畫名稱', '列支科目名稱', '補捐助計畫總經費及分攤情形_本機關核定補捐助金額',
            '補捐助計畫總經費及分攤情形_本機關執行補捐助金額',
        ]
        for record, row in enumerate(reader, 1):
            assert len(row) == len(header) and not any(row[26:])
            counts['inputRecords'] += 1
            if not any(row):
                counts['blankRecords'] += 1
                continue
            assert row[0].strip() and row[1].strip() and row[2] == '對國內團體之捐助'
            assert re.search('社團法人|協會|基金會|聯盟|政府|學校|大學|學院|醫院|工會|姊妹會|救國團', row[0]), record
            assert len(row[0]) <= 180 and len(row[1]) <= 250
            assert row[13] in ('', 'V') and row[14] in ('', 'V')
            (plan,) = PLAN.findall(row[1])
            assert plan not in projects
            projects[plan] = (record, row[:26])
            candidates = len(names[name_key(row[0])])
            counts['uniqueNameCandidate'] += candidates == 1
            counts['ambiguousNameCandidate'] += candidates > 1
            counts['noNameCandidate'] += candidates == 0
    counts['projectRecords'] = len(projects)
    assert counts['inputRecords'] == counts['blankRecords'] + counts['projectRecords']
    return projects, dict(counts)

def filing(year, record, row):
    return {
        'reportYear': year, 'sourceRecord': record, 'projectTitle': row[1], 'reportedRecipient': row[0],
        'approvedTWD': amount(row[3]),
        'executionTWD': amount(row[4]), 'approvalDateLiteral': row[10] or None,
        'reportedApprovalDate': reported_day(row[10]), 'plannedCompletionDateLiteral': row[11] or None,
        'reportedPlannedCompletionDate': reported_day(row[11]), 'disbursementFieldLiteral': row[12] or None,
        'reportedDisbursementDate': reported_day(row[12]),
        'completedMarker': row[13] or None, 'incompleteMarker': row[14] or None,
        'returnedBalanceFieldLiteral': row[15] or None, 'returnedBalanceDateLiteral': row[16] or None,
        'returnedBalanceTWD': amount(row[15]) if MONEY.fullmatch(row[15].strip()) else None,
        'reportedBalanceReturnDate': reported_day(row[16]),
    }

def fund_edition(captures, names):
    reports, counts = {}, {}
    for year in (2024, 2025):
        reports[year], counts[year] = fund_report(captures, year, names)
    repeated = set(reports[2024]) & set(reports[2025])
    assert repeated == set(APPROVAL_ROWS)
    projects = []
    for plan in sorted(set(reports[2024]) | set(reports[2025])):
        source_rows = [(year, *reports[year][plan]) for year in (2024, 2025) if plan in reports[year]]
        filings = [filing(year, record, row) for year, record, row in source_rows]
        recipient = filings[0]['reportedRecipient']
        assert all(item['reportedRecipient'] == recipient for item in filings)
        approval = None
        if plan in APPROVAL_ROWS:
            page, requested, approved = APPROVAL_ROWS[plan]
            assert all(item['approvedTWD'] == approved for item in filings)
            assert filings[0]['executionTWD'] != filings[1]['executionTWD']
            approval = {'pdfPage': page, 'requestedTWD': requested, 'approvedTWD': approved}
        projects.append({
            'projectId': plan, 'title': filings[-1]['projectTitle'], 'reportedRecipient': recipient,
            'exactNameCandidateIds': names[name_key(recipient)],
            'approval': approval, 'executionReports': filings,
        })
    return {
        'format': 'charitology-taiwan-fund-v1', 'currency': 'TWD',
        'catalogue': 'https://data.gov.tw/dataset/86169', 'license': LICENSE, 'coverageByReport': counts,
        'uniqueProjects': len(projects), 'repeatedProjects': len(repeated), 'projects': projects,
    }

def csv_cell(value):
    if isinstance(value, str) and re.match(r"^(?:\s*[=+\-@]|[\t\r\n])", value):
        return "'" + value
    return value

def write_fund_csv(path, fund):
    filing_fields = [
        'reportYear', 'sourceRecord', 'projectTitle', 'reportedRecipient', 'approvedTWD',
        'executionTWD', 'approvalDateLiteral', 'reportedApprovalDate', 'plannedCompletionDateLiteral',
        'reportedPlannedCompletionDate', 'disbursementFieldLiteral', 'reportedDisbursementDate',
        'completedMarker', 'incompleteMarker', 'returnedBalanceFieldLiteral', 'returnedBalanceDateLiteral',
        'returnedBalanceTWD', 'reportedBalanceReturnDate',
    ]
    fields = ['projectId', 'currency', *filing_fields, 'approvalPdfPage', 'approvalPdfRequestedTWD',
              'approvalPdfApprovedTWD', 'sourceUrl', 'sourceSha256', 'approvalPdfUrl', 'approvalPdfSha256',
              'catalogue', 'license', 'publisher', 'capturedOn']
    with path.open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=fields, lineterminator='\n')
        writer.writeheader()
        pdf = fund['sources'][APPROVALS]
        for project in fund['projects']:
            approval = project['approval'] or {}
            for item in project['executionReports']:
                source = fund['sources'][f"new-resident-fund-{item['reportYear']}.csv"]
                writer.writerow({
                    'projectId': project['projectId'], 'currency': fund['currency'],
                    **{field: csv_cell(item[field]) for field in filing_fields},
                    'approvalPdfPage': approval.get('pdfPage'), 'approvalPdfRequestedTWD': approval.get('requestedTWD'),
                    'approvalPdfApprovedTWD': approval.get('approvedTWD'), 'sourceUrl': source['url'],
                    'sourceSha256': source['sha256'], 'approvalPdfUrl': pdf['url'] if approval else None,
                    'approvalPdfSha256': pdf['sha256'] if approval else None,
                    'catalogue': fund['catalogue'], 'license': fund['license'], 'publisher': fund['publisher'],
                    'capturedOn': fund['capturedOn'],
                })

def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def shard(output, relative, rows):
    plain = (json.dumps(rows, separators=(',', ':'), ensure_ascii=False) + '\n').encode('utf-8')
    buffer = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=buffer, mtime=0, compresslevel=9) as archive:
        archive.write(plain)
    packed = buffer.getvalue()
    (output / relative).write_bytes(packed)
    return {'path': relative, 'rows': len(rows), 'bytes': len(packed), 'decodedBytes': len(plain),
            'sha256': sha256(packed).hexdigest(), 'decodedSha256': sha256(plain).hexdigest()}

def build(captures, output):
    sources = verified_sources(captures)
    rows, names, counts = registry_rows(captures)
    compared = fund_edition(captures, names)
    assert len(rows) == 99913
    name_shards, id_shards = defaultdict(list), defaultdict(list)
    for row in rows:
        bucket = name_bucket(row[1])
        name_shards[bucket].append(row)
        id_shards[row[0][:2]].append([row[0], bucket])
    output.mkdir()
    for directory in ('names', 'ids'):
        (output / directory).mkdir()
    manifest = {
        'format': 'charitology-taiwan-institutions-v1', 'capturedOn': '2026-11-12',
        'catalogue': 'https://data.gov.tw/dataset/34147', 'source': sources[REGISTRY], 'license': LICENSE,
        'publisher': 'Financial Information Center, Taiwan Ministry of Finance',
        'counts': counts, 'fields': ['number', 'name', 'registeredLocation', 'lastChangeLiteral',
                                     'lastChangeDate', 'lastChangeCode', 'sourceRecord'],
        'names': {key: shard(output, f'names/{key}.json.gz', sorted(values, key=lambda row: (row[1], row[0])))
                  for key, values in sorted(name_shards.items())},
        'ids': {key: shard(output, f'ids/{key}.json.gz', sorted(values)) for key, values in sorted(id_shards.items())},
    }
    compared['sources'] = {key: sources[key] for key in [APPROVALS, 'new-resident-fund-2024.csv', 'new-resident-fund-2025.csv']}
    write_json(output / 'manifest.json', manifest)
    compared['capturedOn'] = manifest['capturedOn']
    compared['publisher'] = 'Taiwan National Immigration Agency'
    write_json(output / 'fund-comparison.json', compared)
    write_fund_csv(output / 'fund-comparison.csv', compared)
    print(json.dumps({'registry': counts, 'comparedProjects': len(compared['projects']),
                      'fund': compared['coverageByReport']}, sort_keys=True))

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 scripts/build-taiwan-charity-index.py <capture directory> <new output directory>')
    build(Path(sys.argv[1]), Path(sys.argv[2]))
