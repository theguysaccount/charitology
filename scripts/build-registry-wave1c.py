"""Build the Wave 1c verified charity dossier dataset from committed official registry editions.

Wave 1c extends the Wave 1 and Wave 1b dossiers to the national registers that
`npm run check:references` already validates. It downloads nothing: every input
is a committed, hash-pinned edition under public/data/ (each edition manifest is
pinned by SHA-256 below, and each asset is verified against its manifest before
it is read). Figures are copied exactly as the committed edition stores them.
Nothing is estimated, scored, ranked, rated or summed.

Two kinds of register are covered:
  * Registers whose committed edition carries per-organization financial
    figures get one dossier page per organization at or above one stated
    published-figure threshold (New Zealand, Northern Ireland, Japan, Sweden,
    Mexico, Slovakia, Poland).
  * Registers whose committed edition carries only registry and classification
    data get country hubs built from the register's own category labels, each
    with at least five organizations, listing the official register entries
    (Austria, Finland, Latvia, Denmark, Croatia).

The cause grouping reuses the Wave 1b stems unchanged and adds stems for labels
published in other languages; every stem, match and ungrouped label is written
to cause-groups.json.

Usage:
  python3 -I scripts/build-registry-wave1c.py

scripts/check-registry-wave1c.mjs re-derives every selection, figure, hub and
cause match from the same committed editions and verifies the built pages.
"""
import csv
import gzip
import io
import json
import re
from collections import Counter, defaultdict
from decimal import Decimal
from hashlib import sha256
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/data/registry-wave1c'
EDITION = '2026-11-28'
HUB_MIN = 5
HUB_LIST_CAP = 1000  # Croatia's register-only hubs list at most this many entries; the other registers' hubs list every entry

PINNED = {
    'nz': 'public/data/charity-registry/new-zealand/manifest.json',
    'ni': 'public/data/charity-registry/northern-ireland/manifest.json',
    'niAnomalies': 'public/data/charity-registry/northern-ireland/anomalies.json',
    'jp': 'public/data/charity-registry/japan-npo/manifest.json',
    'se': 'public/data/charity-registry/sweden/manifest.json',
    'seAnomalies': 'public/data/funding-flows/sweden-90-konto/anomalies.json',
    'mx': 'public/data/charity-financials/mx/manifest.json',
    'sk': 'public/data/charity-registry/slovakia/manifest.json',
    'skAnomalies': 'public/data/funding-flows/slovakia-pit-2-percent/anomalies.json',
    'pl': 'public/data/charity-registry/poland/manifest.json',
    'plFlows': 'public/data/funding-flows/poland-pit-1-5-percent/manifest.json',
    'at': 'public/data/charity-registry/austria/manifest.json',
    'fi': 'public/data/charity-registry/finland/manifest.json',
    'lv': 'public/data/charity-registry/latvia/manifest.json',
    'dk': 'public/data/charity-registry/denmark/manifest.json',
    'hr': 'public/data/charity-registry/croatia/manifest.json',
    'wave1b': 'public/data/registry-wave1b/manifest.json',
}
PINNED_SHA = {
    'nz': '2f4f5523fb1b9ebcdd41fb24f51d5ed0f7f0f773ae9928434e879e5c08ab64d0',
    'ni': 'c0aee8093c71ba9130624f92958ffc8953ae19bd09cf43196fa9ff130cb58661',
    'niAnomalies': 'b8689f5cee3440909d12bfd70afaef1d3403fcf23aceb0e4fc9df93263d2a5e3',
    'jp': '965d73a2cb39ae709465cc231a360e0c3e5f1f962db6ebefe448a7d8738cd823',
    'se': 'd69c0528f7492e5c72685a1204d08aad9bffe94722ea3452efcfef8aafb3fab2',
    'seAnomalies': '422242a7dac5d61ba917da3c4fa10bf2c64b3039b19e582face0285b59dc46f1',
    'mx': 'afa96fe2139dc73c5e1c913e794ff3463d7f1da4abc9c763c7e791bfb541ed5c',
    'sk': '1965201117ea69417aa4d3cc0b6c553be1ac23e483fd42689b82ae762707a183',
    'skAnomalies': '20766f8cb19db495a68bef6e29f6d2d8b3d3c4fdef133d8b2013956a7bb1104b',
    'pl': '1ffbd2aa2546b11b3ea9210ce38095bc2269d29060d8e6a0e5dfbb8cd514c434',
    'plFlows': '09f9bcdf11f069b9a049771b9389e75f712b2944a8ced58cfcabf73e3e21f4ca',
    'at': '34a1d310944b9635cbf9256e06af1a32d5e0553a6144cf08d9d4a7da748b7372',
    'fi': 'df2107fa7a0b1bc8ee569b1841ecf21a2f9fc242046620912f56e4f8504a8157',
    'lv': '71e20841b0ab0e8a7f78d49619918b991cfbace4441e13bbce80910093ee5194',
    'dk': 'aa50b4ded7ccf17ee852d86d49869eee4e44442121136946a556f1751e9694bf',
    'hr': 'b4e24f39732bc270cac5ec697adf8b3c0b366d5e7183ba07b8c148cad9e6c04b',
    'wave1b': '0c3896923388a393e2b19d569e77c98f838a001274a67299c3cb9f5671f07797',
}
# Source capture tables committed beside each edition (URL, bytes, SHA-256, capture date).
SOURCE_TABLES = {
    'ni': ('src/data/northern-ireland-index-sources.tsv', '9736545f01d73c420e3b7592bd5595da566b29de28f091820e2e9b89beb1f8ed'),
    'se': ('src/data/sweden-index-sources.tsv', 'a631b11cfa72ebb498012dc2847cb654c10e6b0809cdc0bdc18a2d6de8651a1e'),
    'sk': ('src/data/slovakia-index-sources.tsv', 'beb00e1b1218edcac6586b27bfedfc98b4fd73c603dd44b640090d8fe69cb3b0'),
    'pl': ('src/data/poland-index-sources.tsv', '5a08f6fbbb8b71b39981b912261795159e0eb6c7ad4df78db8a616d46ca7f720'),
    'at': ('src/data/austria-index-sources.tsv', 'a83512cd4bec6524479d7ecbff84c58b951a473f9ebf8ac676b00eeb1b96938d'),
    'lv': ('src/data/latvia-index-sources.tsv', 'd60c26a8c41ef807a520c244edad0cabbb13169d8a77d2d7f2880c983df6f9e5'),
    'dk': ('src/data/denmark-index-sources.tsv', '3e5c70ba981e5cc30b6bb66f000f4d19059c263cdb4ccd4d529ad484284e2aef'),
    'hr': ('src/data/croatia-index-sources.tsv', '1b78db67ebfc78a63d2c1e5add784d464de8e78c298c072c3e926cd413c5f3f6'),
}

