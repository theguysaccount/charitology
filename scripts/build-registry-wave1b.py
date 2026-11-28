"""Build the Wave 1b verified charity dossier dataset from exact official registry files.

Wave 1b adds Scotland (OSCR), Australia (ACNC) and Canada (CRA) to the Wave 1
dossiers, plus per-country cause hubs and a label-level Cause x Country grouping.
Every figure is copied as published from the committed, hash-pinned financial
editions. Nothing is estimated, scored, ranked or inferred. Selection uses one
published figure per register, recorded in the manifest, so the same inputs
always produce the same files.

Inputs (each verified by size and SHA-256 before it is read):
  --oscr-dir  charity-register.zip (OSCR Scottish Charity Register download)
  --acnc-dir  datadotgov_main.csv (ACNC Registered Charities dataset) and the
              ACNC user guide PDF transcribed in acnc-register-fields.json
  --cra-dir   ident_2023_updated.csv and ident_2024_updated.csv (CRA List of
              charities identification files) and codes_en.pdf, transcribed in
              cra-codes.json
It also reads the committed, hash-pinned editions in
public/data/charity-financials/{scotland,ca}/ and
public/data/charity-financials/manifest.json (ACNC AIS 2023 and 2024), and the
Wave 1 dataset in public/data/registry-wave1/ for the Cause x Country labels.

Usage:
  python3 -I scripts/build-registry-wave1b.py --oscr-dir DIR --acnc-dir DIR --cra-dir DIR

scripts/check-registry-wave1b.mjs verifies the committed outputs, the selection
rules, the cause grouping and the built pages offline.
"""
import argparse
import csv
import gzip
import io
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/data/registry-wave1b'
WAVE1 = ROOT / 'public/data/registry-wave1'
EDITION = '2026-11-27'
SC_INCOME_THRESHOLD = 10_000_000
AU_REVENUE_THRESHOLD = 100_000_000
CA_REVENUE_THRESHOLD = 100_000_000
HUB_MIN_DOSSIERS = 5

OSCR_PAGE = 'https://www.oscr.org.uk/about-charities/search-the-register/download-the-scottish-charity-register/'
OSCR_FIELDS = 'https://www.oscr.org.uk/media/uixby3ex/2023-03-22-description-of-charity-register-download-fields.pdf'
OGL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'
ACNC_DATASET = 'https://data.gov.au/data/dataset/b050b242-4487-4306-abf5-07ca073e5594'
ACNC_PAGE = 'https://www.acnc.gov.au/charity/about-charity-register/download-charity-register-data'
CC_BY_AU = 'https://creativecommons.org/licenses/by/3.0/au/'
CRA_CATALOGUE = 'https://open.canada.ca/data/dataset/'
OGL_CANADA = 'https://open.canada.ca/en/open-government-licence-canada'

