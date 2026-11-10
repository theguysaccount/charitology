"""Build the fixed Greater Manchester case from six original public downloads."""
import csv
import io
import json
import sys
from calendar import monthrange
from datetime import date, datetime
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile

from openpyxl import load_workbook

ROOT = Path(sys.argv[1])
OUTPUT = Path(sys.argv[2])
OGL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'
NHS_DOWNLOADS = 'https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2023/10/'
SOURCES = [
    ('awards', '10gm-awards.xlsx', '624c738d6dfa353e9985236c7dd0a087351a76df4add53beb951607c1240d4ce',
     'https://10gm.org.uk/wp-content/uploads/2024/09/10GM-Targeted-InvestmentFundGrantRecipientsv1_360Givingdata.xlsx',
     '10GM', 'https://creativecommons.org/licenses/by/4.0/'),
    ('register', 'charity-register.zip', '9457e2d45addfbeac7e3689c8cb5999edb1fa77c672b3bf0eef1459da86a0c24',
     'https://ccewuksprdoneregsadata1.blob.core.windows.net/data/txt/publicextract.charity.zip',
     'Charity Commission for England and Wales', OGL),
    ('2022-12', 'December2022.xlsx', '06d6b2d80505f8ee41732e16e5457db9583b56c3d63184b7799e346f31a30c27',
     NHS_DOWNLOADS + 'Daily-discharge-sitrep-monthly-data-webfile-December2022-revised.xlsx', 'NHS England', OGL),
    ('2023-01', 'January2023.xlsx', '261478c58345e01a0fed67e747265002e61f616c3a3c5f9189aef3ae42cb2c4f',
     NHS_DOWNLOADS + 'Daily-discharge-sitrep-monthly-data-webfile-January2023-revised.xlsx', 'NHS England', OGL),
    ('2023-02', 'February2023.xlsx', 'd9c34b3a2b94221417b68628661259a95ab97a5b69b041129d337264e6752732',
     NHS_DOWNLOADS + 'Daily-discharge-sitrep-monthly-data-webfile-February2023-revised.xlsx', 'NHS England', OGL),
    ('2023-03', 'nhs-discharge-march2023.xlsx', 'a41dc2d93da2c34f3f1a7633020d25e578cd4462e5ae4bf58e7d97aabb4572b7',
     NHS_DOWNLOADS + 'Daily-discharge-sitrep-monthly-data-webfile-March2023-revised.xlsx', 'NHS England', OGL),
]


def register_names(ids):
    names = {}
    with ZipFile(ROOT / 'charity-register.zip') as archive:
        with archive.open('publicextract.charity.txt') as raw:
            rows = csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''),
                                  delimiter='\t', quoting=csv.QUOTE_NONE)
            for row in rows:
                number = row['registered_charity_number']
                if number in ids and row['linked_charity_number'] == '0':
                    assert number not in names
                    names[number] = row['charity_name']
    return names


def awards():
    workbook = load_workbook(ROOT / '10gm-awards.xlsx', read_only=True, data_only=True)
    sheet = workbook.active
    rows = iter(sheet.values)
    header = [str(cell).strip() for cell in next(rows)]
    names = ['Identifier', 'Currency', 'Amount Awarded', 'Award Date', 'Recipient Org:Name',
             'Recipient Org:Identifier', 'Funding Org:Identifier', 'Beneficiary Location:Name']
    indices = [header.index(name) for name in names]
    result = []
    for row_number, row in enumerate(rows, 2):
        if not row[0]:
            continue
        identifier, currency, amount, awarded, name, recipient, funder, location = [row[i] for i in indices]
        assert currency == 'GBP' and funder == '360G-10GM' and isinstance(awarded, datetime)
        result.append({'id': identifier, 'recipient': name.strip(), 'recipientId': recipient.strip(),
                       'amountGBP': int(str(amount).strip()), 'awardDate': awarded.date().isoformat(),
                       'publishedLocation': location.strip(), 'sourceRow': row_number})
    workbook.close()
    assert len({row['id'] for row in result}) == len(result) == 9
    assert sum(row['amountGBP'] for row in result) == 178689
    registrations = {row['recipientId'].removeprefix('GB-CHC-') for row in result if row['recipientId'].startswith('GB-CHC-')}
    matches = register_names(registrations)
    for row in result:
        row['registerName'] = matches.get(row['recipientId'].removeprefix('GB-CHC-'))
    return result


def need(month, file_name):
    workbook = load_workbook(ROOT / file_name, read_only=True, data_only=True)
    sheet = workbook['Table 2']
    rows = list(sheet.values)
    indexed = [(i, row) for i, row in enumerate(rows, 1) if row[2] == 'QOP']
    assert len(indexed) == 1 and indexed[0][1][3] == 'NHS GREATER MANCHESTER INTEGRATED CARE BOARD'
    source_row, row = indexed[0]
    daily = []
    for column, label in enumerate(rows[4]):
        if not isinstance(label, str) or not label.startswith('Number of patients remaining in hospital who no longer meet'):
            continue
        day, value = rows[3][column - 2], row[column]
        assert isinstance(day, datetime) and isinstance(value, int) and value >= 0
        daily.append({'date': day.date().isoformat(), 'remaining': value, 'column': column + 1})
    workbook.close()
    year, month_number = map(int, month.split('-'))
    assert [row['date'] for row in daily] == [
        date(year, month_number, day).isoformat() for day in range(1, monthrange(year, month_number)[1] + 1)]
    return {'month': month, 'sheet': 'Table 2', 'sourceRow': source_row, 'daily': daily}


for _, file_name, digest, *_ in SOURCES:
    assert sha256((ROOT / file_name).read_bytes()).hexdigest() == digest, f'Unexpected source bytes: {file_name}'

data = {
    'edition': 'greater-manchester-home-from-hospital-2026-11-10',
    'capturedOn': '2026-11-10',
    'sources': {key: {'url': url, 'sha256': digest, 'publisher': publisher, 'license': license}
                for key, _, digest, url, publisher, license in SOURCES},
    'awards': awards(),
    'need': [need(month, file_name) for month, file_name, *_ in SOURCES[2:]],
}
OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