# One published-figure threshold per financial register (in the edition's own unit).
THRESHOLDS = {
    'nz': {'line': 'totalGrossIncome', 'value': '3000000', 'currency': 'NZD'},
    'ni': {'line': 'totalIncome', 'value': '1000000', 'currency': 'GBP'},
    'jp': {'line': 'ordinaryRevenue', 'value': '100000000', 'currency': 'JPY'},
    'se': {'line': 'revenue', 'value': '50000', 'currency': 'SEK', 'unit': 'thousand'},
    'mx': {'line': 'dona_efe_nal', 'value': '50000000.00', 'currency': 'MXN'},
    'sk': {'line': 'amount', 'value': '100000.00', 'currency': 'EUR'},
    'pl': {'line': 'amount', 'value': '2000000.00', 'currency': 'PLN'},
}

# ---------- Cause groups: the Wave 1b stems, unchanged, plus stems by label language ----------
# Wave 1b's English stems apply to every label. A language stem applies only to
# labels published in that language. Matching is word-start, case-insensitive.
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
    'education': {'sv': ['utbildning'], 'es': ['educa'], 'de': ['bildung', 'schul', 'privatschul', 'universit', 'kindergärt', 'privatkindergärt'],
                  'lv': ['izglītīb'], 'hr': ['obrazovan', 'prosvjet']},
    'health': {'sv': ['hälso', 'sjukvård', 'sjukdom', 'kärlsjukdom', 'cancer', 'diabetes', 'hiv'], 'es': ['salud'], 'de': ['gesundheit'],
               'lv': ['veselīb', 'slimīb'], 'hr': ['zdravlj', 'zdravstven']},
    'religion': {'sv': ['religiös', 'mission'], 'es': ['religios'], 'de': ['kirche'], 'lv': ['reliģ', 'baznīc'], 'hr': ['duhovn', 'vjersk']},
    'poverty': {'sv': ['fattig'], 'es': ['pobreza'], 'de': ['armut'], 'lv': ['trūcīg', 'nabadzīb'], 'hr': ['siromaš']},
    'environment': {'sv': ['miljö', 'natur'], 'es': ['ecológ', 'ambient'], 'de': ['naturschutz', 'umwelt'], 'lv': ['vide'], 'hr': ['okoliš', 'ekološ']},
    'animals': {'sv': ['djur'], 'es': ['especie'], 'de': ['tier'], 'lv': ['dzīvniek'], 'hr': ['životinj']},
    'arts-culture': {'sv': ['kultur'], 'es': ['museo', 'bibliotec'], 'de': ['kunst', 'kultur', 'museen', 'privatmuseen', 'denkmal'],
                     'lv': ['kultūr', 'māksl'], 'hr': ['umjetnost', 'kulturn', 'kultura i umjet']},
    'rights': {'sv': ['rättighet'], 'es': ['derechos'], 'de': ['menschenrecht'], 'lv': ['cilvēktiesīb', 'tiesīb'], 'hr': ['prava']},
    'sport-recreation': {'sv': ['idrott', 'fritid', 'friluftsliv'], 'es': ['deport'], 'hr': ['šport', 'hobist']},
    'community': {'sv': ['samhälls'], 'es': ['comunidad', 'comunitari'], 'de': ['gemeinwesen'], 'lv': ['pilsonisk', 'kopien'], 'hr': ['zajednic']},
    'housing': {'sv': ['boende'], 'es': ['vivienda'], 'de': ['wohn'], 'lv': ['mājok'], 'hr': ['stanov']},
    'science-research': {'sv': ['forskning'], 'es': ['investigaci', 'científ'], 'de': ['wissenschaft', 'forschung'], 'lv': ['zinātn', 'pētniec'],
                         'hr': ['znanstven', 'znanost', 'istraživanj']},
    'disability': {'sv': ['funktionsned'], 'es': ['discapacid'], 'de': ['behind'], 'lv': ['invalid'], 'hr': ['invalid']},
    'international': {'sv': ['internation'], 'es': ['internacional'], 'lv': ['starptautisk'], 'hr': ['međunarodn']},
    'safety': {'sv': ['katastrof'], 'de': ['feuerwehr', 'katastroph'], 'lv': ['katastrof', 'ārkārtas'], 'hr': ['spašavanj']},
    'food-agriculture': {'sv': ['jordbruk'], 'es': ['aliment'], 'de': ['landwirtschaft', 'ernährung'], 'lv': ['lauksaimniec'], 'hr': ['poljoprivred']},
    'employment': {'sv': ['arbetsmarknad', 'sysselsättning'], 'es': ['empleo'], 'de': ['beschäftigung', 'arbeitsmarkt'], 'lv': ['nodarbinātīb'], 'hr': ['zapošljav']},
}
LANGUAGES = ['sv', 'es', 'de', 'lv', 'hr']
CAUSE_REGISTERS = ['ni', 'se', 'mx', 'at', 'fi', 'lv', 'dk', 'hr']
LABEL_LANGUAGE = {'ni': 'en', 'se': 'sv', 'mx': 'es', 'at': 'de', 'fi': 'en', 'lv': 'lv', 'dk': 'da', 'hr': 'hr'}


