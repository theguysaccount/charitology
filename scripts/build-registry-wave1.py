"""Build the Wave 1 verified charity dossier dataset from exact official registry files.

Every figure is copied as published. Nothing is estimated, scored, ranked or
inferred. The selection uses one published figure per jurisdiction, recorded in
the manifest, so the same inputs always produce the same files.

Inputs (each verified by SHA-256 before it is read):
  --irs-dir   eo1.csv .. eo4.csv (IRS EO BMF), 23eoextract990.zip and
              24eoextract990.zip (IRS SOI annual Form 990 extracts)
  --ccew-dir  publicextract.charity.zip and
              publicextract.charity_classification.zip (Charity Commission)
It also reads the committed, hash-pinned editions in
public/data/charity-financials/{us,ew}/ and the committed IRS code
transcription public/data/registry-wave1/irs-eo-bmf-codes.json.

Usage:
  python3 -I scripts/build-registry-wave1.py --irs-dir DIR --ccew-dir DIR

scripts/check-registry-wave1.mjs verifies the committed outputs, the selection
rule and the built pages offline.
"""
import argparse
import csv
import gzip
import io
import json
import re
from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/data/registry-wave1'
EDITION = '2026-11-27'
US_REVENUE_THRESHOLD = 150_000_000
EW_INCOME_THRESHOLD = 25_000_000
STATE_GROUP_MIN_DOSSIERS = 5

IRS_SOI = 'https://www.irs.gov/pub/irs-soi/'
IRS_BMF_PAGE = 'https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf'
IRS_SOI_PAGE = 'https://www.irs.gov/statistics/soi-tax-stats-annual-extract-of-tax-exempt-organization-financial-data'
CCEW_BASE = 'https://ccewuksprdoneregsadata1.blob.core.windows.net/data/txt/'
CCEW_PAGE = 'https://register-of-charities.charitycommission.gov.uk/en/register/full-register-download'
OGL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'

BMF_FILES = [
    {'region': 1, 'file': 'eo1.csv', 'lastModified': 'Mon, 09 Nov 2026 05:10:54 GMT', 'retrievedAt': '2026-11-27T21:25:00Z',
     'bytes': 49166596, 'sha256': '5d1047c15cb6109b73ed244da97961b92a3ec122ac4419f354d248dc059df4e6'},
    {'region': 2, 'file': 'eo2.csv', 'lastModified': 'Mon, 09 Nov 2026 05:10:56 GMT', 'retrievedAt': '2026-11-27T21:25:03Z',
     'bytes': 127286751, 'sha256': '46db809791e9cfe785c74fd6028ed18612f8a639edf763142c017cce3446ccfa'},
    {'region': 3, 'file': 'eo3.csv', 'lastModified': 'Mon, 09 Nov 2026 05:10:59 GMT', 'retrievedAt': '2026-11-27T21:25:09Z',
     'bytes': 167027760, 'sha256': '4902eab594c4be7312192bb03ee5082580ca208bd4f6b9b5a6bcfc009c8f27f4'},
    {'region': 4, 'file': 'eo4.csv', 'lastModified': 'Mon, 09 Nov 2026 05:11:02 GMT', 'retrievedAt': '2026-11-27T21:25:19Z',
     'bytes': 886271, 'sha256': '3c161b91056ea9291723aa608e40fe093a605238866e4ef8de8d6d9e26ce325c'},
]
# The same archive bytes as the committed U.S. Form 990 edition (its manifest pins these hashes).
SOI_FILES = {
    2023: {'file': '23eoextract990.zip', 'member': '23eoextract990.csv', 'lastModified': 'Fri, 11 Jul 2025 18:10:38 GMT',
           'retrievedAt': '2026-11-27T21:25:19Z', 'bytes': 55260607,
           'sha256': 'a32f2744b6d7b1456579cd668eff5dd51f7f79f6e13e21a832c3654353dcd99f',
           'documentation': '23eofinextractdoc.xlsx', 'documentationSha256': '5cd4d5bc7b63d85479f5986c84e468cb14666c6bb4c58cc3f9c3c392dd100426'},
    2024: {'file': '24eoextract990.zip', 'member': '24eoextract990.csv', 'lastModified': 'Fri, 01 Aug 2025 02:10:14 GMT',
           'retrievedAt': '2026-11-27T21:25:22Z', 'bytes': 56682054,
           'sha256': 'dc3898cad2007fdb194d73281c3eb625773ea90626c22ca167e842d205a49d10',
           'documentation': '24eofinextractdoc.xlsx', 'documentationSha256': '80319c89b3a80c28f09a941fad8433d487e60594c606d8a49a13349485c7e5ba'},
}
CCEW_FILES = {
    'register': {'file': 'publicextract.charity.zip', 'member': 'publicextract.charity.txt',
                 'lastModified': 'Fri, 27 Nov 2026 01:07:59 GMT', 'retrievedAt': '2026-11-27T21:25:15Z', 'bytes': 44331134,
                 'sha256': '662b9764896545b4aa035bc024da1fa1b297486ebdf119cb432671e6394a0a47'},
    'classification': {'file': 'publicextract.charity_classification.zip', 'member': 'publicextract.charity_classification.txt',
                       'lastModified': 'Fri, 27 Nov 2026 01:07:47 GMT', 'retrievedAt': '2026-11-27T21:25:25Z', 'bytes': 7695734,
                       'sha256': 'c4fe7dc01ef33305849ff3bf5ed06d4d016363aa6c1a08f1f02f5a863cbeefeb'},
}
CCEW_EXTRACT_DAY = '2026-11-27'
PINNED = {
    'us': ('public/data/charity-financials/us/manifest.json', 'ee9d0b2aee1f2bae3715e14ed14575b936f2b88e485daa5fc37164804db42a6e'),
    'ew': ('public/data/charity-financials/ew/manifest.json', 'ab5ed15e344c79ff197f6c10e03ca1eef929c80adb614d9212249fe872102056'),
}
CODES_FILE = 'public/data/registry-wave1/irs-eo-bmf-codes.json'