OSCR_REGISTER = {
    'url': 'https://www.oscr.org.uk/download/charity-register', 'file': 'charity-register.zip',
    'served': 'CharityExport-27-Nov-2026.zip', 'member': 'CharityExport-27-Nov-2026.csv', 'memberDate': '2026-11-27',
    'date': 'Fri, 27 Nov 2026 23:10:12 GMT', 'retrievedAt': '2026-11-27T23:10:16Z', 'bytes': 8809655,
    'sha256': '75b7308b1bfff5cc2b25d2e58a972ba6613dcf6bbf5d860b246f09babb2807d5',
}
ACNC_REGISTER = {
    'url': 'https://data.gov.au/data/dataset/b050b242-4487-4306-abf5-07ca073e5594/resource/8fb32972-24e9-4c95-885e-7140be51be8a/download/datadotgov_main.csv',
    'file': 'datadotgov_main.csv', 'lastModified': 'Sun, 22 Nov 2026 17:39:55 GMT', 'retrievedAt': '2026-11-27T23:12:56Z',
    'bytes': 15227773, 'sha256': '559c29245442d98abc473ffa60a2832b4d25ead3ebbf6734dd2857237fef328d',
}
ACNC_NOTES_FILE = 'acnc-registered-charities-dataset-user-notes-dec-2024.pdf'
CRA_IDENT = {
    '2023': {'dataset': '05b3abd0-e70f-4b3b-a9c5-acc436bd15b6', 'resource': '31a52caf-fa79-4ab3-bded-1ccc7b61c17f',
             'file': 'ident_2023_updated.csv', 'lastModified': 'Fri, 13 Nov 2026 19:26:09 GMT', 'retrievedAt': '2026-11-27T23:11:29Z',
             'bytes': 13326572, 'sha256': '5cc34d277f27d02d36c77936122654062c0ec5645fe5d4385911ef76b3859376'},
    '2024': {'dataset': '80c00cdb-1358-415c-bb8b-0de7f12675b8', 'resource': '694fdc72-eae4-4ee0-83eb-832ab7b230e3',
             'file': 'ident_2024_updated.csv', 'lastModified': 'Fri, 13 Nov 2026 20:33:47 GMT', 'retrievedAt': '2026-11-27T23:11:26Z',
             'bytes': 13226927, 'sha256': '3686d66f31ca030e61d03a246c118e2223d47c1d64dc9b3817a429bb6d06cc23'},
}
CRA_CODES_FILE = 'codes_en.pdf'
PINNED = {
    'scotland': ('public/data/charity-financials/scotland/manifest.json', '50d00c95d7c68ce3dd187c613f22ea60f75e2b87a2cf44e489cfc700e1815e7d'),
    'australia': ('public/data/charity-financials/manifest.json', '88f858ddf4e0264c05546124f93d0f075442b45d2605ec74ff844b6f1311befc'),
    'canada': ('public/data/charity-financials/ca/manifest.json', '2012a8df9b160fc8fd50f1106f0668e089d8c6a5faccae4be7882dc91802c380'),
}
WAVE1_MANIFEST_SHA = '8a5250b6d109c1535df5e603f1ae1b321801ba721146e4b9ccb470d19d288c75'
CRA_CODES = 'public/data/registry-wave1b/cra-codes.json'
ACNC_FIELDS = 'public/data/registry-wave1b/acnc-register-fields.json'

