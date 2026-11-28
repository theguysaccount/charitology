"""Build the Wave 1d verified charity dossier dataset from official registry downloads.

Wave 1c skipped five national registers because the committed editions could
not show their figures exactly as published (Israel, Estonia, Italy, Hungary)
or could not separate charities from political parties (Slovenia). Wave 1d goes
back to each official source, keeps a compact extract of exactly the published
cells it needs, and builds dossiers from that extract:

  * Israel: Registrar of Amutot dataset on data.gov.il (datastore API, every
    page recorded), revenue copied with its published decimals.
  * Estonia: e-Business Register (RIK) annual report open data and the Tax and
    Customs Board (EMTA) list of associations eligible for income tax incentives.
  * Italy: Agenzia delle Entrate's 5 per mille AF 2025 list of admitted
    beneficiaries (seven CSV parts), one row per entity, never merged.
  * Hungary: NAV lists of civil beneficiaries of the 1% personal income tax
    assignment, 2024 to 2026.
  * Slovenia: FURS lists of recipients of the income-tax donation, 2023 to
    2025, restricted to section 1 (non-governmental organizations in the public
    interest) of the Government's 2025 list of eligible recipients.

Every figure is copied exactly as the official file publishes it. A blank cell
is null and is shown as "Not supplied", never as zero. Nothing is estimated,
scored, ranked, rated, summed or merged.

Usage:
  python3 -I scripts/build-registry-wave1d.py --sources DIR
      Verifies every raw download in DIR (il/, ee/, it/, hu/, si/) against the
      pinned URL, size and SHA-256 below, writes the compact extracts under
      public/data/registry-wave1d/extracts/, then builds the dataset.
  python3 -I scripts/build-registry-wave1d.py
      Rebuilds the dataset from the committed extracts only.
  python3 -I scripts/build-registry-wave1d.py --sources DIR --verify
      Rebuilds the extracts and dataset in memory and fails unless every file
      equals the committed copy byte for byte.

scripts/check-registry-wave1d.mjs re-derives every selection, figure, hub and
cause match from the committed extracts and verifies the built pages.
"""
import argparse
import csv
import gzip
import io
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from decimal import Decimal
from hashlib import sha256
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/data/registry-wave1d'
EDITION = '2026-11-28'
HUB_MIN = 5

# One published-figure threshold per register, in the register's own unit.
THRESHOLDS = {
    'il': {'line': 'revenue', 'value': '50000000.00', 'currency': 'ILS'},
    'ee': {'line': 'TotalRevenue', 'value': '500000', 'currency': 'EUR'},
    'it': {'line': 'total', 'value': '150000.00', 'currency': 'EUR'},
    'hu': {'line': 'amount', 'value': '10000000', 'currency': 'HUF'},
    'si': {'line': 'amount', 'value': '10000.00', 'currency': 'EUR'},
}
KEYS = ['il', 'ee', 'it', 'hu', 'si']

# ---------- Pinned official downloads (verified before anything is read) ----------
IL_RESOURCE = 'be5b7935-3922-45d4-9638-08871b17ec95'
IL_API = f'https://data.gov.il/api/3/action/datastore_search?resource_id={IL_RESOURCE}&limit=10000&offset={{offset}}&sort=_id%20asc'
IL_PAGES = [
    (0, 12143226, '538012603f56a03491994aa0b6e4240e444a79ee5913cf6975c2c5aa226ce953', '2026-11-28T05:15:17Z'),
    (10000, 11872795, '9424e5dfcaf886db1fab794877521bf068fda800b2f8a65ba2a414d67b9a95f8', '2026-11-28T05:15:20Z'),
    (20000, 12216155, 'da906be6ac8615d102c4c00de23dd44c33fdec0d8fb9e663f13f374f9d5b7826', '2026-11-28T05:15:23Z'),
    (30000, 12655713, 'bad81ec96ede5dfa3430ef7df8d80469bf16dda1cfb36b49052e98574da04523', '2026-11-28T05:15:26Z'),
    (40000, 13503838, '3785203bb52720fc9acb8cf0a396941287c8e82a2ad41009169d72a4629b6070', '2026-11-28T05:15:29Z'),
    (50000, 14911095, '5c3cfa1f0daad456c5766b33937d2932c62b72c92d475eed3c37da561e34e968', '2026-11-28T05:15:32Z'),
    (60000, 14633892, '194cde9a4152287cdb12b1bb8cbd6759199a6b23169c592cc03afc4586eb9959', '2026-11-28T05:15:34Z'),
    (70000, 8726812, 'c65840d0a86c79d9a3c2f546404a4db99e2dd88fa7c26e47431b320a86d753fe', '2026-11-28T05:15:36Z'),
]
RIK = 'https://avaandmed.ariregister.rik.ee/sites/default/files/'
EE_FILES = {
    'reports': ('1.aruannete_yldandmed_kuni_31102026_1.zip', RIK + '1.aruannete_yldandmed_kuni_31102026_1.zip', 20820793,
                '75e453763b7d415aca46662021bbd2ca5a540e2474f4e608f4013648d5a5b2aa', '2026-11-28T05:16:50Z',
                'e-Business Register annual reports general data through 31 October 2026 (aruannete üldandmed)'),
    'elements2025': ('4.2025_aruannete_elemendid_kuni_31102026_0.zip', RIK + '4.2025_aruannete_elemendid_kuni_31102026_0.zip', 22975534,
                     '1fb22c4c24ad5047ec60b62acbaba032328a33375d7bc959816eea60543484f1', '2026-11-28T05:16:52Z',
                     'e-Business Register 2025 annual report elements through 31 October 2026 (aruannete elemendid)'),
    'elements2024': ('4.2024_aruannete_elemendid_kuni_31102026_0.zip', RIK + '4.2024_aruannete_elemendid_kuni_31102026_0.zip', 23708371,
                     '1cd37dbcd03ef39e17e3d416c55ac057f1e438182c8a5ea186bd1aa086ae0293', '2026-11-28T05:16:54Z',
                     'e-Business Register 2024 annual report elements through 31 October 2026 (aruannete elemendid)'),
    'entities': ('ettevotja_rekvisiidid__lihtandmed.csv.zip', 'https://avaandmed.ariregister.rik.ee/sites/default/files/avaandmed/ettevotja_rekvisiidid__lihtandmed.csv.zip',
                 18719049, 'ab47a055fb021c79f6ff1cf712cd8d345e4cdef54066239c6e364414f415b680', '2026-11-28T05:16:56Z',
                 'e-Business Register basic entity data (ettevõtja rekvisiidid, lihtandmed CSV)'),
    'emta': ('emta-active.pdf', 'https://ncfailid.emta.ee/s/69dm4GRbczHFbWQ/download', 930216,
             '22734d3846be7f4d19559eca5fc826660ee0f05640c5e295590ff639216e0408', '2026-11-28T05:26:55Z',
             'EMTA list of non-profit associations, foundations and religious associations eligible for income tax incentives, as of 1 November 2026'),
}
ADE = 'https://www.agenziaentrate.gov.it/portale/documents/20143/10453418/5x1000+AF+2025+-+Elenco+destinatari+ammessi+al+contributo+-+'
IT_PARTS = [
    (1, ADE + '1+-+agg.+5.11.2026.csv/54646b38-af11-1a58-37a0-edef2af7d9dd?t=1793882444569', 1706716, '280559352c8e65eb83817d11fe8518d3cbd7dcffc9d640365b29f9d3673645c7', '2026-11-28T05:19:08Z'),
    (2, ADE + '2+-+agg.+5.11.2026.csv/1b22fa0e-4a60-33d1-b689-703afcfa112e?t=1793882440586', 1684157, '824db54feed40d57bc745648ae27f4c1f91816c6f6de1e4a7366101dc65bc15a', '2026-11-28T05:19:09Z'),
    (3, ADE + '3+-+agg.+5.11.2026.csv/bbd82d26-3a3f-4acf-afc2-4afba3640647?t=1793882436557', 1668959, '0c2dc956bd364c4cf26f0304156871a921ffe0053609f25a36fb6f18176b8a57', '2026-11-28T05:19:11Z'),
    (4, ADE + '4+-+agg.+5.11.2026.csv/7ecb6433-1b64-5b5f-2d6b-e42b6dcca4e0?t=1793882432562', 1604614, '37ebd8b5e011da428cbd397c1a5fbe14a5b64f0a06c13f0f347854dee43f2378', '2026-11-28T05:19:12Z'),
    (5, ADE + '5+-+agg.+5.11.2026.csv/81c4dde3-d5d1-3187-ca45-d563d09761e1?t=1793882428552', 1571915, '0eff35cbfbcb435a100899f196422849c32c8d0f714802aa22a153ac66a920f9', '2026-11-28T05:19:14Z'),
    (6, ADE + '6+-+agg.+5.11.2026.csv/b4624ada-6dcf-7413-daf3-4a2e3a586a2f?t=1793882424612', 1421613, '79400d13b5d5eab8a1875083c49b1dec116d07c0a2a3b5bd5f6de22396860aef', '2026-11-28T05:19:16Z'),
    (7, ADE + '7+-+agg.+5.11.2026.csv/0f662a18-8e5e-d5b7-1d9d-c083dae73113?t=1793882420613', 1247007, '8c050b7f4007ff7d2a6b31b1d37ef9b5c9b313061503a31af344aefe993e2e66', '2026-11-28T05:19:17Z'),
]
IT_LEGEND_PDF = (ADE + '1+-+agg.+5.11.2026.pdf/4f9cb390-1d40-0a07-a69e-30060f3a7660?t=1793882442581', 3065202,
                 'adac1e0eb5c9fa3ee86417c0158b76d37681e1f177e785fb07db9c8b5005aab5', '2026-11-28T05:32:33Z')