# SOI column -> output key and the Form 990 line the IRS documentation names.
SOI_FIELDS = [
    ('totrevenue', 'totalRevenue', 'Part VIII, line 12, column (A)'),
    ('totcntrbgfts', 'contributions', 'Part VIII, line 1h, column (A)'),
    ('totprgmrevnue', 'programServiceRevenue', 'Part VIII, line 2g, column (A)'),
    ('invstmntinc', 'investmentIncome', 'Part VIII, line 3, column (A)'),
    ('totfuncexpns', 'functionalExpenses', 'Part IX, line 25, column (A)'),
    ('grntstogovt', 'grantsUSOrganizations', 'Part IX, line 1, column (A)'),
    ('grnsttoindiv', 'grantsUSIndividuals', 'Part IX, line 2, column (A)'),
    ('grntstofrgngovt', 'grantsOutsideUS', 'Part IX, line 3, column (A)'),
    ('totassetsend', 'assetsEndOfYear', 'Part X, line 16, column (B)'),
    ('totliabend', 'liabilitiesEndOfYear', 'Part X, line 26, column (B)'),
    ('totnetassetend', 'netAssetsEndOfYear', 'Part X, line 33, column (B)'),
]
# Values in the committed edition, by position in its period array, that must agree exactly.
PINNED_US_POSITIONS = {1: 'totalRevenue', 2: 'functionalExpenses', 3: 'programServiceRevenue',
                       4: 'grantsUSOrganizations', 5: 'grantsOutsideUS'}
PRIVATE_FOUNDATION_CODES = {'02', '03', '04'}


def digest(body):
    return sha256(body).hexdigest()


def file_digest(path):
    h = sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(1 << 20):
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


def amount(raw):
    value = raw.strip()
    if not value:
        return None
    if not re.fullmatch(r'-?[0-9]{1,15}(?:\.[0-9]{1,2})?', value):
        raise ValueError(f'Unexpected amount {value!r}')
    return value


def iso_day(raw):
    value = raw.strip()
    if not value:
        return None
    return date.fromisoformat(value[:10]).isoformat()


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