# Label-level Cause x Country grouping. A label belongs to a group when a word in
# the label, case-insensitively, starts with one of the group's stems. Labels are
# each register's own published category names; nothing else is consulted.
CAUSE_GROUPS = [
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
REGISTRIES = ['us', 'ew', 'scotland', 'australia', 'canada']


def digest(body):
    return sha256(body).hexdigest()


def file_digest(path):
    h = sha256()
    with path.open('rb') as stream:
        while True:
            chunk = stream.read(1 << 20)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def verified(path, expected_sha, expected_bytes=None):
    if not path.is_file() or path.is_symlink():
        raise SystemExit(f'Missing regular input file: {path}')
    if expected_bytes is not None and path.stat().st_size != expected_bytes:
        raise SystemExit(f'Input size changed: {path.name}')
    if file_digest(path) != expected_sha:
        raise SystemExit(f'Input bytes changed: {path.name}')
    return path


def uk_day(raw):
    value = raw.strip()
    if not value:
        return None
    if not re.fullmatch(r'[0-9]{2}/[0-9]{2}/[0-9]{4}', value):
        raise ValueError(f'Unexpected date {value!r}')
    dd, mm, yyyy = map(int, value.split('/'))
    return date(yyyy, mm, dd).isoformat()


def load_shards(directory, descriptors):
    for asset in descriptors.values():
        body = verified(directory / asset['path'], asset['sha256'], asset['bytes']).read_bytes()
        decoded = gzip.decompress(body)
        assert digest(decoded) == asset['decodedSha256'] and len(decoded) == asset['decodedBytes']
        rows = json.loads(decoded)
        assert len(rows) == asset['rows']
        yield from rows


def pinned_manifest(key):
    rel, expected = PINNED[key]
    path = ROOT / rel
    verified(path, expected)
    return path.parent, json.loads(path.read_bytes())


def word_match(label, stem):
    return re.search(r'(?<![a-z])' + re.escape(stem), label.lower()) is not None


# ---------- Scotland ----------
def parse_oscr_list(raw):
    value = raw.strip()
    if not value:
        return []
    assert value.startswith("'") and value.endswith("'"), 'Unexpected OSCR list field'
    items = value[1:-1].split("','")
    assert all(item and "'," not in item for item in items)
    return items


def sc_candidates():
    directory, manifest = pinned_manifest('scotland')
    assert manifest['format'] == 'charitology-scotland-returns-v1' and manifest['currency'] == 'GBP'
    assert manifest['periodFields'] == ['end', 'annualReturnReceived', 'grossIncomeGBP', 'grossExpenditureGBP', 'sourceRecord', 'incomeDetail', 'spendingDetail']
    candidates, organizations = {}, 0
    for row in load_shards(directory, manifest['names']):
        organizations += 1
        number, name, status, kind, location, spread, registry_record, periods = row
        if not periods:
            continue
        latest = max(periods, key=lambda p: p[0])
        if Decimal(latest[2]) >= SC_INCOME_THRESHOLD:
            assert number not in candidates
            candidates[number] = row
    assert organizations == manifest['identities']
    return candidates, manifest, organizations


def build_scotland(oscr_dir):
    candidates, manifest, organizations = sc_candidates()
    path = verified(oscr_dir / OSCR_REGISTER['file'], OSCR_REGISTER['sha256'], OSCR_REGISTER['bytes'])
    register = {}
    purposes, statuses, kinds = Counter(), Counter(), Counter()
    rows = 0
    with ZipFile(path) as archive, archive.open(OSCR_REGISTER['member']) as raw:
        assert archive.namelist() == [OSCR_REGISTER['member']]
        reader = csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''))
        for record, row in enumerate(reader, 1):
            assert None not in row and None not in row.values(), record
            rows += 1
            number = row['Charity Number'].strip()
            assert re.fullmatch(r'SC[0-9]{6}', number) and number not in register, record
            items = {key: parse_oscr_list(row[key]) for key in ('Purposes', 'Beneficiaries', 'Activities')}
            for item in items['Purposes']:
                purposes[item] += 1
            statuses[row['Charity Status']] += 1
            kinds[row['Regulatory Type']] += 1
            register[number] = (record, row, items)
    assert len(purposes) == 16, 'The register lists the 16 charitable purposes'
    excluded = {'notInRegisterDownload': sorted(n for n in candidates if n not in register)}
    dossiers = []
    edition_incomes = manifest['incomeDetailFields']
    edition_spending = manifest['spendingDetailFields']
    for number in sorted(candidates):
        if number not in register:
            continue
        _, edition_name, edition_status, edition_kind, location, spread, registry_record, periods = candidates[number]
        record, row, items = register[number]
        name = row['Charity Name'].strip()
        assert name and len(name) <= 250
        parent = None
        if row['Parent charity name'].strip() or row['Parent charity number'].strip():
            parent = {'name': row['Parent charity name'].strip() or None, 'number': row['Parent charity number'].strip() or None,
                      'country': row['Parent charity country of registration'].strip() or None}
        dossiers.append({
            'number': number, 'name': name, 'editionName': edition_name,
            'knownAs': row['Known As'].strip() or None,
            'status': row['Charity Status'].strip(), 'editionStatus': edition_status,
            'registered': uk_day(row['Registered Date']),
            'constitutionalForm': row['Constitutional Form'].strip() or None,
            'regulatoryType': row['Regulatory Type'].strip(), 'editionRegulatoryType': edition_kind,
            'mainOperatingLocation': row['Main Operating Location'].strip() or None,
            'geographicalSpread': row['Geographical Spread'].strip() or None,
            'designatedReligiousBody': row['Designated religious body'].strip() or None,
            'parent': parent,
            'purposes': items['Purposes'], 'beneficiaries': items['Beneficiaries'], 'activities': items['Activities'],
            'registerRecord': record, 'editionRegistryRecord': registry_record,
            'periods': [{
                'end': p[0], 'received': p[1], 'grossIncome': p[2], 'grossExpenditure': p[3], 'record': p[4],
                'incomeDetail': dict(zip(edition_incomes, p[5])) if p[5] is not None else None,
                'spendingDetail': dict(zip(edition_spending, p[6])) if p[6] is not None else None,
            } for p in sorted(periods, key=lambda p: p[0], reverse=True)],
        })
    hubs = {'registerRows': rows, 'statuses': dict(sorted(statuses.items())), 'regulatoryTypes': dict(sorted(kinds.items())),
            'purposes': dict(sorted(purposes.items()))}
    return dossiers, hubs, excluded, organizations, len(candidates), manifest