def digest(body):
    return sha256(body).hexdigest()


def verified_bytes(rel, expected_sha=None, expected_bytes=None):
    path = ROOT / rel
    if not path.is_file() or path.is_symlink():
        raise SystemExit(f'Missing regular input file: {rel}')
    body = path.read_bytes()
    if expected_bytes is not None and len(body) != expected_bytes:
        raise SystemExit(f'Input size changed: {rel}')
    if expected_sha is not None and digest(body) != expected_sha:
        raise SystemExit(f'Input bytes changed: {rel}')
    return body


def pinned(key):
    return json.loads(verified_bytes(PINNED[key], PINNED_SHA[key]))


def gz_asset(directory, asset):
    body = verified_bytes(f'{directory}/{asset["path"]}', asset['sha256'], asset['bytes'])
    raw = gzip.decompress(body)
    assert digest(raw) == asset['decodedSha256'] and len(raw) == asset['decodedBytes'], asset['path']
    rows = json.loads(raw)
    if 'rows' in asset:
        assert len(rows) == asset['rows'], asset['path']
    return rows


def shard_rows(directory, shards):
    rows = []
    for key in sorted(shards):
        rows.extend(gz_asset(directory, shards[key]))
    return rows


def source_table(key):
    rel, sha = SOURCE_TABLES[key]
    text = verified_bytes(rel, sha).decode('utf-8')
    return list(csv.DictReader(io.StringIO(text), delimiter='\t'))


def cents_text(cents):
    sign = '-' if cents < 0 else ''
    cents = abs(cents)
    return f'{sign}{cents // 100}.{cents % 100:02d}'


def at_least(value, threshold):
    return value is not None and Decimal(value) >= Decimal(threshold)


def word_match(label, stem):
    return re.search(r'(?<![a-z])' + re.escape(stem), label.lower()) is not None


# ---------- New Zealand: Charities Services Tier 3 annual returns ----------
def build_nz():
    manifest = pinned('nz')
    assert manifest['format'] == 'charitology-nz-tier3-v1' and manifest['tier'] == 3
    assert manifest['returnFields'] == ['annualReturnId', 'periodEnd', 'sourceStatusCode', 'reportedCurrency', 'currency', 'currencyBasis', 'totalGrossIncome', 'totalExpenditure']
    rows = gz_asset('public/data/charity-registry/new-zealand', manifest['asset'])
    dossiers, excluded, candidates = [], {'notRegistered': []}, 0
    for record, (org_id, number, name, status, registered, deregistered, group, returns) in enumerate(rows, 1):
        if not returns:
            continue
        latest = max(returns, key=lambda r: r[1])
        if not at_least(str(latest[6]), THRESHOLDS['nz']['value']):
            continue
        candidates += 1
        if status != 'Registered':
            excluded['notRegistered'].append(number)
            continue
        assert all(type(r[6]) is int and type(r[7]) is int for r in returns)
        dossiers.append({
            'id': number, 'name': name, 'record': record,
            'facts': {'organisationId': org_id, 'status': status, 'registered': registered, 'deregistered': deregistered, 'groupId': group},
            'labels': [],
            'periods': [{'end': r[1], 'record': r[0], 'sourceStatusCode': r[2], 'reportedCurrency': r[3], 'currency': r[4], 'currencyBasis': r[5],
                         'values': {'totalGrossIncome': str(r[6]), 'totalExpenditure': str(r[7])}} for r in sorted(returns, key=lambda r: r[1], reverse=True)],
        })
    counts = {'editionOrganizations': len(rows), 'withReturns': sum(1 for r in rows if r[7]), 'statuses': dict(sorted(Counter(r[3] for r in rows).items()))}
    titles = {'organisations': 'Charities Register organisation extract (OData Organisations)', 'tier3-2024': 'Tier 3 annual return extract, years ending in 2024 (OData AnnualReturn)',
              'tier3-2025': 'Tier 3 annual return extract, years ending in 2025 (OData AnnualReturn)', 'tiers': 'Reporting tier code list (OData ReportingTier)',
              'currencies': 'Reporting currency code list (OData ReportingCurrency)'}
    sources = {k: {'title': titles[k], 'url': s['url'], 'bytes': s['bytes'], 'sha256': s['sha256'], 'rows': s['rows'], 'retrievedAt': manifest['capturedAt']}
               for k, s in manifest['sources'].items()}
    return dossiers, excluded, candidates, counts, sources, manifest