def us_candidates():
    directory, manifest = pinned_manifest('us')
    assert manifest['format'] == 'charitology-us-form990-v1'
    assert all(manifest['sources'][str(y)]['sha256'] == SOI_FILES[y]['sha256'] for y in SOI_FILES)
    candidates, organizations = {}, 0
    for ein, registry_match, periods in load_shards(directory, manifest['shards']):
        organizations += 1
        latest = max(periods, key=lambda p: p[0])
        if latest[1] is not None and Decimal(latest[1]) >= US_REVENUE_THRESHOLD:
            candidates[ein] = periods
    assert organizations == manifest['counts']['organizations']
    return candidates, manifest, organizations


def read_bmf(irs_dir, wanted):
    """Return wanted EIN rows plus subsection 03 counts for the whole posting."""
    rows, total, total03 = {}, 0, 0
    states = defaultdict(lambda: {'records': 0, 'withNtee': 0, 'nonstandardNtee': 0, 'privateFoundations': 0, 'groups': Counter()})
    groups = defaultdict(lambda: {'records': 0, 'codes': Counter(), 'states': Counter()})
    seen = set()
    per_region = []
    for source in BMF_FILES:
        path = verified(irs_dir / source['file'], source['sha256'], source['bytes'])
        count = 0
        with path.open(encoding='utf-8', newline='') as stream:
            reader = csv.DictReader(stream)
            assert reader.fieldnames[:9] == ['EIN', 'NAME', 'ICO', 'STREET', 'CITY', 'STATE', 'ZIP', 'GROUP', 'SUBSECTION']
            assert 'NTEE_CD' in reader.fieldnames and 'FOUNDATION' in reader.fieldnames
            for row in reader:
                assert None not in row
                count += 1
                ein = row['EIN'].strip()
                assert re.fullmatch(r'[0-9]{9}', ein) and ein not in seen
                seen.add(ein)
                if row['SUBSECTION'] != '03':
                    if ein in wanted:
                        rows[ein] = None
                    continue
                total03 += 1
                state = row['STATE'].strip()
                ntee = row['NTEE_CD'].strip()
                bucket = states[state]
                bucket['records'] += 1
                if row['FOUNDATION'].strip() in PRIVATE_FOUNDATION_CODES:
                    bucket['privateFoundations'] += 1
                if ntee and not re.fullmatch(r'[A-Z][0-9A-Z]{1,3}', ntee):
                    # Kept exactly as published, but it names no NTEE major group.
                    bucket['nonstandardNtee'] += 1
                elif ntee:
                    letter = ntee[0]
                    bucket['withNtee'] += 1
                    bucket['groups'][letter] += 1
                    group = groups[letter]
                    group['records'] += 1
                    group['codes'][ntee[:3]] += 1
                    group['states'][state] += 1
                if ein in wanted:
                    rows[ein] = {
                        'name': row['NAME'].strip(),
                        'city': row['CITY'].strip() or None,
                        'state': state or None,
                        'subsection': '03',
                        'foundation': row['FOUNDATION'].strip() or None,
                        'deductibility': row['DEDUCTIBILITY'].strip() or None,
                        'status': row['STATUS'].strip() or None,
                        'ruling': row['RULING'].strip() or None,
                        'ntee': ntee or None,
                        'bmfTaxPeriod': row['TAX_PERIOD'].strip() or None,
                        'bmfRegion': source['region'],
                    }
        total += count
        per_region.append(count)
    return rows, {'records': total, 'subsection03': total03, 'regionRows': per_region,
                  'states': states, 'groups': groups}


def read_soi(irs_dir, needed):
    """needed: {(year, record): (ein, month)}. Returns {(year, record): fields}."""
    found = {}
    for year, source in SOI_FILES.items():
        verified(irs_dir / source['documentation'], source['documentationSha256'])
        path = verified(irs_dir / source['file'], source['sha256'], source['bytes'])
        wanted = {record: key for (y, record), key in needed.items() if y == year}
        with ZipFile(path) as archive, archive.open(source['member']) as raw:
            reader = csv.reader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''))
            header = [column.strip().lower() for column in next(reader)]
            assert len(set(header)) == len(header)
            index = {name: header.index(name) for name in ['ein', 'tax_pd', 'subseccd', 'efile', *[f[0] for f in SOI_FIELDS]]}
            for record, row in enumerate(reader, 1):
                if record not in wanted:
                    continue
                assert len(row) == len(header)
                ein, month = wanted[record]
                assert row[index['ein']].strip().zfill(9) == ein
                assert row[index['tax_pd']].strip() == month.replace('-', '')
                assert row[index['subseccd']].strip() in ('03', '3')
                efile = row[index['efile']].strip()
                assert efile in ('E', 'P', '')
                fields = {'efile': efile or None}
                for column, key, _ in SOI_FIELDS:
                    fields[key] = amount(row[index[column]])
                found[(year, record)] = fields
        assert len([k for k in found if k[0] == year]) == len(wanted), f'Missing SOI records for {year}'
    return found