# ---------- Australia ----------
def au_candidates():
    directory, manifest = pinned_manifest('australia')
    assert manifest['format'] == 'charitology-acnc-ais-v1' and manifest['currency'] == 'AUD'
    assert manifest['periodFields'][:6] == ['aisYear', 'periodStart', 'periodEnd', 'consolidation', 'accountingBasis', 'sourceRecord']
    asset = manifest['asset']
    body = verified(directory / asset['path'], asset['sha256'], asset['bytes']).read_bytes()
    decoded = gzip.decompress(body)
    assert digest(decoded) == asset['decodedSha256']
    rows = json.loads(decoded)
    assert len(rows) == manifest['organizations']
    candidates = {}
    for abn, name, periods in rows:
        latest = max(periods, key=lambda p: p[2])
        if latest[6] is not None and latest[6] >= AU_REVENUE_THRESHOLD:
            assert abn not in candidates
            candidates[abn] = (name, periods)
    return candidates, manifest, len(rows)


def build_australia(acnc_dir, fields):
    candidates, manifest, organizations = au_candidates()
    verified(acnc_dir / ACNC_NOTES_FILE, fields['source']['sha256'], fields['source']['bytes'])
    path = verified(acnc_dir / ACNC_REGISTER['file'], ACNC_REGISTER['sha256'], ACNC_REGISTER['bytes'])
    subtype_columns = [s['column'] for s in fields['subtypes']]
    beneficiary_columns = [b['column'] for b in fields['beneficiaries']]
    state_columns = [f'Operates_in_{s}' for s in fields['operatingStates']]
    register = defaultdict(list)
    subtypes, sizes = Counter(), Counter()
    rows = withheld = 0
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        header = reader.fieldnames
        start = header.index('PBI')
        assert header[start:start + len(subtype_columns)] == subtype_columns, 'ACNC subtype columns changed'
        bstart = header.index('Aboriginal_or_TSI')
        assert header[bstart:bstart + len(beneficiary_columns)] == beneficiary_columns, 'ACNC beneficiary columns changed'
        assert bstart + len(beneficiary_columns) == len(header)
        assert header[header.index('Operates_in_ACT'):header.index('Operates_in_ACT') + 8] == state_columns
        for record, row in enumerate(reader, 1):
            assert None not in row and None not in row.values(), record
            rows += 1
            abn = row['ABN'].strip()
            assert abn == '' or re.fullmatch(r'[0-9]{11}', abn), record
            for column in subtype_columns + beneficiary_columns + state_columns:
                assert row[column] in ('', 'Y'), record
            for column in subtype_columns:
                if row[column] == 'Y':
                    subtypes[column] += 1
            sizes[row['Charity_Size'].strip() or None] += 1
            if not abn:
                # The user guide: an ABN can be withheld from the dataset.
                withheld += 1
                continue
            register[abn].append((record, row))
    excluded = {'notInRegisterDataset': sorted(a for a in candidates if a not in register),
                'repeatedInRegisterDataset': sorted(a for a in candidates if len(register.get(a, [])) > 1)}
    dossiers = []
    for abn in sorted(candidates):
        if len(register.get(abn, [])) != 1:
            continue
        edition_name, periods = candidates[abn]
        record, row = register[abn][0]
        name = row['Charity_Legal_Name'].strip()
        assert name and len(name) <= 250
        countries = [c.strip() for c in row['Operating_Countries'].split(',') if c.strip()]
        assert all(re.fullmatch(r'[A-Z]{3}', c) for c in countries)
        dossiers.append({
            'abn': abn, 'name': name, 'editionName': edition_name,
            'otherNames': row['Other_Organisation_Names'].strip() or None,
            'townCity': row['Town_City'].strip() or None, 'state': row['State'].strip() or None,
            'country': row['Country'].strip() or None,
            'registered': uk_day(row['Registration_Date']), 'established': uk_day(row['Date_Organisation_Established']),
            'charitySize': row['Charity_Size'].strip() or None, 'financialYearEnd': row['Financial_Year_End'].strip() or None,
            'operatesIn': [s for s, c in zip(fields['operatingStates'], state_columns) if row[c] == 'Y'],
            'operatingCountries': countries,
            'subtypes': [c for c in subtype_columns if row[c] == 'Y'],
            'beneficiaries': [c for c in beneficiary_columns if row[c] == 'Y'],
            'registerRecord': record,
            'periods': [{
                'aisYear': p[0], 'start': p[1], 'end': p[2], 'consolidation': p[3], 'accountingBasis': p[4], 'record': p[5],
                'totalRevenue': None if p[6] is None else str(p[6]), 'totalExpenses': None if p[7] is None else str(p[7]),
                'revenueFromGovernment': None if p[8] is None else str(p[8]),
                'grantsInAustralia': None if p[9] is None else str(p[9]), 'grantsOutsideAustralia': None if p[10] is None else str(p[10]),
            } for p in sorted(periods, key=lambda p: p[2], reverse=True)],
        })
    hubs = {'registerRows': rows, 'registerAbns': len(register), 'withheldAbns': withheld, 'subtypes': {c: subtypes[c] for c in subtype_columns},
            'charitySizes': {k or '': v for k, v in sorted(sizes.items(), key=lambda x: x[0] or '')}}
    return dossiers, hubs, excluded, organizations, len(candidates), manifest