# ---------- Northern Ireland: CCNI register export ----------
def build_ni():
    manifest = pinned('ni')
    assert manifest['format'] == 'charitology-northern-ireland-registry-v1' and manifest['currency'] == 'GBP'
    rows = gz_asset('public/data/charity-registry/northern-ireland', manifest['artifacts']['organizations'])
    anomalies = pinned('niAnomalies')
    assert anomalies['sourceSha256'] == manifest['sourceCapture']['sha256']
    flagged = {a['nic']: a['note'] for a in anomalies['largeUnverifiedOutliers']}
    purposes = {p['code']: p['label'] for p in manifest['purposes']}
    dossiers, excluded, candidates = [], {'removed': []}, 0
    for record, r in enumerate(rows, 1):
        if r['fye'] is None or not at_least(None if r['income'] is None else str(r['income']), THRESHOLDS['ni']['value']):
            continue
        candidates += 1
        if not r['active']:
            excluded['removed'].append(r['regId'])
            continue
        # The committed edition stores a blank CCNI cell as 0, so a zero total could not be told apart from a blank one.
        assert type(r['income']) is int and type(r['spending']) is int and r['spending'] > 0, r['regId']
        assert all(p in purposes for p in r['purposes'])
        dossiers.append({
            'id': r['regId'], 'name': r['name'], 'record': record,
            'facts': {'nic': r['nic'], 'otherName': r['otherName'], 'registered': r['registered'], 'status': r['statusRaw'], 'governingDocument': r['govDoc'],
                      'editionFlag': flagged.get(r['nic'])},
            'labels': [p for p in purposes if p in r['purposes']],
            'periods': [{'end': r['fye'], 'values': {'totalIncome': str(r['income']), 'totalSpending': str(r['spending'])}}],
        })
    active = [r for r in rows if r['active']]
    counts = {'editionOrganizations': len(rows), 'active': len(active), 'removed': len(rows) - len(active),
              'labels': {p: sum(1 for r in active if p in r['purposes']) for p in purposes}}
    sources = {s['filename']: {'title': f"CCNI Register of Charities CSV export ({s['filename']})", 'url': s['url'], 'bytes': int(s['bytes']), 'sha256': s['sha256'],
                               'retrievedAt': s['captured_on']} for s in source_table('ni')}
    assert sources['ccni-register.csv']['sha256'] == manifest['sourceCapture']['sha256']
    return dossiers, excluded, candidates, counts, sources, manifest, purposes


# ---------- Japan: Cabinet Office NPO Portal ----------
def build_jp():
    manifest = pinned('jp')
    assert manifest['format'] == 'charitology-japan-npo-v1' and manifest['currency'] == 'JPY'
    assert manifest['financeFields'] == ['organizationSourceRecord', 'fiscalYearLabel', 'ordinaryRevenueJPY', 'ordinaryExpensesJPY', 'donationsReceivedJPY', 'grantsAndSimilarIncomeReceivedJPY']
    rows = gz_asset('public/data/charity-registry/japan-npo', manifest['asset'])
    dossiers, excluded, candidates = [], {'dissolutionRecorded': []}, 0
    keys = ['ordinaryRevenue', 'ordinaryExpenses', 'donationsReceived', 'grantsReceived']
    for record, (portal, name, kana, authority, corporate, certified, dissolution, admin_record, finance) in enumerate(rows, 1):
        if not finance or not at_least(finance[2], THRESHOLDS['jp']['value']):
            continue
        candidates += 1
        if dissolution:
            excluded['dissolutionRecorded'].append(portal)
            continue
        assert all(v is None or re.fullmatch(r'-?[0-9]{1,16}', v) for v in finance[2:])
        dossiers.append({
            'id': portal, 'name': name, 'record': record,
            'facts': {'kana': kana, 'authority': authority, 'corporateNumber': corporate, 'certified': certified, 'administrativeRecord': admin_record},
            'labels': [],
            'periods': [{'label': finance[1], 'record': finance[0], 'values': dict(zip(keys, finance[2:]))}],
        })
    counts = {'editionOrganizations': len(rows), 'financialSummaries': sum(1 for r in rows if r[8]),
              'authorities': len(manifest['authorities']), 'withDissolutionInformation': sum(1 for r in rows if r[6])}
    titles = {'administrative': 'NPO Portal administrative data', 'organization': 'NPO Portal organization-entered data'}
    sources = {k: {'title': f"{titles[k]} ({s['file']}, member {s['member']})", 'url': s['url'], 'file': s['file'], 'member': s['member'], 'sha256': s['sha256'],
                   'retrievedAt': manifest['capturedOn']} for k, s in manifest['sources'].items()}
    return dossiers, excluded, candidates, counts, sources, manifest


# ---------- Sweden: Svensk Insamlingskontroll 90-konto directory ----------
def build_se():
    manifest = pinned('se')
    anomalies = pinned('seAnomalies')
    assert manifest['format'] == 'charitology-sweden-registry-v1'
    rows = gz_asset('public/data/charity-registry/sweden', manifest['artifacts']['organizations'])
    flagged = {o['slug'] for o in anomalies['duplicateYearColumns']['organizations']}
    assert len(flagged) == manifest['counts']['duplicateYearHeaderCards']
    dossiers, excluded, candidates = [], {'duplicateYearHeaderCard': []}, 0
    year = manifest['financialReportingYear']
    for record, r in enumerate(rows, 1):
        f = r['financials']
        if r['status'] != 'active' or not f or f['latestYear'] != year or not at_least(None if f['latestRevenueTkr'] is None else str(f['latestRevenueTkr']), THRESHOLDS['se']['value']):
            continue
        candidates += 1
        assert r['orgNr'] and re.fullmatch(r'[0-9]{6}-[0-9]{4}', r['orgNr'])
        if r['slug'] in flagged:
            excluded['duplicateYearHeaderCard'].append(r['orgNr'])
            continue
        assert len({y['year'] for y in f['years']}) == len(f['years'])
        dossiers.append({
            'id': r['orgNr'], 'name': r['name'], 'record': record,
            'facts': {'legalForm': r['legalForm'], 'since': r['since'], 'profileUrl': r['profileUrl'], 'areas': r['areas'], 'regions': r['regions'],
                      'swedenCounties': r['swedenCounties']},
            'labels': list(r['purposes']),
            'periods': [{'label': str(y['year']), 'values': {'revenue': None if y['revenueTkr'] is None else str(y['revenueTkr']),
                                                            'equity': None if y['equityTkr'] is None else str(y['equityTkr'])}}
                        for y in sorted(f['years'], key=lambda y: y['year'], reverse=True)],
        })
    active = [r for r in rows if r['status'] == 'active']
    purposes = sorted({p for r in rows for p in r['purposes']})
    counts = {'editionOrganizations': len(rows), 'active': len(active), 'byStatus': manifest['counts']['byStatus'],
              'labels': {p: sum(1 for r in active if p in r['purposes']) for p in purposes}}
    sources = {s['source_id']: {'title': s['dataset_title'], 'url': s['source_url'], 'bytes': int(s['bytes']), 'sha256': s['sha256'], 'retrievedAt': s['captured_on'],
                                'file': s['local_filename']} for s in source_table('se')}
    return dossiers, excluded, candidates, counts, sources, manifest, purposes