def build_us(irs_dir, codes):
    candidates, manifest, organizations = us_candidates()
    bmf, posting = read_bmf(irs_dir, set(candidates))
    excluded = {'notInBmfPosting': sorted(e for e in candidates if e not in bmf),
                'notSubsection03InBmfPosting': sorted(e for e, r in bmf.items() if r is None)}
    selected = sorted(e for e, r in bmf.items() if r is not None)
    needed = {}
    for ein in selected:
        for period in candidates[ein]:
            assert len(period[6]) == 1, 'One source record per period'
            (year, record), = period[6]
            needed[(year, record)] = (ein, period[0])
    soi = read_soi(irs_dir, needed)
    dossiers = []
    for ein in selected:
        periods = []
        for period in sorted(candidates[ein], key=lambda p: p[0], reverse=True):
            (year, record), = period[6]
            fields = soi[(year, record)]
            for position, key in PINNED_US_POSITIONS.items():
                assert fields[key] == period[position], f'{ein} {period[0]} {key} disagrees with the pinned edition'
            periods.append({'taxPeriod': period[0], 'extractYear': year, 'record': record, **fields})
        identity = bmf[ein]
        assert identity['name'] and len(identity['name']) <= 250
        dossiers.append({'ein': ein, **identity, 'periods': periods})
    states = {}
    for state, bucket in sorted(posting['states'].items()):
        states[state] = {'records': bucket['records'], 'withNtee': bucket['withNtee'], 'nonstandardNtee': bucket['nonstandardNtee'],
                         'privateFoundations': bucket['privateFoundations'],
                         'groups': dict(sorted(bucket['groups'].items()))}
    groups = {}
    for letter, group in sorted(posting['groups'].items()):
        assert letter in codes['majorGroups']
        groups[letter] = {
            'records': group['records'],
            'distinctCoreCodes': len(group['codes']),
            'coreCodes': [[code, count] for code, count in sorted(group['codes'].items(), key=lambda x: (-x[1], x[0]))[:5]],
            'states': dict(sorted(group['states'].items())),
        }
    hubs = {'posting': {'records': posting['records'], 'subsection03': posting['subsection03'],
                        'subsection03WithNtee': sum(s['withNtee'] for s in states.values()),
                        'regionRows': posting['regionRows']},
            'states': states, 'groups': groups}
    return dossiers, hubs, excluded, organizations, len(candidates), manifest


def read_tsv(ccew_dir, key):
    source = CCEW_FILES[key]
    path = verified(ccew_dir / source['file'], source['sha256'], source['bytes'])
    with ZipFile(path) as archive, archive.open(source['member']) as raw:
        reader = csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''), delimiter='\t', quoting=csv.QUOTE_NONE)
        for row in reader:
            assert None not in row, 'Unexpected TSV row shape'
            assert iso_day(row['date_of_extract']) == CCEW_EXTRACT_DAY
            yield row


def ew_candidates():
    directory, manifest = pinned_manifest('ew')
    assert manifest['format'] == 'charitology-ew-returns-v1'
    candidates, organizations = {}, 0
    for number, name, organisation, periods in load_shards(directory, manifest['names']):
        organizations += 1
        latest = max(periods, key=lambda p: p[1])
        if latest[3] is not None and Decimal(latest[3]) >= EW_INCOME_THRESHOLD:
            assert number not in candidates
            candidates[number] = (name, organisation, periods)
    assert organizations == manifest['organizations']
    return candidates, manifest, organizations