NAV = 'https://nav.gov.hu/pfile/file?path=/ado/szja1_1/kimutatasok_elszamolasok/civil-szervezetek/'
HU_FILES = {
    2024: (NAV + 'egyszaz_kiut_2024/Szja_1-os_felajanlasban_reszesult_regisztralt_civil_kedvezmenyezettek_2024.xlsx1', 3350491,
           'fa7d757d575bcd685e0d3a24be019b53ad554d3b65110989daa7c589d25be066', '2026-11-28T05:24:42Z'),
    2025: (NAV + 'egyszaz_kiut_2025/Szja_1-os_felajanlasban_reszesult_regisztralt_civil_kedvezmenyezettek_2025xlsx1', 2655679,
           '60381eaa63b164de34f5b31a10e1e012eb7861fa3ffa2f17671a02111508109a', '2026-11-28T05:22:47Z'),
    2026: (NAV + 'egyszaz_kiut_2026/Szja_1-os_felajanlasban_reszesult_regisztralt_civil_kedvezmenyezettek_2026.xlsx', 2659767,
           'f1f128ebe14e328ef9a04be327ae738cf969abd1b14db2cdc183ae2528e96b85', '2026-11-28T05:24:02Z'),
}
FU = 'https://www.fu.gov.si/fileadmin/Internet/Davki_in_druge_dajatve/Podrocja/Dohodnina/Letna_odmera_dohodnine/'
SI_FILES = {
    2023: ('https://podatki.gov.si/dataset/3ea7706b-4385-4460-aba6-a2ab7ff0922d/resource/0a0d030a-efe6-4461-9d7d-a16e61c010da/download/seznamprejemnikovzaleto2023preliminarnipodatki.xlsx',
           324234, 'a62efe716777c46df3c227463995a6aefa15b8765e7e1c58e4f621315c7a2329', '2026-11-28T05:30:16Z'),
    2024: (FU + 'Opis/Seznam_prejemnikov_za_leto_2024-preliminarni_podatki.xlsx', 329923,
           '3414cde30f701fadffaea1f9998a393445ca0d1b89cea1a7afa6fe726a2e4145', '2026-11-28T05:30:18Z'),
    2025: (FU + 'Opis/Seznam_prejemnikov_za_leto_2025-preliminarni_podatki.xlsx', 332464,
           'e047e1d646c62ef591d934e7e53077954a904079798b598fe04f78865a8eb1a6', '2026-11-28T05:23:39Z'),
}
SI_LIST = (FU + 'Zakonodaja/Seznam_upravicencev_do_donacij_2025.pdf', 3093967,
           '66de9e4e08f09161310489f44d03888b4f4ae4ba19a1bd86cdd33a5a647ba689', '2026-11-28T05:25:39Z')
# Sections of the Government's list of eligible recipients for 2025 (Uradni list RS 70/2025, annex), as headed in the list.
SI_SECTIONS = {
    1: 'Nevladne organizacije v javnem interesu',
    2: 'Registrirane cerkve in druge verske skupnosti',
    3: 'Sestavni deli registriranih cerkva in drugih verskih skupnosti',
    4: 'Reprezentativni sindikati',
    5: 'Politične stranke',
    6: 'Šole in vrtci',
}
SI_HEADINGS = [
    (1, r'1\. NEVLADNE ORGANIZACIJE V JAVNEM INTERESU'),
    (2, r'2\. REGISTRIRANE CERKVE IN DRUGE VERSKE'),
    (3, r'3\. SESTAVNI DELI REGISTRIRANIH CERKVA IN DRUGIH'),
    (4, r'4\. REPREZENTATIVNI SINDIKATI'),
    (5, r'5\. POLITI.?NE STRANKE'),
    (6, r'6\. ŠOLE IN VRTCI'),
]
SI_INCLUDED_SECTION = 1

# Israel datastore fields kept in the extract, in this order (field names as published).
IL_KEEP = ['מספר עמותה', 'תאריך רישום עמותה', 'שם עמותה בעברית', 'שם עמותה באנגלית', 'סטטוס עמותה', 'סיווג פעילות ענפי',
           'תחום פעילות משני', 'שנת דיווח דוח כספי אחרון', 'מחזור כספי (הכנסות)', 'סך הוצאות העמותה', 'שנת דיווח אחרונה', 'כתובת - ישוב']
IL_REVENUE, IL_EXPENSES, IL_STATUS, IL_SECTOR = 'מחזור כספי (הכנסות)', 'סך הוצאות העמותה', 'סטטוס עמותה', 'סיווג פעילות ענפי'
IL_INCLUDED_STATUSES = ['פעילה', 'רשומה']
# Estonian annual report lines shown in a dossier: (key, table group, XBRL element).
EE_INCOME_TABLES = ['Tulemiaruanne']
EE_BALANCE_TABLES = ['Bilanss', 'Bilanss, detailne', 'Bilanss, kasvava likviidsuse järjekorras']
EE_LINES = [('TotalRevenue', 'income'), ('BusinessIncome', 'income'), ('SurplusDeficitFromOperatingActivities', 'income'),
            ('NetSurplusDeficitForPeriod', 'income'), ('Assets', 'balance'), ('NetAssets', 'balance')]
