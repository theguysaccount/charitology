"""Rebuild Hokkaido award and food-hardship observations from five pinned PDFs."""
import json
import re
import sys
import unicodedata
from hashlib import sha256
from pathlib import Path

import pypdfium2


CFA = 'https://kodomonomiraiouen.cfa.go.jp/assets/contents/wp-content/uploads/'
SOURCES = {
    'selection2022': ('selection-2022.pdf', CFA + '2022/03/net_kekka6.pdf',
                      '50a6d244b9865727fa354a778ced127c829b6b731d1b0fcb1b52c2bfebb17f91'),
    'awards2022': ('support-2022.pdf', CFA + '2024/04/r4_6_kikin_report.pdf',
                   '7ae4476797810fee49165dff3edac6c1cb633334d3a9d9b2a7128ecbd1c9c2bd'),
    'selection2023': ('selection-2023.pdf', 'https://www.wam.go.jp/hp/wp-content/uploads/miraiouen_r5_saitaku.pdf',
                      '1921124371b48411a9d79a8d2596f22b47a255dff43afd932cfef2ce7c8a6b60'),
    'awards2023': ('support-2023.pdf', CFA + '2025/04/kikin_r5report_web.pdf',
                   '3b27d968321d6389972a436e2f0c355a54ae32a36d68a927074856321dfde546'),
    'need2022': ('survey-2022.pdf', 'https://www.pref.hokkaido.lg.jp/fs/8/8/6/7/3/5/5/_/2022_hitorioya_houkokusyo.pdf',
                 'cc175a245cf6b50d1ee9c8d5a4a40107e5c21ea6d3cad3aa2f72c965f968849e'),
}
CONTEXT = {
    'fundArchive': 'https://kodomonomiraiouen.cfa.go.jp/support/network/archive',
    'prefecturalActivity': 'https://www.pref.hokkaido.lg.jp/hf/kms/st/182714.html',
    'fundProject': 'https://kodomonomiraiouen.cfa.go.jp/support/various_places/1-yumemiru-7',
}

# Boxes in the two pinned A4 tables, measured at 1.65 pixels per PDF point.
TABLES = {
    '2022': {'page': 14, 'columns': (140, 360, 397), 'edges': [333, 366, 399, 432, 465, 498, 531, 564]},
    '2023': {'page': 18, 'columns': (136, 464, 501), 'edges': [323, 367, 398, 442, 487, 518, 547, 591, 636, 666]},
}


def document(inputs, key):
    filename, _, digest = SOURCES[key]
    path = inputs / filename
    if sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError(f'Unexpected capture for {filename}.')
    return pypdfium2.PdfDocument(path)


def name_key(value):
    normalized = unicodedata.normalize('NFKC', value)
    without_prefix = re.sub(r'^(?:NPO法人|公益財団法人)\s+', '', normalized.strip())
    return re.sub(r'[\s★]+', '', without_prefix)


def selections(inputs, year):
    found = {}
    with document(inputs, 'selection' + year) as source:
        for page_number, page in enumerate(source, 1):
            lines = page.get_textpage().get_text_range().splitlines()
            for line in lines:
                if year == '2022':
                    match = re.fullmatch(r'(.+?)\s+北海道\s+[アイウエオカキ]', line)
                    if not match:
                        continue
                    name, selection_number, corporate_number = match[1], None, None
                else:
                    match = re.match(r'([0-9]+)\s+事業[AB]\s+\S+\s+北海道\s+'
                                     r'(?:公益財団法人|NPO法人|任意団体)\s+(.+?)\s+([0-9]{13}|-)(?:\s|$)', line)
                    if not match:
                        continue
                    name, selection_number = match[2], int(match[1])
                    corporate_number = None if match[3] == '-' else match[3]
                key = name_key(name)
                if key in found:
                    raise ValueError(f'The same selection name occurs more than once in {year}.')
                found[key] = {'page': page_number, 'number': selection_number, 'corporateNumber': corporate_number}
    expected = 7 if year == '2022' else 9
    if len(found) != expected:
        raise ValueError(f'The {year} Hokkaido selection table did not match its expected shape.')
    return found


