"""Build the Kenya coverage edition from three pinned PBORA reports.

Use pypdfium2 5.14.0 to read the source pages. The output retains the
publisher's totals, including differences between breakdowns and totals.
"""
import argparse
import json
import re
from decimal import Decimal
from hashlib import sha256
from pathlib import Path

from pypdfium2 import PdfDocument


SOURCES = (
    ('2022/23', 'sector-2022-23.pdf', 'Annual NGO Sector Report 2022/2023',
     'https://www.pbora.go.ke/sites/default/files/2025-09/Annual%20NGOS%20Sector%20Report%202022-2023.pdf',
     '5cad202ff1e16f78522879a6f51c8fc1f30591c604182524a59623185a469a4c',
     {'register': (17, 17, 'Table 2.1'), 'filed': (18, 18, 'Section 2.2'), 'audited': (18, 18, 'Section 2.2'),
      'receipts': (59, 59, 'Table 4.1'), 'origins': (60, 60, 'Table 4.2')}),
    ('2023/24', 'sector-2023-24.pdf', 'Annual PBO Sector Report 2023/2024',
     'https://pbora.go.ke/sites/default/files/publications/Annual%20PBO%20Sector%20Report%202023-2024_0.pdf',
     'c06d7e8eb478ffb1600887358ccb47a730940d47160c537360a904505a4f166f',
     {'register': (21, 5, 'Table 1'), 'filed': (21, 5, 'Section 2.3.1'), 'audited': (22, 6, 'Section 2.3.2'),
      'receipts': (52, 36, 'Table 11'), 'origins': (55, 39, 'Table 12')}),
    ('2024/25', 'sector-2024-25.pdf', 'Annual PBO Sector Report 2024/2025',
     'https://www.pbora.go.ke/sites/default/files/2026-04/PBO%20SECTOR%20REPORT%202024-2025-Cmprsd.pdf',
     '08b4d70998ccff80835b5d41d99110a76f37c6548659af6bee27f50574f783c4',
     {'register': (26, 12, 'Table 1'), 'filed': (26, 12, 'Section 3.3'), 'audited': (27, 13, 'Section 3.3'),
      'receipts': (41, 27, 'Table 7'), 'origins': (42, 28, 'Table 8'), 'expenditure': (44, 30, 'Table 9'),
      'sectorProjectTotal': (31, 17, 'Table 2')}),
)
REGIONS = ('Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America', 'Unspecified')
EXPENSE_LINES = {
    'project-cost': 'Project cost',
    'local-office-staff': 'Office personnel – local staff',
    'assets': 'Purchase of tangible assets',
    'international-office-staff': 'Office personnel – international staff',
    'administration': 'Administration expenses',
    'other-running-cost': 'Other running cost',
    'local-program-staff': r'Programme personnel emoluments & benefits \(local staff\)',
    'international-program-staff': r'Programme personnel emoluments & benefits \(international staff\)',
    'all-expenditure': 'TOTAL',
}
MONEY = r'[0-9][0-9,]*\.[0-9]{2}'
COUNT = r'([0-9][0-9,]*)'


def page_text(pdf, index):
    page = pdf[index - 1]
    text = page.get_textpage()
    try:
        return text.get_text_range().replace('\r\n', '\n')
    finally:
        text.close()
        page.close()


def groups(text, pattern):
    matches = re.findall(pattern, text, re.I | re.M)
    if len(matches) != 1:
        raise ValueError(f'Expected one match for {pattern}, found {len(matches)}.')
    return matches[0]


def number(value):
    return value.replace(',', '')


def expense_rows(text):
    table = text.split('Table 9: Expenditure Breakdown')[1].split('Figure 15:')[0]
    table = ' '.join(table.split())
    cell = f'({MONEY}|-)'
    rows = []
    for key, label in EXPENSE_LINES.items():
        in_kenya, outside, total = groups(table, f'{label} {cell} {cell} {cell}')
        rows.append({'category': key, 'inKenyaKES': number(in_kenya),
                     'outsideKenyaKES': None if outside == '-' else number(outside), 'totalKES': number(total)})
    for row in rows:
        assert Decimal(row['inKenyaKES']) + Decimal(row['outsideKenyaKES'] or '0') == Decimal(row['totalKES'])
    for column in ('inKenyaKES', 'outsideKenyaKES', 'totalKES'):
        assert sum(Decimal(row[column] or '0') for row in rows[:-1]) == Decimal(rows[-1][column])
    return rows


def build(captures):
    periods = []
    spending = None
    for year, name, title, url, sha, refs in SOURCES:
        path = captures / name
        digest = sha256()
        with path.open('rb') as raw:
            for block in iter(lambda: raw.read(1_048_576), b''):
                digest.update(block)
        if digest.hexdigest() != sha:
            raise ValueError(f'Source bytes changed for {name}.')
        with PdfDocument(path) as pdf:
            pages = {page: page_text(pdf, page) for page in sorted({row[0] for row in refs.values()})}
        texts = {key: pages[page] for key, (page, _, _) in refs.items()}
        total = number(groups(texts['receipts'], rf'^TOTAL\s+({MONEY})'))
        if periods:
            prior = number(groups(texts['receipts'], rf'^TOTAL\s+{MONEY}\s+(?:100\s+)?({MONEY})'))
            assert prior == periods[-1]['receiptsKES']
        geographic_total = number(groups(texts['origins'], rf'^[ \t]*Total[ \t]+({MONEY})[ \t]*$'))
        assert geographic_total == total
        origins = {region: number(groups(texts['origins'], rf'^[ \t]*{region}[ \t]+({MONEY})[ \t]*$')) for region in REGIONS}
        delta = Decimal(total) - sum(map(Decimal, origins.values()))
        register = texts['register']
        filed = ' '.join(texts['filed'].split())
        audited = ' '.join(texts['audited'].split())
        periods.append({
            'fiscalYear': year,
            'cumulativeRegistrations': int(number(groups(register, rf'^Number of registered (?:NGOs|PBOs)\s+{COUNT}'))),
            'activeAtReportCutoff': int(number(groups(register, rf'^Active (?:NGOs|PBOs)\s+{COUNT}'))),
            'annualReportsSubmitted': int(number(groups(filed, rf'A total of {COUNT} (?:organisations|PBOs) (?:filed|submitted) their annual'))),
            'auditedAccountsSubmitted': int(number(groups(audited, rf'a total of {COUNT} (?:organisations|PBOs) submitted their audited accounts'))),
            'receiptsKES': total,
            'receiptOriginsKES': origins,
            'receiptOriginsDifferenceKES': str(delta),
            'source': {'title': title, 'url': url, 'file': name, 'sha256': sha,
                       'references': {key: {'pdfPage': page, 'printedPage': printed, 'location': label} for key, (page, printed, label) in refs.items()}},
        })
        if 'expenditure' in texts:
            spending = {'fiscalYear': year, 'rows': expense_rows(texts['expenditure']),
                        'sectorTableProjectTotalInKenyaKES': number(groups(texts['sectorProjectTotal'], rf'^Total\s+({MONEY})\s+100'))}
    assert spending is not None
    return {'edition': '2026-11-11', 'jurisdiction': 'Kenya', 'currency': 'KES',
            'publisher': 'Public Benefit Organizations Regulatory Authority and its predecessor',
            'scope': 'Sector report aggregates for each report year. Receipts, origin breakdowns and expenditure are separate views.',
            'periods': periods, 'expenditure': spending}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('captures', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.write_text(json.dumps(build(args.captures), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
