"""Verify the Kenya edition's public aggregates, coordinates and export contract."""
import csv
import json
import os
import re
from decimal import Decimal
from pathlib import Path


root = Path(__file__).resolve().parents[1]
route = Path(os.environ.get('CHARITOLOGY_DIST', root / 'dist')) / 'record/charity-financials/kenya'
base = os.environ.get('BASE_PATH', '/').rstrip('/')
data = json.loads((root / 'src/data/kenya-pbo-coverage.json').read_text(encoding='utf-8'))
assert json.loads((route / 'data.json').read_text(encoding='utf-8')) == data
directory = (root / 'src/data/kenya-pbo-directory-coverage.json').read_bytes()
assert (route / 'directory.json').read_bytes() == directory
directory = json.loads(directory)
assert directory['directoryRows'] == directory['distinctNonblankReferenceStrings'] == 15292
assert directory['printedReferenceShapes'] == {'ngoHyphenAlphanumeric': 1132, 'numeric218051': 14139, 'otherPrintedShape': 21}
assert sum(directory['printedReferenceShapes'].values()) == directory['directoryRows']
assert directory['normalizedNameStringsWithMultipleReferences'] == 69
assert directory['normalizedNamesWithBothMajorReferenceShapes'] == 1
assert len({source['sha256'] for source in directory['captures']}) == 2
html = (route / 'index.html').read_text(encoding='utf-8')
assert 'id="public-directory"' in html and 'href="#public-directory"' in html
assert f'href="{base}/record/charity-financials/kenya/directory.json"' in html
with (route / 'data.csv').open(encoding='utf-8', newline='') as stream:
    exports = list(csv.DictReader(stream))
assert len(exports) == 67
periods = {period['fiscalYear']: period for period in data['periods']}
assert list(periods) == ['2022/23', '2023/24', '2024/25'] and data['currency'] == 'KES'
assert [(row['annualReportsSubmitted'], row['receiptsKES']) for row in periods.values()] == [
    (2829, '196004885625.11'), (2988, '210025353455.50'), (3212, '246739736582.84'),
]
assert [row['receiptOriginsDifferenceKES'] for row in periods.values()] == ['0.00', '0.01', '0.00']
assert data['expenditure']['sectorTableProjectTotalInKenyaKES'] == '135610397391.76'

def verify(year, metric, geography, value, unit, section):
    source = periods[year]['source']
    ref = source['references'][section]
    assert re.fullmatch(r'[a-f0-9]{64}', source['sha256'])
    actual = rows.pop((year, metric, geography))
    assert actual == {
        'fiscalYear': year, 'metric': metric, 'geography': geography, 'value': '' if value is None else str(value),
        'unit': unit, 'source': source['url'], 'sourcePdfPage': str(ref['pdfPage']), 'printedPage': str(ref['printedPage']),
        'sourceLocation': ref['location'], 'sha256': source['sha256'],
    }


rows = {(row['fiscalYear'], row['metric'], row['geography']): row for row in exports}
assert len(rows) == len(exports)
for year, period in periods.items():
    for field, key, section in [
        ('cumulativeRegistrations', 'cumulative-registrations', 'register'),
        ('activeAtReportCutoff', 'active-at-report-cutoff', 'register'),
        ('annualReportsSubmitted', 'annual-reports-submitted', 'filed'),
        ('auditedAccountsSubmitted', 'audited-accounts-submitted', 'audited'),
    ]:
        verify(year, key, 'Kenya', period[field], 'count', section)
    verify(year, 'total-reported-receipts', 'All sources', period['receiptsKES'], 'KES', 'receipts')
    origins = period['receiptOriginsKES']
    assert len(origins) == 7
    assert Decimal(period['receiptsKES']) - sum(map(Decimal, origins.values())) == Decimal(period['receiptOriginsDifferenceKES'])
    for region, value in origins.items():
        verify(year, 'reported-receipts-by-source-region', region, value, 'KES', 'origins')
    verify(year, 'published-receipts-minus-sum-of-regions', 'All sources', period['receiptOriginsDifferenceKES'], 'KES', 'origins')

expenditure = data['expenditure']
year = expenditure['fiscalYear']
assert year == '2024/25' and len(expenditure['rows']) == 9
assert expenditure['rows'][-1]['totalKES'] == '226665856599.53'
assert next(line for line in expenditure['rows'] if line['category'] == 'administration')['outsideKenyaKES'] is None
for line in expenditure['rows']:
    for key, geography in [('inKenyaKES', 'Kenya'), ('outsideKenyaKES', 'Outside Kenya'), ('totalKES', 'All places')]:
        verify(year, line['category'], geography, line[key], 'KES', 'expenditure')
verify(year, 'project-cost-sector-table-total', 'Kenya', expenditure['sectorTableProjectTotalInKenyaKES'], 'KES', 'sectorProjectTotal')
assert not rows
print('Kenya coverage: three reporting periods, 67 exact financial CSV observations and 15,292 public directory rows verified.')