# ---------- Canada ----------
def ca_candidates():
    directory, manifest = pinned_manifest('canada')
    assert manifest['format'] == 'charitology-ca-t3010-v1' and manifest['currency'] == 'CAD'
    assert manifest['periodFields'] == ['periodEnd', 'formVersion', 'financialSection', 'accountingBasis', 'financialSourceRecord',
                                        'identificationSourceRecord', 'totalRevenueCAD', 'totalExpendituresCAD', 'charitableProgramExpendituresCAD',
                                        'receivedFromRegisteredCharitiesCAD', 'giftsToQualifiedDoneesCAD', 'grantsToOtherGranteesCAD']
    candidates, organizations = {}, 0
    for bn, name, periods in load_shards(directory, manifest['names']):
        organizations += 1
        latest = max(periods, key=lambda p: p[0])
        assert sum(1 for p in periods if p[0] == latest[0]) == 1
        if latest[6] is not None and Decimal(latest[6]) >= CA_REVENUE_THRESHOLD:
            assert bn not in candidates
            candidates[bn] = (name, periods)
    assert organizations == manifest['accounts']
    return candidates, manifest, organizations


def read_ident(cra_dir, year, codes):
    source = CRA_IDENT[year]
    path = verified(cra_dir / source['file'], source['sha256'], source['bytes'])
    rows, categories, designations = {}, Counter(), Counter()
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        assert reader.fieldnames == ['BN', 'Category', 'Sub Category', 'Designation', 'Legal Name', 'Account Name',
                                     'Address Line 1', 'Address Line 2', 'City', 'Province', 'Postal Code', 'Country']
        for record, row in enumerate(reader, 1):
            assert None not in row and None not in row.values(), record
            bn = row['BN'].strip().upper()
            assert re.fullmatch(r'[0-9]{9}RR[0-9]{4}', bn) and bn not in rows, record
            category, designation = row['Category'].strip(), row['Designation'].strip()
            assert category in codes['categories'] and designation in codes['designations'], record
            assert re.fullmatch(r'[0-9]{4}', row['Sub Category'].strip()), record
            categories[category] += 1
            designations[designation] += 1
            rows[bn] = (record, row)
    return rows, {'rows': len(rows), 'categories': dict(sorted(categories.items())), 'designations': dict(sorted(designations.items()))}