# ---------- Mexico: SAT donatarias autorizadas transparency report ----------
def build_mx():
    manifest = pinned('mx')
    assert manifest['currency'] == 'MXN' and manifest['periodFields'] == ['fiscalYear', 'sourceRecord', 'reportedName', 'reportedState', 'authorizedCategory', 'financialCents']
    fields = [f['field'] for f in manifest['financialFields']]
    assert fields[0] == 'dona_efe_nal' and len(fields) == 16
    rows = gz_asset('public/data/charity-financials/mx', manifest['asset'])
    threshold_cents = int(Decimal(THRESHOLDS['mx']['value']) * 100)
    dossiers, candidates = [], 0
    categories = Counter()
    for record, (rfc, periods, directories) in enumerate(rows, 1):
        if not periods:
            continue
        latest = max(periods, key=lambda p: p[0])
        categories[latest[4]] += 1
        if latest[5][0] is None or latest[5][0] < threshold_cents:
            continue
        candidates += 1
        assert all(v is None or type(v) is int for p in periods for v in p[5])
        latest_dir = max(directories, key=lambda d: d[0]) if directories else None
        dossiers.append({
            'id': rfc, 'name': latest[2], 'record': record,
            'facts': {'state': latest[3], 'category': latest[4],
                      'directoryYear': latest_dir[0] if latest_dir else None, 'directoryName': latest_dir[1] if latest_dir else None,
                      'directoryStatus': latest_dir[3] if latest_dir else None,
                      'directoryActivities': sorted({code for _, code in latest_dir[4]}) if latest_dir else []},
            'labels': [latest[4]],
            'periods': [{'label': str(p[0]), 'record': p[1], 'name': p[2], 'category': p[4],
                         'values': {f: None if v is None else cents_text(v) for f, v in zip(fields, p[5])}}
                        for p in sorted(periods, key=lambda p: p[0], reverse=True)],
        })
    counts = {'editionOrganizations': len(rows), 'withFinancialPeriods': sum(1 for r in rows if r[1]), 'labels': dict(sorted(categories.items()))}
    sources = {f'report{y}': {'title': f"Donatarias autorizadas transparency report, fiscal year {y} ({s['file']})", 'url': s['url'], 'file': s['file'], 'bytes': s['bytes'],
                              'sha256': s['sha256'], 'rows': s['sourceRows'], 'retrievedAt': manifest['capturedOn']} for y, s in manifest['financial'].items()}
    sources.update({f'directory{y}': {'title': f"Directory of authorized donees {y} ({s['file']})", 'url': s['url'], 'file': s['file'], 'bytes': s['bytes'], 'sha256': s['sha256'],
                                      'retrievedAt': manifest['capturedOn']} for y, s in manifest['directories'].items()})
    return dossiers, {}, candidates, counts, sources, manifest, sorted(categories)


# ---------- Slovakia: Financial Directorate 2% income-tax assignment lists ----------
def build_sk():
    manifest = pinned('sk')
    anomalies = pinned('skAnomalies')
    assert manifest['format'] == 'charitology-slovakia-registry-v1' and manifest['currency'] == 'EUR'
    years = manifest['counts']['yearsCovered']
    rows = shard_rows('public/data/charity-registry/slovakia', manifest['shards']['names'])
    assert len(rows) == manifest['counts']['includedOrganizations']
    combined = defaultdict(set)
    for rec in anomalies['duplicateIcoRowsInSameYear']['records']:
        combined[rec['ico']].add(str(rec['year']))
    assert sum(len(v) for v in combined.values()) == anomalies['duplicateIcoRowsInSameYear']['count']
    threshold = int(Decimal(THRESHOLDS['sk']['value']) * 100)
    dossiers, candidates = [], 0
    for r in sorted(rows, key=lambda r: r['ico']):
        if r['y2025Cents'] is None or r['y2025Cents'] < threshold:
            continue
        candidates += 1
        assert r['yearly'].get('2025') == r['y2025Cents']
        dossiers.append({
            'id': r['ico'], 'name': r['name'], 'record': None,
            'facts': {'municipality': r['muni']},
            'labels': [],
            'periods': [{'label': str(y), 'combined': str(y) in combined.get(r['ico'], set()),
                         'values': {'amount': None if str(y) in combined.get(r['ico'], set()) or str(y) not in r['yearly'] else cents_text(r['yearly'][str(y)])}}
                        for y in sorted(years, reverse=True)],
        })
    counts = {'editionOrganizations': len(rows), 'years': years, 'active2025': manifest['counts']['active2025Organizations'],
              'recipients': {str(y): manifest['yearly'][str(y)]['distinctOrganizations'] for y in years}}
    sources = {s['file']: {'title': s['description'], 'url': s['url'], 'bytes': int(s['bytes']), 'sha256': s['sha256'], 'retrievedAt': s['retrieved_utc'], 'year': s['year']}
               for s in source_table('sk')}
    return dossiers, {}, candidates, counts, sources, manifest