EE_YEARS = ['2025', '2024']
IT_CATEGORY_COLUMNS = list(range(6, 13))
IT_AMOUNT_COLUMNS = {'choices': 13, 'expressed': 14, 'generic': 15, 'under100': 16, 'total': 17}
IT_LEGEND = ('R: ente ex ONLUS che ha presentato istanza di iscrizione al RUNTS entro il termine del 31.03.2026, ammesso con riserva sino '
             'all\'esito della procedura amministrativa di iscrizione al RUNTS')

# ---------- Cause groups: the Wave 1b stems, unchanged, plus stems for Hebrew and Italian labels ----------
WAVE1B_STEMS = [
    ('education', 'Education', ['educat', 'teaching', 'school']),
    ('health', 'Health', ['health']),
    ('religion', 'Religion and faith', ['religio', 'christian', 'islam', 'judaism', 'faith']),
    ('poverty', 'Poverty relief', ['poverty']),
    ('environment', 'Environment', ['environment']),
    ('animals', 'Animals', ['animal']),
    ('arts-culture', 'Arts and culture', ['arts', 'cultur']),
    ('rights', 'Human and civil rights', ['rights']),
    ('sport-recreation', 'Sport and recreation', ['sport', 'recreation']),
    ('community', 'Community development', ['community']),
    ('housing', 'Housing and shelter', ['housing', 'shelter', 'accommodation']),
    ('science-research', 'Science and research', ['scien', 'research']),
    ('disability', 'Disability', ['disab']),
    ('international', 'Overseas and international', ['overseas', 'international', 'foreign']),
    ('safety', 'Safety and saving lives', ['safety', 'security', 'saving of lives']),
    ('food-agriculture', 'Food and agriculture', ['food', 'agricultur', 'nutrition']),
    ('employment', 'Employment', ['employment']),
]
LANGUAGE_STEMS = {
    'education': {'he': ['חינוך', 'השכלה']},
    'health': {'he': ['בריאות'], 'it': ['sanitari']},
    'religion': {'he': ['דת']},
    'environment': {'he': ['סביבה'], 'it': ['aree protette', 'paesaggistic']},
    'animals': {'he': ['ובעלי חיים']},
    'arts-culture': {'he': ['תרבות', 'אמנות']},
    'sport-recreation': {'he': ['ספורט'], 'it': ['asd']},
    'community': {'he': ['קהילה']},
    'housing': {'he': ['שיכון']},
    'science-research': {'he': ['מחקר', 'מדע'], 'it': ['ricerca']},
    'international': {'he': ['בינלאומיים']},
    'safety': {'he': ['הצלת חיים']},
}
LANGUAGES = ['he', 'it']
CAUSE_REGISTERS = ['il', 'it']
LABEL_LANGUAGE = {'il': 'he', 'it': 'it'}


def digest(body):
    return sha256(body).hexdigest()


def fail(message):
    raise SystemExit(f'build-registry-wave1d: {message}')


def check(condition, message):
    if not condition:
        fail(message)


def verified(path, size, sha):
    if not path.is_file() or path.is_symlink():
        fail(f'missing regular file {path}')
    body = path.read_bytes()
    check(len(body) == size, f'{path.name}: expected {size} bytes, got {len(body)}')
    check(digest(body) == sha, f'{path.name}: SHA-256 changed')
    return body


def download_log(src, sub, stem, url, retrieved):
    """The download directory keeps a <stem>.url and <stem>.retrieved note per file; they must equal the pinned URL and time."""
    for suffix, value in (('url', url), ('retrieved', retrieved)):
        note = src / sub / f'{stem}.{suffix}'
        check(note.is_file(), f'missing download note {note}')
        check(note.read_text().strip() == value, f'{note.name}: pinned {suffix} {value!r} differs from the download note {note.read_text().strip()!r}')


def word_match(label, stem):
    """A stem matches at the start of a word: not preceded by a Latin or Hebrew letter."""
    return re.search(r'(?<![a-zא-ת])' + re.escape(stem), label.lower()) is not None


def at_least(value, threshold):
    return value is not None and Decimal(value) >= Decimal(threshold)


def pdf_text(path):
    code = ('import Foundation; import PDFKit; let url = URL(fileURLWithPath: CommandLine.arguments[1]); '
            'guard let doc = PDFDocument(url: url) else { exit(1) }; '
            'for i in 0..<doc.pageCount { if let s = doc.page(at: i)?.string { print(s) } }')
    out = subprocess.run(['swift', '-e', code, str(path)], capture_output=True, text=True, check=True).stdout
    check(out.strip(), f'{path.name}: no text extracted (macOS swift and PDFKit are required)')
    return out


# ---------- Minimal XLSX reader: every cell as the stored text, with its number format ----------
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def xlsx_rows(body):
    z = zipfile.ZipFile(io.BytesIO(body))
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(NS + 'si'):
            shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))
    styles = ET.fromstring(z.read('xl/styles.xml'))
    xfs = [xf.get('numFmtId') for xf in styles.find(NS + 'cellXfs')]
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    sheets = list(wb.iter(NS + 'sheet'))
    check(len(sheets) == 1, 'expected one worksheet')
    target = rels[sheets[0].get(RNS + 'id')]
    target = target[1:] if target.startswith('/') else 'xl/' + target
    rows = []
    for row in ET.fromstring(z.read(target)).iter(NS + 'row'):
        cells = {}
        for c in row.iter(NS + 'c'):
            col = 0
            for ch in re.match(r'[A-Z]+', c.get('r')).group(0):
                col = col * 26 + ord(ch) - 64
            v, t = c.find(NS + 'v'), c.get('t')
            if t == 's':
                cells[col - 1] = ('s', shared[int(v.text)])
            elif t == 'inlineStr':
                cells[col - 1] = ('s', ''.join(x.text or '' for x in c.iter(NS + 't')))
            elif v is not None:
                cells[col - 1] = (t or 'n', v.text, xfs[int(c.get('s') or 0)])
        rows.append((int(row.get('r')), cells))
    return sheets[0].get('name'), rows


def integer_text(cell, where):
    """A numeric cell holding a whole number, as its digits."""
    check(cell is not None and cell[0] == 'n' and re.fullmatch(r'-?\d+', cell[1]), f'{where}: expected an integer cell, got {cell}')
    return cell[1]


def cents_text(cell, where):
    """A numeric euro cell: the stored binary number's shortest exact decimal, which must have at most two decimal places."""
    check(cell is not None and cell[0] == 'n', f'{where}: expected a numeric cell, got {cell}')
    shortest = repr(float(cell[1]))
    check(re.fullmatch(r'\d+(\.\d{1,2})?', shortest), f'{where}: {cell[1]} has more than two decimal places')
    whole, _, frac = shortest.partition('.')
    return f'{whole}.{(frac + "00")[:2]}'