def build_canada(cra_dir, codes):
    candidates, manifest, organizations = ca_candidates()
    verified(cra_dir / CRA_CODES_FILE, codes['source']['sha256'], codes['source']['bytes'])
    idents, counts = {}, {}
    for year in sorted(CRA_IDENT):
        idents[year], counts[year] = read_ident(cra_dir, year, codes)
    excluded = {'notInIdentificationFile': []}
    dossiers = []
    amounts = ['totalRevenue', 'totalExpenditures', 'charitableProgramExpenditures', 'receivedFromRegisteredCharities',
               'giftsToQualifiedDonees', 'grantsToOtherGrantees']
    for bn in sorted(candidates):
        edition_name, periods = candidates[bn]
        latest = max(periods, key=lambda p: p[0])
        year = latest[0][:4]
        assert year in idents
        if bn not in idents[year]:
            excluded['notInIdentificationFile'].append(bn)
            continue
        record, row = idents[year][bn]
        name = unicodedata.normalize('NFC', row['Legal Name'].strip())
        assert name and len(name) <= 250
        dossiers.append({
            'bn': bn, 'name': edition_name, 'identificationName': name,
            'accountName': unicodedata.normalize('NFC', row['Account Name'].strip()) or None,
            'city': row['City'].strip() or None, 'province': row['Province'].strip() or None, 'country': row['Country'].strip() or None,
            'category': row['Category'].strip(), 'subCategory': row['Sub Category'].strip(), 'designation': row['Designation'].strip(),
            'identificationYear': year, 'identificationRecord': record,
            'periods': [{
                'end': p[0], 'formVersion': p[1], 'section': p[2], 'accountingBasis': p[3], 'record': p[4], 'identificationSourceRecord': p[5],
                **dict(zip(amounts, p[6:12])),
            } for p in sorted(periods, key=lambda p: p[0], reverse=True)],
        })
    hubs = {'identification': counts}
    return dossiers, hubs, excluded, organizations, len(candidates), manifest


# ---------- Cause x Country ----------
def cause_groups(sc_hubs, codes, fields):
    wave1_manifest = json.loads(verified(WAVE1 / 'manifest.json', WAVE1_MANIFEST_SHA).read_bytes())
    out = wave1_manifest['outputs']
    irs = json.loads(verified(WAVE1 / out['codes']['path'], out['codes']['sha256'], out['codes']['bytes']).read_bytes())
    ew_hubs = json.loads(verified(WAVE1 / out['ewHubs']['path'], out['ewHubs']['sha256'], out['ewHubs']['bytes']).read_bytes())
    labels = {
        'us': [[g, label] for g, label in irs['majorGroups'].items()],
        'ew': [[code, p['description']] for code, p in ew_hubs['purposes'].items()],
        'scotland': [[label, label] for label in sorted(sc_hubs['purposes'])],
        'australia': [[s['column'], s['label']] for s in fields['subtypes']],
        'canada': [[code, label] for code, label in codes['categories'].items()],
    }
    groups, grouped = [], {r: set() for r in REGISTRIES}
    for gid, name, stems in CAUSE_GROUPS:
        matches = {}
        for registry in REGISTRIES:
            hits = [key for key, label in labels[registry] if any(word_match(label, stem) for stem in stems)]
            matches[registry] = hits
            grouped[registry].update(hits)
        assert sum(1 for r in REGISTRIES if matches[r]) >= 2, f'{gid} must match labels in at least two registers'
        groups.append({'id': gid, 'name': name, 'stems': stems, 'matches': matches})
    return {
        'format': 'charitology-cause-by-country-v1',
        'edition': EDITION,
        'rule': ('A cause group lists every published category label, in each register, that contains a word starting with one of '
                 'the group’s stems (case-insensitive). Matching uses label text only. The registers define their categories '
                 'differently, so a group is a reading aid, not an equivalence or an official crosswalk. A label can fall in more '
                 'than one group or in none, and an organization appears only under its own register’s labels.'),
        'labels': labels,
        'groups': groups,
        'ungrouped': {r: [key for key, _ in labels[r] if key not in grouped[r]] for r in REGISTRIES},
    }


def write_json(name, value):
    raw = (json.dumps(value, ensure_ascii=False, indent=None, separators=(',', ':')) + '\n').encode()
    (OUT / name).write_bytes(raw)
    return {'path': name, 'bytes': len(raw), 'sha256': digest(raw)}