def awards(inputs, year):
    selected = selections(inputs, year)
    table = TABLES[year]
    result = []
    used = set()
    with document(inputs, 'awards' + year) as source:
        page = source[table['page'] - 1]
        height = page.get_height()
        text = page.get_textpage()
        page_text = re.sub(r'\s+', '', text.get_text_range())
        if '支援金額:採択決定時の金額' not in unicodedata.normalize('NFKC', page_text):
            raise ValueError(f'The {year} amount definition changed.')
        left, category, right = table['columns']

        def cell(x1, x2, y1, y2):
            raw = text.get_text_bounded(x1 / 1.65, height - y2 / 1.65, x2 / 1.65, height - y1 / 1.65)
            return raw.replace('\r', '').replace('\n', ' ').strip()

        for row, (top, bottom) in enumerate(zip(table['edges'], table['edges'][1:]), 1):
            name = cell(left + 2, category - 2, top + 1, bottom - 1)
            category_text = cell(category + 2, right - 2, top + 1, bottom - 1)
            tag = unicodedata.normalize('NFKC', category_text)
            category_number = ('❶❷❸❹❺❻'.index(tag) + 1) if len(tag) == 1 and tag in '❶❷❸❹❺❻' else int(tag)
            amount = int(cell(859, 913, top + 1, bottom - 1).replace(',', ''))
            key = name_key(name)
            if not name or category_number not in range(1, 7) or amount <= 0 or key in used:
                raise ValueError(f'Invalid award table row {row} in {year}.')
            used.add(key)
            result.append({'rowWithinHokkaido': row, 'recipientLabel': name, 'category': category_number,
                           'awardAtSelectionJPYThousands': amount, 'awardTablePdfPage': table['page'],
                           'selection': selected.get(key)})
    return {'periodStart': year + '-04-01', 'periodEnd': str(int(year) + 1) + '-03-31',
            'selectionRowsListed': len(selected), 'awards': result}


def need(inputs):
    with document(inputs, 'need2022') as source:
        method = source[6].get_textpage().get_text_range()
        responses = source[7].get_textpage().get_text_range()
        table = source[31].get_textpage().get_text_range()
    compact = lambda value: re.sub(r'\s+', '', value)
    if not all(item in compact(method) for item in ('札幌市を除く', '令和4年8月1日～8月31日', '児童扶養手当')):
        raise ValueError('Unexpected 2022 survey geography, population or field dates.')
    counts = re.search(r'調査票配布数は\s*([0-9]+)、回収数は\s*([0-9]+)\s*で、回収率\s*([0-9.]+)％', responses)
    if not counts or '食料を買えなかっ' not in table:
        raise ValueError('Unexpected 2022 survey response count or table wording.')
    labels = ('母子世帯', '母子+祖父母世帯', '父子世帯', '父子+祖父母世帯')
    rows = []
    for name in labels:
        pattern = r'^' + re.escape(name) + r'\s+(\d+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)'
        values = re.search(pattern, table, re.MULTILINE)
        rows.append({'householdLabel': name, 'sampleSize': int(values[1]),
                     **dict(zip(('oftenPercent', 'sometimesPercent', 'rarelyPercent', 'neverPercent', 'missingPercent'), values.groups()[1:]))})
    return {'surveyStart': '2022-08-01', 'surveyEnd': '2022-08-31',
            'geography': 'Hokkaido excluding Sapporo', 'mailedQuestionnaires': int(counts[1]),
            'receivedQuestionnaires': int(counts[2]), 'responseRatePercent': counts[3],
            'methodPdfPage': 7, 'responseRatePdfPage': 8, 'observationsPdfPage': 32, 'printedTable': '3-2', 'rows': rows}


def build(inputs, output):
    report = {'format': 'charitology-hokkaido-child-support-v1', 'currency': 'JPY', 'awardStage': 'amount-at-selection',
              'sources': {key: {'file': filename, 'url': url, 'sha256': digest}
                          for key, (filename, url, digest) in SOURCES.items()},
              'contextSources': CONTEXT, 'funding': {year: awards(inputs, year) for year in TABLES}, 'need': need(inputs)}
    with output.open('x', encoding='utf-8') as file:
        file.write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 scripts/build-hokkaido-child-support.py <captures> <new-output.json>')
    build(Path(sys.argv[1]), Path(sys.argv[2]))