def write_gz(path, value):
    raw = (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    return packed, {'path': str(path), 'bytes': len(packed), 'sha256': digest(packed), 'decodedBytes': len(raw), 'decodedSha256': digest(raw)}


# ---------- Extracts from the raw downloads ----------
def extract_il(src):
    pages, fields, total, rows = [], None, None, []
    for offset, size, sha, retrieved in IL_PAGES:
        body = verified(src / 'il' / f'page-{offset}.json', size, sha)
        download_log(src, 'il', f'page-{offset}', IL_API.format(offset=offset), retrieved)
        page = json.loads(body, parse_float=str, parse_int=str)
        check(page['success'] is True, f'il page {offset}: not successful')
        result = page['result']
        check(result['resource_id'] == IL_RESOURCE, 'il: resource changed')
        if fields is None:
            fields, total = [f['id'] for f in result['fields']], result['total']
        check([f['id'] for f in result['fields']] == fields and result['total'] == total, f'il page {offset}: fields or total changed between pages')
        pages.append({'url': IL_API.format(offset=offset), 'offset': offset, 'records': len(result['records']), 'bytes': size, 'sha256': sha, 'retrievedAt': retrieved})
        rows.extend(result['records'])
    check([r['_id'] for r in rows] == [str(i) for i in range(1, len(rows) + 1)] and len(rows) == int(total), 'il: datastore records are not one contiguous _id sequence')
    for name in IL_KEEP:
        check(name in fields, f'il: field {name} missing')
    for r in rows:
        for name in IL_KEEP:
            v = r[name]
            check(v is None or isinstance(v, str), f'il {r["_id"]}: {name} has a non-scalar value')
        check(r[IL_REVENUE] is None or re.fullmatch(r'-?\d+\.\d+', r[IL_REVENUE]), f'il {r["_id"]}: revenue {r[IL_REVENUE]!r} is not a published decimal')
        check(re.fullmatch(r'-?\d+', r[IL_EXPENSES] or ''), f'il {r["_id"]}: expenses {r[IL_EXPENSES]!r}')
    statuses = sorted({r[IL_STATUS] for r in rows})
    sectors = sorted({r[IL_SECTOR] for r in rows})
    floor = THRESHOLDS['il']['value']
    index = [[int(r['_id']), r['מספר עמותה'], statuses.index(r[IL_STATUS]), sectors.index(r[IL_SECTOR]), r[IL_REVENUE]] for r in rows]
    records = [[int(r['_id'])] + [r[n] for n in IL_KEEP] for r in rows if at_least(r[IL_REVENUE], floor)]
    return {
        'format': 'charitology-wave1d-il-extract-v1',
        'publisher': 'Israel Ministry of Justice, Registrar of Amutot (רשם העמותות)',
        'dataset': 'https://data.gov.il/dataset/moj-amutot',
        'resource': {'id': IL_RESOURCE, 'title': 'עמותות רשומות (registered amutot)'},
        'pages': pages, 'total': int(total), 'fields': fields, 'keep': IL_KEEP,
        'statuses': statuses, 'sectors': sectors, 'floor': floor,
        'index': index, 'records': records,
    }


def ee_csv(body, encoding='utf-8-sig'):
    z = zipfile.ZipFile(io.BytesIO(body))
    check(len(z.namelist()) == 1, 'expected one CSV in the zip')
    return z.namelist()[0], csv.DictReader(io.TextIOWrapper(z.open(z.namelist()[0]), encoding=encoding, newline=''), delimiter=';')


def extract_ee(src):
    bodies = {k: verified(src / 'ee' / f[0], f[2], f[3]) for k, f in EE_FILES.items()}
    for k, f in EE_FILES.items():
        download_log(src, 'ee', 'emta-active' if k == 'emta' else f[0], f[1], f[4])
    text = pdf_text(src / 'ee' / EE_FILES['emta'][0])
    as_of = re.search(r'Seisuga (\d{2}\.\d{2}\.\d{4})', text)
    check(as_of, 'ee: EMTA list date not found')
    emta = []
    for line in text.splitlines():
        m = re.fullmatch(r'(.*?) (\d{8}) (\d{2}\.\d{2}\.\d{4}) (.+? maakond) (.+)', line.strip())
        if m:
            emta.append([m.group(2), m.group(1), m.group(3), m.group(4), m.group(5)])
        elif re.search(r'\b\d{8} \d{2}\.\d{2}\.\d{4}\b', line):
            fail(f'ee: unparsed EMTA list line {line!r}')
    # The list prints a few registry codes twice (for example with two inclusion dates); every printed row is kept, in list order.
    codes = {r[0] for r in emta}
    name, reader = ee_csv(bodies['entities'])
    entities = []
    for row in reader:
        if row['ariregistri_kood'] in codes:
            entities.append([row['ariregistri_kood'], row['nimi'], row['ettevotja_oiguslik_vorm'], row['ettevotja_oigusliku_vormi_alaliik'], row['ettevotja_staatus'],
                             row['ettevotja_staatus_tekstina'], row['ettevotja_esmakande_kpv'], row['asukoha_ehak_tekstina'], row['teabesysteemi_link']])
    check(len({e[0] for e in entities}) == len(entities), 'ee: duplicate entity rows')
    name, reader = ee_csv(bodies['reports'])
    reports = []
    for row in reader:
        if row['registrikood'] in codes and row['aruandeaasta'] in EE_YEARS:
            reports.append([row['report_id'], row['registrikood'], row['õiguslik vorm'], row['staatus'], row['aruandeaasta'], row['kas konsolideeritud?'],
                            row['period_start'], row['period_end'], row['esitatud_kpv'], row['kas auditeeritud?'], row['valitud aruanne kategooria']])
    ids = {r[0] for r in reports}
    check(len(ids) == len(reports), 'ee: duplicate report_id')
    check(len({(r[1], r[4]) for r in reports}) == len(reports), 'ee: more than one report for an organization and year')
    wanted = {e for e, _ in EE_LINES}
    tables = set(EE_INCOME_TABLES + EE_BALANCE_TABLES)
    elements = defaultdict(list)
    for year in EE_YEARS:
        name, reader = ee_csv(bodies[f'elements{year}'])
        for row in reader:
            if row['report_id'] in ids and row['tabel'] in tables and row['elemendi_nimetus'] in wanted:
                check(re.fullmatch(r'-?\d+(\.\d+)?', row['vaartus']), f'ee {row["report_id"]}: value {row["vaartus"]!r}')
                elements[row['report_id']].append([row['tabel'], row['elemendi_nimetus'], row['elemendi_label'], row['vaartus']])
    return {
        'format': 'charitology-wave1d-ee-extract-v1',
        'publisher': 'Centre of Registers and Information Systems (RIK) and Estonian Tax and Customs Board (EMTA)',
        'sources': {k: {'file': f[0], 'url': f[1], 'bytes': f[2], 'sha256': f[3], 'retrievedAt': f[4], 'title': f[5]} for k, f in EE_FILES.items()},
        'emtaAsOf': as_of.group(1), 'emta': emta, 'entities': sorted(entities),
        'years': EE_YEARS, 'incomeTables': EE_INCOME_TABLES, 'balanceTables': EE_BALANCE_TABLES, 'lines': [e for e, _ in EE_LINES],
        'reports': sorted(reports, key=lambda r: int(r[0])),
        'elements': {k: sorted(v) for k, v in sorted(elements.items(), key=lambda kv: int(kv[0]))},
    }


def it_decimal(text):
    """An Italian-formatted amount (1.234.567,89) as a plain decimal string, digit for digit."""
    check(re.fullmatch(r'\d{1,3}(\.\d{3})*(,\d{1,2})?', text), f'it: amount {text!r}')
    return text.replace('.', '').replace(',', '.')


def extract_it(src):
    parts, header, index, records = [], None, [], []
    for part, url, size, sha, retrieved in IT_PARTS:
        body = verified(src / 'it' / f'part{part}.csv', size, sha)
        download_log(src, 'it', f'part{part}', url, retrieved)
        rows = list(csv.reader(io.StringIO(body.decode('utf-8'), newline=''), delimiter=';'))
        title = rows[0][0]
        check(title.startswith('5 per mille anno finanziario 2025') and f'parte {part} di 7' in title, f'it part {part}: title {title!r}')
        if header is None:
            header = rows[1]
        check(rows[1] == header and len(header) == 18 and header[0] == 'Prog' and header[17] == 'Importo totale erogabile', f'it part {part}: header')
        data = rows[2:]
        for r in data:
            check(len(r) == 18 and re.fullmatch(r'\d+', r[0]) and re.fullmatch(r"'\d{11}'|'[0-9A-Z]{16}'", r[1]), f'it part {part}: row {r[:3]}')
            for j in IT_CATEGORY_COLUMNS:
                check(r[j] in ('', 'X', 'R'), f'it {r[0]}: category cell {r[j]!r}')
            check(all(r[j] != 'R' for j in IT_CATEGORY_COLUMNS[1:]), f'it {r[0]}: R outside the ETS column')
            for j in IT_AMOUNT_COLUMNS.values():
                if r[j]:
                    it_decimal(r[j])
            total = it_decimal(r[17]) if r[17] else None
            index.append([int(r[0]), ''.join(r[j] or '-' for j in IT_CATEGORY_COLUMNS), total])
            if at_least(total, THRESHOLDS['it']['value']):
                records.append([part] + r)
        parts.append({'part': part, 'url': url, 'bytes': size, 'sha256': sha, 'retrievedAt': retrieved, 'rows': len(data), 'title': title.replace('\n', ' ').strip(),
                      'firstProg': int(data[0][0]), 'lastProg': int(data[-1][0])})
    check([i[0] for i in index] == list(range(1, len(index) + 1)), 'it: Prog is not one contiguous sequence across the parts')
    check(len({r[2] for r in records}) == len(records), 'it: duplicate codice fiscale among extracted rows')
    pdf = src / 'it' / 'part1.pdf'
    verified(pdf, IT_LEGEND_PDF[1], IT_LEGEND_PDF[2])
    download_log(src, 'it', 'part1pdf', IT_LEGEND_PDF[0], IT_LEGEND_PDF[3])
    # The PDF edition prints the legend of the ETS column on every page; it must read exactly as pinned above.
    legend = [line[line.index('R: ente ex ONLUS'):].strip().replace('\u2019', "'") for line in pdf_text(pdf).splitlines() if 'R: ente ex ONLUS' in line]
    check(legend and all(text == IT_LEGEND for text in legend), f'it: legend for R differs in the PDF: {sorted(set(legend))[:2]}')
    return {
        'format': 'charitology-wave1d-it-extract-v1',
        'publisher': 'Agenzia delle Entrate (Italian Revenue Agency)',
        'page': 'https://www.agenziaentrate.gov.it/portale/elenco-complessivo-degli-enti-ammessi-in-una-o-pi%C3%B9-categorie-di-beneficiari1',
        'parts': parts, 'header': header,
        'legend': {'url': IT_LEGEND_PDF[0], 'bytes': IT_LEGEND_PDF[1], 'sha256': IT_LEGEND_PDF[2], 'retrievedAt': IT_LEGEND_PDF[3], 'text': IT_LEGEND,
                   'title': 'Elenco destinatari ammessi al contributo, parte 1 di 7 (PDF edition, legend of the ETS column)'},
        'floor': THRESHOLDS['it']['value'], 'index': index, 'records': records,
    }


def extract_hu(src):
    years, index, records = {}, {}, {}
    rows_by_year = {}
    for year, (url, size, sha, retrieved) in HU_FILES.items():
        sheet, rows = xlsx_rows(verified(src / 'hu' / f'civil-{year}.xlsx', size, sha))
        download_log(src, 'hu', f'civil-{year}', url, retrieved)
        title = rows[0][1][0][1]
        check(title == f'Szja 1%-os felajánlásban részesült regisztrált civil kedvezményezettek a {year}. rendelkező évben', f'hu {year}: title {title!r}')
        header = [rows[1][1].get(i, (None, None))[1] for i in range(8)]
        check(header == ['Sorszám', 'Adószám', None, None, 'Név', 'Székhely', 'Felajánlott összeg (Ft)', 'Felajánlók száma (fő)'], f'hu {year}: header {header}')
        data = []
        for r, cells in rows[2:]:
            if not cells.get(1):
                check(not any(cells.values()), f'hu {year} row {r}: partial row')
                continue
            sor = integer_text(cells.get(0) if cells.get(0, ('',))[0] == 'n' else ('n', cells[0][1]), f'hu {year} row {r} Sorszám')
            torzs = integer_text(cells[1], f'hu {year} row {r} Adószám')
            check(len(torzs) == 8, f'hu {year} row {r}: tax number {torzs}')
            vat = cells[2][1]
            county = cells[3][1]
            check(re.fullmatch(r'\d', vat) and re.fullmatch(r'\d{1,2}', county), f'hu {year} row {r}: tax number parts {vat} {county}')
            check(cells[4][0] == 's' and cells[4][1].strip(), f'hu {year} row {r}: name')
            amount = integer_text(cells.get(6), f'hu {year} row {r} amount')
            donors = integer_text(cells.get(7), f'hu {year} row {r} donors')
            data.append([r, sor, torzs, vat, county, cells[4][1], amount, donors])
        check([d[1] for d in data] == [str(i) for i in range(1, len(data) + 1)], f'hu {year}: Sorszám is not 1..n')
        check(len({d[2] for d in data}) == len(data), f'hu {year}: duplicate tax number')
        rows_by_year[year] = data
        years[str(year)] = {'url': url, 'bytes': size, 'sha256': sha, 'retrievedAt': retrieved, 'title': title, 'sheet': sheet, 'rows': len(data)}
    selected = {d[2] for d in rows_by_year[2026] if int(d[6]) >= int(THRESHOLDS['hu']['value'])}
    for year, data in rows_by_year.items():
        index[str(year)] = [[int(d[1]), d[2], d[6]] for d in data]
        records[str(year)] = [d for d in data if d[2] in selected]
    return {
        'format': 'charitology-wave1d-hu-extract-v1',
        'publisher': 'Nemzeti Adó- és Vámhivatal (NAV, National Tax and Customs Administration of Hungary)',
        'page': 'https://nav.gov.hu/ado/szja1_1',
        'years': years, 'selectionYear': '2026', 'floor': THRESHOLDS['hu']['value'], 'index': index, 'records': records,
    }


def extract_si(src):
    years, rows_out = {}, {}
    for year, (url, size, sha, retrieved) in SI_FILES.items():
        sheet, rows = xlsx_rows(verified(src / 'si' / f'furs-{year}.xlsx', size, sha))
        download_log(src, 'si', f'furs-{year}', url, retrieved)
        header = [rows[0][1].get(i, (None, None))[1] for i in range(4)]
        check(header == ['DS_UPR', 'IME_UPR', 'STEVILO_DON', 'ZNESEK_DON'], f'si {year}: header {header}')
        data = []
        for r, cells in rows[1:]:
            if not cells.get(0):
                check(not any(v for v in cells.values() if v), f'si {year} row {r}: partial row')
                continue
            tin = integer_text(cells[0], f'si {year} row {r} DS_UPR')
            check(len(tin) == 8, f'si {year} row {r}: tax number {tin}')
            name = cells[1][1]
            donors = cells.get(2)
            if donors and donors[0] == 's':
                check(donors[1] == 'manj kot 5' and not cells.get(3), f'si {year} row {r}: suppressed row {cells}')
                data.append([r, tin, name, 'manj kot 5', None])
            else:
                data.append([r, tin, name, integer_text(donors, f'si {year} row {r} donors'), cents_text(cells.get(3), f'si {year} row {r} amount')])
        # A tax number can be printed on more than one row (for example a school and its school fund); every row is kept as published.
        rows_out[str(year)] = data
        years[str(year)] = {'url': url, 'bytes': size, 'sha256': sha, 'retrievedAt': retrieved, 'sheet': sheet, 'rows': len(data),
                            'title': f'Seznam prejemnikov za leto {year} (preliminarni podatki)'}
    pdf = src / 'si' / 'upr-2025.pdf'
    verified(pdf, SI_LIST[1], SI_LIST[2])
    download_log(src, 'si', 'upr-2025', SI_LIST[0], SI_LIST[3])
    lines = pdf_text(pdf).splitlines()
    check(any(re.fullmatch(r'SEZNAM UPRAVI.?ENCEV DO DONACIJ ZA LETO 2025', l.strip()) for l in lines[:20]), 'si: list title not found')
    section, seen, membership = None, [], defaultdict(set)
    for line in lines:
        hit = [n for n, pattern in SI_HEADINGS if re.fullmatch(pattern, line.strip())]
        if hit:
            seen.append(hit[0])
            section = hit[0]
            continue
        if section is None:
            continue
        for tin in re.findall(r'(?<!\d)\d{8}(?!\d)', line):
            membership[tin].add(section)
    check(seen == [1, 2, 3, 4, 5, 6], f'si: section headings {seen}')
    return {
        'format': 'charitology-wave1d-si-extract-v1',
        'publisher': 'Finančna uprava Republike Slovenije (FURS, Financial Administration of the Republic of Slovenia)',
        'page': 'https://podatki.gov.si/dataset/prejemniki-namenitve-dela-dohodnine-za-donacije',
        'years': years,
        'list': {'url': SI_LIST[0], 'bytes': SI_LIST[1], 'sha256': SI_LIST[2], 'retrievedAt': SI_LIST[3],
                 'title': 'Seznam upravičencev do donacij za leto 2025 (Uradni list RS, št. 70/2025, priloga)', 'sections': {str(k): v for k, v in SI_SECTIONS.items()},
                 'membership': sorted([tin, sorted(s)] for tin, s in membership.items())},
        'rows': rows_out,
    }


EXTRACTORS = {'il': extract_il, 'ee': extract_ee, 'it': extract_it, 'hu': extract_hu, 'si': extract_si}
EXTRACT_FILES = {'il': 'il-amutot.json.gz', 'ee': 'ee-rik-emta.json.gz', 'it': 'it-5x1000.json.gz', 'hu': 'hu-szja.json.gz', 'si': 'si-dohodnina.json.gz'}


# ---------- Dossiers from the extracts ----------
def iso_dmy(text, sep):
    if not text:
        return None
    m = re.fullmatch(r'(\d{2})' + re.escape(sep) + r'(\d{2})' + re.escape(sep) + r'(\d{4})', text)
    check(m, f'date {text!r}')
    return f'{m.group(3)}-{m.group(2)}-{m.group(1)}'


def build_il(x):
    keep = x['keep']
    col = {n: i + 1 for i, n in enumerate(keep)}
    records = {r[0]: r for r in x['records']}
    th = THRESHOLDS['il']['value']
    check(x['floor'] == th, 'il: extract floor differs from the threshold')
    candidates = [row for row in x['index'] if at_least(row[4], th)]
    check(sorted(records) == [row[0] for row in candidates], 'il: extract records are not exactly the rows at or above the threshold')
    dossiers, excluded = [], defaultdict(list)
    for row in candidates:
        r = records[row[0]]
        status = r[col[IL_STATUS]]
        if status not in IL_INCLUDED_STATUSES:
            excluded[status].append(r[col['מספר עמותה']])
            continue
        sector = r[col[IL_SECTOR]]
        expenses = r[col[IL_EXPENSES]]
        dossiers.append({
            'id': r[col['מספר עמותה']], 'name': r[col['שם עמותה בעברית']], 'record': row[0],
            'facts': {'enName': r[col['שם עמותה באנגלית']] or None, 'registered': iso_dmy(r[col['תאריך רישום עמותה']], '/'), 'status': status,
                      'sector': sector or None, 'secondary': r[col['תחום פעילות משני']] or None, 'city': r[col['כתובת - ישוב']] or None,
                      'lastReportYear': r[col['שנת דיווח אחרונה']]},
            'labels': [sector] if sector else [],
            'periods': [{'label': r[col['שנת דיווח דוח כספי אחרון']], 'record': row[0], 'expensesPublishedZero': expenses == '0',
                         'values': {'revenue': r[col[IL_REVENUE]], 'expenses': None if expenses == '0' else expenses}}],
        })
    statuses, sectors = x['statuses'], x['sectors']
    included = [row for row in x['index'] if statuses[row[2]] in IL_INCLUDED_STATUSES]
    counts = {'editionOrganizations': len(x['index']), 'withRevenue': sum(1 for row in x['index'] if row[4] is not None),
              'byStatus': dict(sorted(Counter(statuses[row[2]] for row in x['index']).items())),
              'labels': {s: sum(1 for row in included if sectors[row[3]] == s) for s in sectors if s}}
    labels = [[s, s] for s in sectors if s]
    return dossiers, dict(excluded), len(candidates), counts, labels


def build_ee(x):
    th = THRESHOLDS['ee']['value']
    emta = defaultdict(list)
    for r in x['emta']:
        emta[r[0]].append(r)
    entities = {e[0]: e for e in x['entities']}
    by_org = defaultdict(dict)
    for rep in x['reports']:
        by_org[rep[1]][rep[4]] = rep
    elements = x['elements']

    def lines_of(report_id):
        rows = elements.get(report_id, [])
        out, used = {}, {}
        for group, tables in (('income', x['incomeTables']), ('balance', x['balanceTables'])):
            present = sorted({t for t, e, _, _ in rows if t in tables})
            check(len(present) <= 1, f'ee report {report_id}: more than one {group} table {present}')
            used[group] = present[0] if present else None
        for key, group in EE_LINES:
            hits = [r for r in rows if r[0] == used[group] and r[1] == key]
            check(len(hits) <= 1, f'ee report {report_id}: {key} published twice')
            out[key] = hits[0][3] if hits else None
        return out, used

    dossiers, excluded, candidates = [], defaultdict(list), 0
    for code in sorted(emta):
        years = by_org.get(code, {})
        latest = next((years[y] for y in x['years'] if y in years), None)
        if latest is None:
            continue
        values, _ = lines_of(latest[0])
        if not at_least(values['TotalRevenue'], th):
            continue
        candidates += 1
        ent = entities.get(code)
        if ent is None:
            excluded['notInRegister'].append(code)
            continue
        if ent[4] != 'R':
            excluded['notEntered'].append(code)
            continue
        periods = []
        for y in x['years']:
            rep = years.get(y)
            if rep is None:
                continue
            v, used = lines_of(rep[0])
            periods.append({'label': y, 'record': int(rep[0]), 'periodStart': iso_dmy(rep[6], '.'), 'periodEnd': iso_dmy(rep[7], '.'),
                            'submitted': iso_dmy(rep[8], '.'), 'audited': rep[9], 'consolidated': rep[5], 'incomeTable': used['income'], 'balanceTable': used['balance'],
                            'values': v})
        dossiers.append({
            'id': code, 'name': ent[1], 'record': None,
            'facts': {'legalForm': ent[2], 'subform': ent[3] or None, 'status': ent[5], 'firstEntry': iso_dmy(ent[6], '.'), 'location': ent[7] or None,
                      'link': ent[8] or None, 'emtaEntries': [{'name': e[1], 'since': iso_dmy(e[2], '.'), 'county': e[3], 'place': e[4]} for e in emta[code]]},
            'labels': [],
            'periods': periods,
        })
    counts = {'emtaRows': len(x['emta']), 'emtaOrganizations': len(emta), 'withReport': {y: sum(1 for c in emta if y in by_org.get(c, {})) for y in x['years']},
              'emtaAsOf': x['emtaAsOf'], 'inRegister': sum(1 for c in emta if c in entities)}
    return dossiers, dict(excluded), candidates, counts, []


IT_CATEGORY_KEYS = ['ets', 'asd', 'ricercaScientifica', 'ricercaSanitaria', 'comuni', 'beniCulturali', 'areeProtette']


def build_it(x):
    th = THRESHOLDS['it']['value']
    check(x['floor'] == th, 'it: extract floor differs from the threshold')
    header = x['header']
    records = {int(r[1]): r for r in x['records']}
    candidates = [row for row in x['index'] if at_least(row[2], th)]
    check(sorted(records) == [row[0] for row in candidates], 'it: extract records are not exactly the rows at or above the threshold')
    labels = [header[j] for j in IT_CATEGORY_COLUMNS]
    dossiers, excluded = [], defaultdict(list)
    for row in candidates:
        r = records[row[0]]
        part, cells = r[0], r[1:]
        flags = [cells[j] for j in IT_CATEGORY_COLUMNS]
        check(''.join(f or '-' for f in flags) == row[1], f'it {row[0]}: flags differ from the index')
        cf = cells[1][1:-1]
        if [i for i, f in enumerate(flags) if f] == [4]:
            excluded['municipalityOnly'].append(cf)
            continue
        dossiers.append({
            'id': cf, 'name': cells[2], 'record': int(cells[0]),
            'facts': {'part': part, 'region': cells[3] or None, 'province': cells[4] or None, 'comune': cells[5] or None,
                      'flags': {header[j]: cells[j] for j in IT_CATEGORY_COLUMNS}},
            'labels': [header[j] for j in IT_CATEGORY_COLUMNS if cells[j]],
            'periods': [{'label': 'AF 2025', 'record': int(cells[0]), 'part': part,
                         'values': {k: it_decimal(cells[j]) if cells[j] else None for k, j in IT_AMOUNT_COLUMNS.items()}}],
        })
    edition = [row for row in x['index']]
    counts = {'editionOrganizations': len(edition), 'withTotal': sum(1 for row in edition if row[2] is not None),
              'labels': {labels[i]: sum(1 for row in edition if row[1][i] != '-') for i in range(len(labels))},
              'etsReserved': sum(1 for row in edition if row[1][0] == 'R')}
    return dossiers, dict(excluded), len(candidates), counts, [[l, l] for l in labels]


def build_hu(x):
    th = int(THRESHOLDS['hu']['value'])
    check(int(x['floor']) == th, 'hu: extract floor differs from the threshold')
    sel = x['selectionYear']
    candidates = [row for row in x['index'][sel] if int(row[2]) >= th]
    selected = {row[1] for row in candidates}
    for year, rows in x['records'].items():
        check({r[2] for r in rows} == {row[1] for row in x['index'][year] if row[1] in selected}, f'hu {year}: extract records do not match the selection')
        idx = {row[1]: row for row in x['index'][year]}
        for r in rows:
            check([int(r[1]), r[2], r[6]] == idx[r[2]], f'hu {year} {r[2]}: record differs from the index')
    by_year = {y: {r[2]: r for r in rows} for y, rows in x['records'].items()}
    years = sorted(x['records'], reverse=True)
    dossiers = []
    for row in candidates:
        torzs = row[1]
        latest = by_year[sel][torzs]
        dossiers.append({
            'id': torzs, 'name': latest[5], 'record': int(latest[1]),
            'facts': {'vatCode': latest[3], 'countyCode': latest[4], 'listedYears': [y for y in years if torzs in by_year[y]]},
            'labels': [],
            'periods': [{'label': y, 'record': int(by_year[y][torzs][1]) if torzs in by_year[y] else None, 'name': by_year[y][torzs][5] if torzs in by_year[y] else None,
                         'values': {'amount': by_year[y][torzs][6] if torzs in by_year[y] else None, 'donors': by_year[y][torzs][7] if torzs in by_year[y] else None}}
                        for y in years],
        })
    counts = {'recipients': {y: len(x['index'][y]) for y in years}}
    return dossiers, {}, len(candidates), counts, []


def build_si(x):
    th = THRESHOLDS['si']['value']
    membership = {tin: sections for tin, sections in x['list']['membership']}
    rows = {y: defaultdict(list) for y in x['rows']}
    for y, data in x['rows'].items():
        for r in data:
            rows[y][r[1]].append(r)
    years = sorted(rows, reverse=True)
    sel = years[0]
    check(sel == '2025', 'si: selection year')

    def period(y, tin):
        hits = rows[y].get(tin, [])
        if len(hits) > 1:  # never merged: a year with more than one row for the tax number is not shown
            return {'label': y, 'record': None, 'name': None, 'multipleRows': [h[0] for h in hits], 'values': {'amount': None, 'donors': None}}
        h = hits[0] if hits else None
        return {'label': y, 'record': h[0] if h else None, 'name': h[2] if h else None, 'multipleRows': None,
                'values': {'amount': h[4] if h else None, 'donors': h[3] if h else None}}

    dossiers, excluded, candidates = [], defaultdict(list), 0
    for r in x['rows'][sel]:
        if not at_least(r[4], th):
            continue
        candidates += 1
        sections = membership.get(r[1], [])
        if len(rows[sel][r[1]]) > 1:
            excluded['multipleRows'].append(r[1])
            continue
        if SI_INCLUDED_SECTION not in sections:
            excluded[f'section{min(sections)}' if sections else 'notListed'].append(r[1])
            continue
        dossiers.append({
            'id': r[1], 'name': r[2], 'record': r[0],
            'facts': {'sections': sections},
            'labels': [],
            'periods': [period(y, r[1]) for y in years],
        })
    by_section = Counter()
    for r in x['rows'][sel]:
        s = membership.get(r[1], [])
        by_section[str(min(s)) if s else 'notListed'] += 1
    counts = {'recipients': {y: len(x['rows'][y]) for y in years}, 'recipientsBySection2025': dict(sorted(by_section.items())),
              'listedTaxNumbers': len(membership), 'listedInSection': {k: sum(1 for s in membership.values() if int(k) in s) for k in x['list']['sections']},
              'suppressed2025': sum(1 for r in x['rows'][sel] if r[4] is None)}
    return dossiers, dict(excluded), candidates, counts, []


BUILDERS = {'il': build_il, 'ee': build_ee, 'it': build_it, 'hu': build_hu, 'si': build_si}


def cause_groups(labels):
    groups, grouped = [], {r: set() for r in CAUSE_REGISTERS}
    for gid, name, stems in WAVE1B_STEMS:
        language = LANGUAGE_STEMS.get(gid, {})
        matches = {}
        for registry in CAUSE_REGISTERS:
            use = stems + language.get(LABEL_LANGUAGE[registry], [])
            hits = [key for key, label in labels[registry] if any(word_match(label, s) for s in use)]
            matches[registry] = hits
            grouped[registry].update(hits)
        groups.append({'id': gid, 'name': name, 'stems': stems, 'languageStems': {l: language.get(l, []) for l in LANGUAGES}, 'matches': matches})
    return {
        'format': 'charitology-cause-by-country-wave1d-v1',
        'edition': EDITION,
        'rule': ('A cause group lists every published category label, in each register, that contains a word starting with one of the '
                 'group’s stems (case-insensitive; a word starts where no Latin or Hebrew letter precedes it). The Wave 1b English stems '
                 'apply to every label; a language stem applies only to labels published in that language. Matching uses label text only. '
                 'The registers define their categories differently, so a group is a reading aid, not an equivalence or an official crosswalk. '
                 'A label can fall in more than one group or in none.'),
        'registers': CAUSE_REGISTERS,
        'labelLanguage': LABEL_LANGUAGE,
        'labels': labels,
        'groups': groups,
        'ungrouped': {r: [key for key, _ in labels[r] if key not in grouped[r]] for r in CAUSE_REGISTERS},
    }


def encode(value, indent=None):
    return (json.dumps(value, ensure_ascii=False, indent=indent, separators=(',', ':') if indent is None else (',', ': ')) + '\n').encode()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sources', type=Path, help='directory with the raw official downloads (il/, ee/, it/, hu/, si/)')
    parser.add_argument('--verify', action='store_true', help='fail unless every rebuilt file equals the committed copy')
    args = parser.parse_args()
    files = {}  # relative path -> bytes
    extracts, extract_meta = {}, {}
    for key in KEYS:
        rel = f'extracts/{EXTRACT_FILES[key]}'
        if args.sources:
            packed, meta = write_gz(rel, EXTRACTORS[key](args.sources))
            files[rel] = packed
        else:
            packed = (OUT / rel).read_bytes()
            raw = gzip.decompress(packed)
            meta = {'path': rel, 'bytes': len(packed), 'sha256': digest(packed), 'decodedBytes': len(raw), 'decodedSha256': digest(raw)}
        extracts[key] = json.loads(gzip.decompress(packed))
        extract_meta[key] = meta

    outputs, selection, labels = {}, {}, {}
    for key in KEYS:
        items, excluded, candidates, counts, lab = BUILDERS[key](extracts[key])
        ids = [d['id'] for d in items]
        check(len(set(ids)) == len(ids), f'{key}: duplicate dossier id')
        excluded_ids = [i for v in excluded.values() for i in v]
        check(len(items) + len(excluded_ids) == candidates, f'{key}: dossiers and exclusions do not cover the candidates')
        items.sort(key=lambda d: d['id'])
        for name, value in ((f'{key}-dossiers.json', items), (f'{key}-counts.json', counts)):
            files[name] = encode(value)
            outputs[name.replace('-dossiers.json', '').replace('-counts.json', 'Counts')] = {'path': name, 'bytes': len(files[name]), 'sha256': digest(files[name])}
        selection[key] = {'threshold': THRESHOLDS[key], 'candidates': candidates, 'dossiers': len(items), 'excluded': {k: sorted(v) for k, v in sorted(excluded.items())}}
        if lab:
            labels[key] = lab
    causes = cause_groups({r: labels[r] for r in CAUSE_REGISTERS})
    files['cause-groups.json'] = encode(causes)
    outputs['causes'] = {'path': 'cause-groups.json', 'bytes': len(files['cause-groups.json']), 'sha256': digest(files['cause-groups.json'])}

    sources = {}
    x = extracts
    sources['il'] = {f'page{p["offset"]}': {'title': f'Registrar of Amutot datastore, records {p["offset"] + 1} to {p["offset"] + p["records"]} (data.gov.il resource {IL_RESOURCE})',
                                            'url': p['url'], 'bytes': p['bytes'], 'sha256': p['sha256'], 'retrievedAt': p['retrievedAt']} for p in x['il']['pages']}
    sources['ee'] = {k: {'title': s['title'], 'url': s['url'], 'bytes': s['bytes'], 'sha256': s['sha256'], 'retrievedAt': s['retrievedAt']} for k, s in x['ee']['sources'].items()}
    sources['it'] = {f'part{p["part"]}': {'title': f'5 per mille AF 2025, elenco destinatari ammessi, parte {p["part"]} di 7 (CSV)', 'url': p['url'], 'bytes': p['bytes'],
                                          'sha256': p['sha256'], 'retrievedAt': p['retrievedAt']} for p in x['it']['parts']}
    lg = x['it']['legend']
    sources['it']['legendPdf'] = {'title': lg['title'], 'url': lg['url'], 'bytes': lg['bytes'], 'sha256': lg['sha256'], 'retrievedAt': lg['retrievedAt']}
    sources['hu'] = {f'civil{y}': {'title': s['title'], 'url': s['url'], 'bytes': s['bytes'], 'sha256': s['sha256'], 'retrievedAt': s['retrievedAt']} for y, s in x['hu']['years'].items()}
    sources['si'] = {f'recipients{y}': {'title': s['title'], 'url': s['url'], 'bytes': s['bytes'], 'sha256': s['sha256'], 'retrievedAt': s['retrievedAt']} for y, s in x['si']['years'].items()}
    sl = x['si']['list']
    sources['si']['eligibleList2025'] = {'title': sl['title'], 'url': sl['url'], 'bytes': sl['bytes'], 'sha256': sl['sha256'], 'retrievedAt': sl['retrievedAt']}

    manifest = {
        'format': 'charitology-registry-wave1d-v1',
        'edition': EDITION,
        'builder': 'scripts/build-registry-wave1d.py',
        'checker': 'scripts/check-registry-wave1d.mjs',
        'policy': ('Figures are copied exactly as the official files publish them, decimals included, from compact extracts of the official downloads. '
                   'Inclusion follows one published-figure threshold per register and is a coverage boundary, not a rating, ranking or endorsement. '
                   'Null means not supplied; it is never zero. Lists are never merged and amounts are never summed. Cause groups match published '
                   'category labels only and are not a crosswalk.'),
        'selection': {**selection, 'hubMinimumDossiers': HUB_MIN,
                      'rules': {'il': {'includedStatuses': IL_INCLUDED_STATUSES},
                                'ee': {'population': 'organizations on the EMTA income tax incentive list', 'years': EE_YEARS, 'registerStatus': 'R'},
                                'it': {'excluded': 'entities admitted only in the Comuni (municipalities) column'},
                                'hu': {'selectionYear': x['hu']['selectionYear']},
                                'si': {'includedSection': SI_INCLUDED_SECTION, 'sections': {str(k): v for k, v in SI_SECTIONS.items()}}}},
        'sources': sources,
        'extracts': extract_meta,
        'outputs': outputs,
    }
    files['manifest.json'] = encode(manifest, indent=1)

    if args.verify:
        bad = [name for name, body in files.items() if not (OUT / name).is_file() or (OUT / name).read_bytes() != body]
        check(not bad, f'rebuilt files differ from the committed copies: {bad}')
        print(f'Verified {len(files)} files byte for byte.')
    else:
        (OUT / 'extracts').mkdir(parents=True, exist_ok=True)
        for name, body in files.items():
            (OUT / name).write_bytes(body)
    for key in KEYS:
        s = selection[key]
        print(key, {k: v for k, v in s.items() if k != 'excluded'}, {k: len(v) for k, v in s['excluded'].items()})
    for g in causes['groups']:
        print(g['id'], {r: len(v) for r, v in g['matches'].items()})


if __name__ == '__main__':
    main()