def build_ew(ccew_dir):
    candidates, manifest, organizations = ew_candidates()
    register, registered_main = {}, set()
    for row in read_tsv(ccew_dir, 'register'):
        if row['linked_charity_number'] != '0':
            continue
        number = row['registered_charity_number'].strip()
        if row['charity_registration_status'] == 'Registered':
            registered_main.add(row['organisation_number'])
        if number in candidates and row['organisation_number'] == candidates[number][1]:
            assert number not in register
            register[number] = {
                'name': row['charity_name'].strip(),
                'charityType': row['charity_type'].strip() or None,
                'registrationStatus': row['charity_registration_status'].strip(),
                'registered': iso_day(row['date_of_registration']),
                'removed': iso_day(row['date_of_removal']),
                'reportingStatus': row['charity_reporting_status'].strip() or None,
                'companyNumber': row['charity_company_registration_number'].strip() or None,
                'cio': row['charity_is_cio'].strip() == 'True' if row['charity_is_cio'].strip() else None,
                'insolvent': row['charity_insolvent'].strip() == 'True',
                'inAdministration': row['charity_in_administration'].strip() == 'True',
            }
    classifications = defaultdict(lambda: {'What': [], 'Who': [], 'How': []})
    purposes = defaultdict(lambda: {'description': None, 'charities': 0})
    for row in read_tsv(ccew_dir, 'classification'):
        if row['linked_charity_number'] != '0' or row['organisation_number'] not in registered_main:
            continue
        kind, code, description = row['classification_type'], row['classification_code'].strip(), row['classification_description'].strip()
        assert kind in ('What', 'Who', 'How') and re.fullmatch(r'[0-9]{3}', code) and description
        number = row['registered_charity_number'].strip()
        if kind == 'What':
            entry = purposes[code]
            assert entry['description'] in (None, description)
            entry['description'] = description
            entry['charities'] += 1
        if number in register and row['organisation_number'] == candidates[number][1]:
            classifications[number][kind].append([code, description])
    excluded = {'notInRegisterExtract': sorted(n for n in candidates if n not in register),
                'notRegisteredInRegisterExtract': sorted(n for n, r in register.items() if r['registrationStatus'] != 'Registered')}
    dossiers = []
    for number in sorted(candidates, key=int):
        record = register.get(number)
        if not record or record['registrationStatus'] != 'Registered':
            continue
        edition_name, organisation, periods = candidates[number]
        found = classifications.get(number, {'What': [], 'Who': [], 'How': []})
        dossiers.append({
            'number': number, 'organisationNumber': organisation, **record,
            'editionName': edition_name,
            'what': sorted(found['What']), 'who': sorted(found['Who']), 'how': sorted(found['How']),
            'periods': [{'start': p[0], 'end': p[1], 'received': p[2], 'grossIncome': p[3], 'grossExpenditure': p[4], 'record': p[5]}
                        for p in sorted(periods, key=lambda p: p[1], reverse=True)],
        })
    hubs = {'registeredMain': len(registered_main),
            'purposes': {code: dict(value) for code, value in sorted(purposes.items())}}
    return dossiers, hubs, excluded, organizations, len(candidates), manifest