# ---------- Poland: 1.5% personal income tax transfers to public benefit organizations ----------
def build_pl():
    manifest = pinned('pl')
    flows = pinned('plFlows')
    assert manifest['format'] == 'charitology.poland-opp-registry.v1' and flows['format'] == 'charitology.poland-pit-1-5-percent.v1'
    registry = {r[0]: r for r in gz_asset('public/data/charity-registry/poland', manifest['asset'])}
    recipients = gz_asset('public/data/funding-flows/poland-pit-1-5-percent', flows['asset'])
    tax_years = [y['taxYear'] for y in flows['byYear']]
    assert tax_years == [2022, 2023, 2024, 2025]
    threshold = int(Decimal(THRESHOLDS['pl']['value']) * 100)
    dossiers, candidates = [], 0
    for record, r in enumerate(recipients, 1):
        krs, name, voiv, mask, _total, *rest = r
        amounts, taxpayers = rest[:4], rest[4:]
        if amounts[3] < threshold:
            continue
        candidates += 1
        reg = registry[krs]
        assert reg[2] == name and reg[3] == voiv and reg[5] == mask
        dossiers.append({
            'id': krs, 'name': name, 'record': record,
            'facts': {'nip': reg[1], 'voivodeship': voiv, 'city': reg[4], 'eligibleLists': [y for bit, y in ((1, 2023), (2, 2024), (4, 2025)) if mask & bit]},
            'labels': [],
            'periods': [{'label': str(y), 'payoutYear': str(y + 1),
                         'values': {'amount': cents_text(a) if a > 0 else None,
                                    'taxpayers': None if t is None else f'{t // 10}.{t % 10}'}}
                        for y, a, t in sorted(zip(tax_years, amounts, taxpayers), reverse=True)],
        })
    counts = {'editionOrganizations': len(registry), 'fundedRecipients': len(recipients),
              'funded': {str(y['taxYear']): y['fundedOrgCount'] for y in flows['byYear']}, 'eligible2025': manifest['counts']['eligible2025']}
    sources = {s['key']: {'title': f"{s['publisher']}: {s['filename']}", 'url': s['download_url'], 'dataset': s['dataset_url'], 'file': s['filename'], 'bytes': int(s['bytes']),
                          'sha256': s['sha256'], 'retrievedAt': manifest['capturedOn']} for s in source_table('pl')}
    return dossiers, {}, candidates, counts, sources, manifest, flows


# ---------- Registry-only registers: hubs from the register's own labels ----------
def hub_table(population, key_of, member, label_of, order_key=None, cap=None):
    by = defaultdict(list)
    for item in population:
        for k in key_of(item):
            by[k].append(item)
    hubs = {}
    for k in sorted(by, key=lambda k: label_of(k)):
        items = by[k]
        if len(items) < HUB_MIN:
            continue
        listed = items
        capped = False
        if cap is not None and len(items) > cap:
            assert order_key, f'{k}: no published ordering for a capped hub'
            listed = sorted(items, key=order_key)[:cap]
            capped = True
        hubs[k] = {'label': label_of(k), 'count': len(items), 'capped': capped,
                   'members': [member(i) for i in sorted(listed, key=lambda i: (member(i)[1].casefold(), member(i)[0]))]}
    return hubs, {k: len(v) for k, v in sorted(by.items())}


def build_at():
    manifest = pinned('at')
    assert manifest['format'] == 'charitology-austria-registry-v1'
    rows = gz_asset('public/data/charity-registry/austria', manifest['artifacts']['organizations'])
    cats = {c['prefix']: c for c in manifest['categories']}
    population = [r for r in rows if r['active']]
    assert all(r['prefix'] in cats and r['code'].startswith(r['prefix'] + '-') for r in rows)
    hubs, label_counts = hub_table(population, lambda r: [r['prefix']], lambda r: [r['code'], r['name'], r['validFrom']], lambda k: cats[k]['labelDe'])
    labels = {k: cats[k]['labelDe'] for k in cats}
    counts = {'editionOrganizations': len(rows), 'population': len(population), 'labels': label_counts}
    sources = {s['filename']: {'title': f"BMF Liste begünstigter Einrichtungen ({s['filename']})", 'url': s['url'], 'bytes': int(s['bytes']), 'sha256': s['sha256'],
                               'retrievedAt': s['captured_on']} for s in source_table('at')}
    return hubs, counts, sources, manifest, labels


def build_fi():
    manifest = pinned('fi')
    assert manifest['format'] == 'charitology-finland-registry-v1'
    rows = gz_asset('public/data/charity-registry/finland', manifest['artifacts']['organizations'])
    assert len(rows) == manifest['counts']['includedOrganizations']
    population = [r for r in rows if r['active'] and r['tol'] and r['sector']]
    # PRH records carry the industry code with the English description printed on each record. A few codes appear
    # with two descriptions (classification versions), so the label key is the code and the description together.
    sector = {f"{r['tol']}|{r['sector']}": r['sector'] for r in population}
    hubs, label_counts = hub_table(population, lambda r: [f"{r['tol']}|{r['sector']}"], lambda r: [r['id'], r['name'], r['formEn'], r['regDate'], r['city']],
                                   lambda k: sector[k])
    counts = {'editionOrganizations': len(rows), 'active': sum(1 for r in rows if r['active']), 'population': len(population), 'labels': label_counts}
    sources = {s['id']: {'url': s['url'], 'bytes': s['bytes'], 'sha256': s['sha256'], 'retrievedAt': manifest['capturedOn'], 'title': s['title']} for s in manifest['sources']}
    return hubs, counts, sources, manifest, dict(sorted(sector.items()))