def committed(name):
    path = ROOT / name
    return {'path': path.name, 'bytes': path.stat().st_size, 'sha256': file_digest(path)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--oscr-dir', type=Path, required=True)
    parser.add_argument('--acnc-dir', type=Path, required=True)
    parser.add_argument('--cra-dir', type=Path, required=True)
    args = parser.parse_args()
    codes = json.loads((ROOT / CRA_CODES).read_bytes())
    fields = json.loads((ROOT / ACNC_FIELDS).read_bytes())
    assert codes['format'] == 'charitology-cra-codes-v1' and fields['format'] == 'charitology-acnc-register-fields-v1'
    sc, sc_hubs, sc_excluded, sc_orgs, sc_count, sc_manifest = build_scotland(args.oscr_dir)
    au, au_hubs, au_excluded, au_orgs, au_count, au_manifest = build_australia(args.acnc_dir, fields)
    au_candidate_names = {abn: name for abn, (name, _) in au_candidates()[0].items()}
    au_excluded_names = [[abn, au_candidate_names[abn]] for key in ('notInRegisterDataset', 'repeatedInRegisterDataset') for abn in au_excluded[key]]
    ca, ca_hubs, ca_excluded, ca_orgs, ca_count, ca_manifest = build_canada(args.cra_dir, codes)
    causes = cause_groups(sc_hubs, codes, fields)
    outputs = {
        'scotland': write_json('scotland-dossiers.json', sc),
        'scotlandHubs': write_json('scotland-hubs.json', sc_hubs),
        'australia': write_json('australia-dossiers.json', au),
        'australiaHubs': write_json('australia-hubs.json', au_hubs),
        'canada': write_json('canada-dossiers.json', ca),
        'canadaHubs': write_json('canada-hubs.json', ca_hubs),
        'causes': write_json('cause-groups.json', causes),
        'craCodes': committed(CRA_CODES),
        'acncFields': committed(ACNC_FIELDS),
    }
    ais = au_manifest['sources']
    manifest = {
        'format': 'charitology-registry-wave1b-v1',
        'edition': EDITION,
        'builder': 'scripts/build-registry-wave1b.py',
        'checker': 'scripts/check-registry-wave1b.mjs',
        'policy': 'Figures are copied as published. Inclusion follows one published-figure threshold per register and is a coverage boundary, not a rating, ranking or endorsement. Null means not supplied; it is never zero. Cause groups match published category labels only and are not a crosswalk.',
        'selection': {
            'scotland': {'rule': 'Charities in the committed OSCR edition whose latest included annual return reports gross income ("Most recent year income") of at least the threshold, and which the OSCR register download below still lists under the same charity number.',
                         'thresholdGBP': SC_INCOME_THRESHOLD, 'editionOrganizations': sc_orgs, 'candidates': sc_count,
                         'dossiers': len(sc), 'excluded': sc_excluded},
            'australia': {'rule': 'Organizations in the committed ACNC Annual Information Statement edition whose latest dated reporting period reports total revenue of at least the threshold, and whose ABN appears exactly once in the ACNC Registered Charities dataset below.',
                          'thresholdAUD': AU_REVENUE_THRESHOLD, 'editionOrganizations': au_orgs, 'candidates': au_count,
                          'dossiers': len(au), 'excluded': au_excluded,
                          'excludedEditionNames': au_excluded_names},
            'canada': {'rule': 'Registered charity accounts in the committed CRA T3010 edition whose latest fiscal period reports total revenue (line 4700) of at least the threshold, and whose account number appears in the CRA identification file for that fiscal year below.',
                       'thresholdCAD': CA_REVENUE_THRESHOLD, 'editionOrganizations': ca_orgs, 'candidates': ca_count,
                       'dossiers': len(ca), 'excluded': ca_excluded},
            'hubMinimumDossiers': HUB_MIN_DOSSIERS,
        },
        'pinnedEditions': {key: {'path': rel, 'sha256': sha} for key, (rel, sha) in PINNED.items()},
        'sources': {
            'oscrRegister': {'publisher': 'Office of the Scottish Charity Regulator', 'title': 'Scottish Charity Register download',
                             'page': OSCR_PAGE, 'fieldNotes': OSCR_FIELDS, 'licence': OGL,
                             'attribution': sc_manifest['attribution'],
                             'url': OSCR_REGISTER['url'], 'served': OSCR_REGISTER['served'], 'member': OSCR_REGISTER['member'],
                             'memberDate': OSCR_REGISTER['memberDate'], 'responseDate': OSCR_REGISTER['date'],
                             'retrievedAt': OSCR_REGISTER['retrievedAt'], 'bytes': OSCR_REGISTER['bytes'], 'sha256': OSCR_REGISTER['sha256'],
                             'rows': sc_hubs['registerRows']},
            'oscrReturns': {'publisher': 'Office of the Scottish Charity Regulator', 'edition': sc_manifest['date'],
                            'url': sc_manifest['sources']['returns']['url'], 'member': sc_manifest['sources']['returns']['member'],
                            'sha256': sc_manifest['sources']['returns']['sha256'],
                            'registerMember': sc_manifest['sources']['register']['member'], 'registerSha256': sc_manifest['sources']['register']['sha256'],
                            'note': 'Read from the committed Scotland edition; not downloaded again.'},
            'acncRegister': {'publisher': 'Australian Charities and Not-for-profits Commission', 'title': 'ACNC Registered Charities',
                             'page': ACNC_PAGE, 'dataset': ACNC_DATASET, 'licence': CC_BY_AU,
                             'url': ACNC_REGISTER['url'], 'lastModified': ACNC_REGISTER['lastModified'], 'retrievedAt': ACNC_REGISTER['retrievedAt'],
                             'bytes': ACNC_REGISTER['bytes'], 'sha256': ACNC_REGISTER['sha256'], 'rows': au_hubs['registerRows']},
            'acncUserGuide': fields['source'],
            'acncAis': {'publisher': 'Australian Charities and Not-for-profits Commission', 'edition': au_manifest['date'], 'licence': au_manifest['license'],
                        'files': {str(s['year']): {'dataset': s['dataset'], 'url': s['csv'], 'notes': s['notes'], 'bytes': s['bytes'], 'sha256': s['sha256'],
                                                   'rows': s['inputRows']} for s in ais},
                        'note': 'Read from the committed ACNC AIS edition; not downloaded again.'},
            'craIdentification': {str(y): {'publisher': 'Canada Revenue Agency', 'title': f'{y} List of charities: Identification',
                                           'catalogue': CRA_CATALOGUE + s['dataset'],
                                           'url': f"{CRA_CATALOGUE}{s['dataset']}/resource/{s['resource']}/download/{s['file']}",
                                           'lastModified': s['lastModified'], 'retrievedAt': s['retrievedAt'], 'bytes': s['bytes'], 'sha256': s['sha256'],
                                           'rows': ca_hubs['identification'][y]['rows'], 'licence': OGL_CANADA} for y, s in CRA_IDENT.items()},
            'craFinancial': {'publisher': 'Canada Revenue Agency', 'edition': ca_manifest['capturedOn'], 'licence': ca_manifest['licence'],
                             'files': {y: {'catalogue': e['catalogue'], 'url': e['finance']['url'], 'file': e['finance']['file'], 'sha256': e['finance']['sha256'],
                                           'identificationFile': e['identification']['file'], 'identificationSha256': e['identification']['sha256']}
                                       for y, e in ca_manifest['editions'].items()},
                             'amountLines': ca_manifest['amountLines'],
                             'note': 'Read from the committed CRA T3010 edition (files captured 2026-11-11); not downloaded again. The identification files above are the later re-publication of 2026-11-13.'},
            'craCodes': codes['source'],
            'wave1': {'path': 'public/data/registry-wave1/manifest.json', 'sha256': WAVE1_MANIFEST_SHA,
                      'note': 'NTEE major groups and Charity Commission purposes for the Cause x Country labels.'},
        },
        'outputs': outputs,
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'Scotland dossiers {len(sc)} of {sc_count}; Australia {len(au)} of {au_count}; Canada {len(ca)} of {ca_count}.')
    print(json.dumps({'scotland': sc_excluded, 'australia': au_excluded, 'canada': ca_excluded})[:3000])
    for group in causes['groups']:
        print(group['id'], {r: len(v) for r, v in group['matches'].items()})


if __name__ == '__main__':
    main()