def write_json(name, value):
    raw = (json.dumps(value, ensure_ascii=False, indent=None, separators=(',', ':')) + '\n').encode()
    (OUT / name).write_bytes(raw)
    return {'path': name, 'bytes': len(raw), 'sha256': digest(raw)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--irs-dir', type=Path, required=True)
    parser.add_argument('--ccew-dir', type=Path, required=True)
    args = parser.parse_args()
    codes_path = ROOT / CODES_FILE
    codes = json.loads(codes_path.read_bytes())
    assert codes['format'] == 'charitology-irs-eo-bmf-codes-v1'
    us, us_hubs, us_excluded, us_orgs, us_candidates_count, us_manifest = build_us(args.irs_dir, codes)
    ew, ew_hubs, ew_excluded, ew_orgs, ew_candidates_count, ew_manifest = build_ew(args.ccew_dir)
    outputs = {
        'us': write_json('us-form-990-dossiers.json', us),
        'usHubs': write_json('us-hubs.json', us_hubs),
        'ew': write_json('england-wales-dossiers.json', ew),
        'ewHubs': write_json('england-wales-hubs.json', ew_hubs),
    }
    outputs['codes'] = {'path': 'irs-eo-bmf-codes.json', 'bytes': codes_path.stat().st_size, 'sha256': file_digest(codes_path)}
    manifest = {
        'format': 'charitology-registry-wave1-v1',
        'edition': EDITION,
        'builder': 'scripts/build-registry-wave1.py',
        'checker': 'scripts/check-registry-wave1.mjs',
        'policy': 'Figures are copied as published. Inclusion follows one published-figure threshold per register and is a coverage boundary, not a rating, ranking or endorsement. Null means not supplied; it is never zero.',
        'selection': {
            'us': {'rule': 'IRS subsection 03 Form 990 filers in the committed U.S. Form 990 edition whose latest selected tax period reports total revenue (Part VIII, line 12) of at least the threshold, and whose EIN appears with subsection 03 in the EO BMF posting below.',
                   'thresholdUSD': US_REVENUE_THRESHOLD, 'editionOrganizations': us_orgs, 'candidates': us_candidates_count,
                   'dossiers': len(us), 'excluded': us_excluded},
            'ew': {'rule': 'Registered main charities in the committed England and Wales annual-return edition whose latest financial year reports gross income of at least the threshold, and which the register extract below still lists as Registered under the same organisation number.',
                   'thresholdGBP': EW_INCOME_THRESHOLD, 'editionOrganizations': ew_orgs, 'candidates': ew_candidates_count,
                   'dossiers': len(ew), 'excluded': ew_excluded},
            'stateGroupHubMinimumDossiers': STATE_GROUP_MIN_DOSSIERS,
        },
        'pinnedEditions': {key: {'path': rel, 'sha256': sha} for key, (rel, sha) in PINNED.items()},
        'sources': {
            'irsEoBmf': {'publisher': 'Internal Revenue Service', 'title': 'Exempt Organizations Business Master File Extract (EO BMF)',
                         'page': IRS_BMF_PAGE, 'reuse': 'Public IRS records; United States Government work, 17 USC 105. No IRS endorsement.',
                         'files': [{**{k: v for k, v in s.items() if k != 'file'}, 'url': IRS_SOI + s['file'],
                                    'rows': us_hubs['posting']['regionRows'][s['region'] - 1]} for s in BMF_FILES]},
            'irsSoiForm990': {'publisher': 'Internal Revenue Service, Statistics of Income', 'title': 'Annual extract of tax-exempt organization financial data (Form 990)',
                              'page': IRS_SOI_PAGE, 'reuse': 'Public IRS records; United States Government work, 17 USC 105. No IRS endorsement.',
                              'fields': [{'column': c, 'key': k, 'form990': line} for c, k, line in SOI_FIELDS],
                              'files': {str(y): {'url': IRS_SOI + s['file'], 'lastModified': s['lastModified'], 'retrievedAt': s['retrievedAt'],
                                                 'bytes': s['bytes'], 'sha256': s['sha256'], 'documentation': IRS_SOI + s['documentation'],
                                                 'documentationSha256': s['documentationSha256']} for y, s in SOI_FILES.items()}},
            'ccewRegister': {'publisher': 'Charity Commission for England and Wales', 'title': 'Register of charities: full register download',
                             'page': CCEW_PAGE, 'licence': OGL, 'extractDate': CCEW_EXTRACT_DAY,
                             'attribution': 'Contains public sector information licensed under the Open Government Licence v3.0.',
                             'files': {k: {'url': CCEW_BASE + s['file'], 'member': s['member'], 'lastModified': s['lastModified'],
                                           'retrievedAt': s['retrievedAt'], 'bytes': s['bytes'], 'sha256': s['sha256']} for k, s in CCEW_FILES.items()}},
            'ccewAnnualReturns': {'publisher': 'Charity Commission for England and Wales', 'edition': ew_manifest['date'],
                                  'url': ew_manifest['sources']['returns']['url'], 'sha256': ew_manifest['sources']['returns']['sha256'],
                                  'note': 'Read from the committed England and Wales annual-return edition; not downloaded again.'},
            'irsCodes': codes['source'],
        },
        'outputs': outputs,
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f"U.S. dossiers {len(us)} of {us_candidates_count} candidates; England and Wales dossiers {len(ew)} of {ew_candidates_count}.")
    print(json.dumps({'us': us_excluded | {}, 'ew': ew_excluded}, indent=None)[:2000])


if __name__ == '__main__':
    main()