def build_lv():
    manifest = pinned('lv')
    assert manifest['format'] == 'charitology.latvia-nonprofit-registry.v1'
    assert manifest['fields'] == ['regcode', 'name', 'form', 'status', 'registered', 'terminated', 'sloStatus', 'sloSince', 'sloUntil', 'sloFields', 'primaryUrArea', 'euLeadProjects', 'euLeadTotalCents', 'euPartnerRoles']
    rows = shard_rows('public/data/charity-registry/latvia', manifest['names'])
    assert len(rows) == manifest['counts']['includedOrganizations']
    population = [r for r in rows if r[6] == 'A' and r[3] == 'A' and r[9]]
    fields = sorted({f for r in population for f in r[9].split('|')})
    hubs, label_counts = hub_table(population, lambda r: r[9].split('|'), lambda r: [r[0], r[1], r[2], r[7]], lambda k: k)
    counts = {'editionOrganizations': len(rows), 'activeSlo': sum(1 for r in rows if r[6] == 'A'), 'population': len(population), 'labels': label_counts}
    sources = {s['key']: {'title': f"{s['publisher']}: {s['filename']}", 'url': s['download_url'], 'dataset': s['dataset_url'], 'file': s['filename'], 'bytes': int(s['bytes']),
                          'sha256': s['sha256'], 'retrievedAt': manifest['capturedOn']} for s in source_table('lv') if s['key'] in ('urRegister', 'urAreas', 'vidSlo')}
    return hubs, counts, sources, manifest, {f: f for f in fields}


DK_LABELS = {'s8a': 'LL § 8 A', 's12': 'LL § 12, stk. 3', 'bal': 'BAL § 3, stk. 2'}


def build_dk():
    manifest = pinned('dk')
    assert manifest['format'] == 'charitology-denmark-registry-v1'
    rows = gz_asset('public/data/charity-registry/denmark', manifest['artifacts']['organizations'])
    population = [r for r in rows if not r['ceased2025']]
    hubs, label_counts = hub_table(population, lambda r: [k for k in DK_LABELS if r[k]], lambda r: [r['cvr'], r['name'], None], lambda k: DK_LABELS[k])
    # Members carry the partial-year marker of their own statute (BAL has none in the source list).
    for k, hub in hubs.items():
        partial = {r['cvr']: bool(r.get(f'{k}Partial', False)) for r in population}
        hub['members'] = [[cvr, name, partial[cvr]] for cvr, name, _ in hub['members']]
    counts = {'editionOrganizations': len(rows), 'population': len(population), 'ceased2025': len(rows) - len(population), 'labels': label_counts}
    sources = {s['source_id']: {'url': s['source_url'], 'bytes': int(s['bytes']), 'sha256': s['sha256'], 'retrievedAt': s['captured_on'], 'title': s['dataset_title']}
               for s in source_table('dk')}
    return hubs, counts, sources, manifest, dict(DK_LABELS)


def build_hr():
    manifest = pinned('hr')
    assert manifest['format'] == 'charitology-croatia-registry-v1'
    rows = shard_rows('public/data/charity-registry/croatia', manifest['shards']['names'])
    assert len(rows) == manifest['counts']['includedOrganizations']
    population = [r for r in rows if r['status'] == 'active' and r['domains']]
    assert all(r['regDate'] and re.fullmatch(r'\d{4}-\d{2}-\d{2}', r['regDate']) for r in population)
    domains = sorted({d for r in population for d in r['domains']})
    # A capped hub lists the most recently registered entries (registration date, newest first; then registration number).
    newest_first = lambda r: (-int(r['regDate'].replace('-', '')), r['id'])
    hubs, label_counts = hub_table(population, lambda r: r['domains'], lambda r: [r['id'], r['name'], r['oib'], r['county'], r['regDate'], r['form']],
                                   lambda k: k, newest_first, HUB_LIST_CAP)
    counts = {'editionOrganizations': len(rows), 'active': sum(1 for r in rows if r['status'] == 'active'), 'population': len(population), 'labels': label_counts}
    sources = {s['filename']: {'title': f"data.gov.hr capture {s['filename']}", 'url': s['url'], 'bytes': int(s['bytes']), 'sha256': s['sha256'], 'retrievedAt': s['captured_on']}
               for s in source_table('hr')}
    return hubs, counts, sources, manifest, {d: d for d in domains}


# ---------- Cause groups ----------
def cause_groups(labels):
    groups, grouped = [], {r: set() for r in CAUSE_REGISTERS}
    for gid, name, stems in WAVE1B_STEMS:
        language = LANGUAGE_STEMS.get(gid, {})
        matches = {}
        for registry in CAUSE_REGISTERS:
            lang = LABEL_LANGUAGE[registry]
            use = stems + language.get(lang, [])
            hits = [key for key, label in labels[registry] if any(word_match(label, s) for s in use)]
            matches[registry] = hits
            grouped[registry].update(hits)
        groups.append({'id': gid, 'name': name, 'stems': stems, 'languageStems': {l: language.get(l, []) for l in LANGUAGES}, 'matches': matches})
    return {
        'format': 'charitology-cause-by-country-wave1c-v1',
        'edition': EDITION,
        'rule': ('A cause group lists every published category label, in each register, that contains a word starting with one of the '
                 'group’s stems (case-insensitive). The Wave 1b English stems apply to every label; a language stem applies only to labels '
                 'published in that language. Matching uses label text only. The registers define their categories differently, so a group '
                 'is a reading aid, not an equivalence or an official crosswalk. A label can fall in more than one group or in none.'),
        'registers': CAUSE_REGISTERS,
        'labelLanguage': LABEL_LANGUAGE,
        'labels': labels,
        'groups': groups,
        'ungrouped': {r: [key for key, _ in labels[r] if key not in grouped[r]] for r in CAUSE_REGISTERS},
    }


def write_json(name, value):
    raw = (json.dumps(value, ensure_ascii=False, indent=None, separators=(',', ':')) + '\n').encode()
    (OUT / name).write_bytes(raw)
    return {'path': name, 'bytes': len(raw), 'sha256': digest(raw)}


def main():
    OUT.mkdir(exist_ok=True)
    wave1b = pinned('wave1b')
    assert wave1b['format'] == 'charitology-registry-wave1b-v1'
    outputs, selection, sources, labels, label_counts, hub_counts = {}, {}, {}, {}, {}, {}

    nz, nz_ex, nz_c, nz_counts, sources['nz'], nz_m = build_nz()
    ni, ni_ex, ni_c, ni_counts, sources['ni'], ni_m, ni_purposes = build_ni()
    jp, jp_ex, jp_c, jp_counts, sources['jp'], jp_m = build_jp()
    se, se_ex, se_c, se_counts, sources['se'], se_m, se_purposes = build_se()
    mx, mx_ex, mx_c, mx_counts, sources['mx'], mx_m, mx_categories = build_mx()
    sk, sk_ex, sk_c, sk_counts, sources['sk'], sk_m = build_sk()
    pl, pl_ex, pl_c, pl_counts, sources['pl'], pl_m, pl_flows = build_pl()
    dossier_sets = {'nz': (nz, nz_ex, nz_c, nz_counts), 'ni': (ni, ni_ex, ni_c, ni_counts), 'jp': (jp, jp_ex, jp_c, jp_counts),
                    'se': (se, se_ex, se_c, se_counts), 'mx': (mx, mx_ex, mx_c, mx_counts), 'sk': (sk, sk_ex, sk_c, sk_counts),
                    'pl': (pl, pl_ex, pl_c, pl_counts)}
    for key, (items, excluded, candidates, counts) in dossier_sets.items():
        ids = [d['id'] for d in items]
        assert len(set(ids)) == len(ids), key
        excluded_ids = [i for v in excluded.values() for i in v]
        assert len(items) + len(excluded_ids) == candidates, key
        items.sort(key=lambda d: d['id'])
        outputs[key] = write_json(f'{key}-dossiers.json', items)
        outputs[f'{key}Counts'] = write_json(f'{key}-counts.json', counts)
        selection[key] = {'threshold': THRESHOLDS[key], 'candidates': candidates, 'dossiers': len(items), 'excluded': {k: sorted(v) for k, v in excluded.items()}}

    registry_only = {'at': build_at(), 'fi': build_fi(), 'lv': build_lv(), 'dk': build_dk(), 'hr': build_hr()}
    for key, (hubs, counts, srcs, _m, lab) in registry_only.items():
        sources[key] = srcs
        outputs[key] = write_json(f'{key}-hubs.json', {'counts': counts, 'hubs': hubs})
        labels[key] = [[k, v] for k, v in lab.items()]
        hub_counts[key] = len(hubs)
        selection[key] = {'hubMinimum': HUB_MIN, 'listCap': HUB_LIST_CAP if key == 'hr' else None, 'hubs': len(hubs),
                          'cappedHubs': sorted(k for k, h in hubs.items() if h['capped'])}

    labels['ni'] = [[k, v] for k, v in ni_purposes.items()]
    labels['se'] = [[p, p] for p in se_purposes]
    labels['mx'] = [[c, c] for c in mx_categories]
    causes = cause_groups({r: labels[r] for r in CAUSE_REGISTERS})
    outputs['causes'] = write_json('cause-groups.json', causes)

    manifest = {
        'format': 'charitology-registry-wave1c-v1',
        'edition': EDITION,
        'builder': 'scripts/build-registry-wave1c.py',
        'checker': 'scripts/check-registry-wave1c.mjs',
        'policy': ('Figures are copied exactly as the committed, hash-pinned editions store them. Inclusion follows one published-figure threshold '
                   'per register and is a coverage boundary, not a rating, ranking or endorsement. Null means not supplied; it is never zero. '
                   'Registers without per-organization figures get hubs from their own category labels only. Cause groups match published '
                   'category labels only and are not a crosswalk.'),
        'selection': {**selection, 'hubMinimumDossiers': HUB_MIN, 'registryHubListCap': HUB_LIST_CAP},
        'pinnedEditions': {key: {'path': rel, 'sha256': PINNED_SHA[key]} for key, rel in PINNED.items()},
        'sourceTables': {key: {'path': rel, 'sha256': sha} for key, (rel, sha) in SOURCE_TABLES.items()},
        'sources': sources,
        'outputs': outputs,
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    for key, s in selection.items():
        print(key, {k: v for k, v in s.items() if k != 'excluded'}, {k: len(v) for k, v in s.get('excluded', {}).items()})
    for g in causes['groups']:
        print(g['id'], {r: len(v) for r, v in g['matches'].items()})


if __name__ == '__main__':
    main()
