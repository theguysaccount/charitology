"""Project documented planned locations for the pinned Brazil transfer edition."""
from collections import Counter, defaultdict
from csv import DictReader, field_size_limit
from datetime import datetime
from gzip import GzipFile, decompress
from hashlib import sha256
from io import BytesIO, TextIOWrapper
from pathlib import Path
from unicodedata import combining, normalize
from xml.etree import ElementTree
from zipfile import ZipFile
import argparse
import json
import re

ROOT = Path(__file__).resolve().parent.parent
TRANSFER = ROOT / 'public/data/funding-flows/brazil-transferegov'
DATASET = 'https://api-publica.transferegov.gestao.gov.br/downloads'
DTB_URL = 'https://www.ibge.gov.br/geociencias/organizacao-do-territorio/divisao-regional/23701-divisao-territorial-brasileira.html?edicao=43194&t=acesso-ao-produto'
STATES = dict(pair.split(':') for pair in (
    '11:RO 12:AC 13:AM 14:RR 15:PA 16:AP 17:TO 21:MA 22:PI 23:CE 24:RN 25:PB 26:PE '
    '27:AL 28:SE 29:BA 31:MG 32:ES 33:RJ 35:SP 41:PR 42:SC 43:RS 50:MS 51:MT 52:GO 53:DF'
).split())
GOALS = {
    'file': 'siconv_meta_crono_fisico.zip', 'member': 'siconv_meta_crono_fisico.csv',
    'url': DATASET + '/dadosgov/siconv_meta_crono_fisico.zip',
    'bytes': 112305037, 'sha256': '2072a4aaec570f721e3306a828fc07a3d1c77b082d911457bf858e5d8350dbfe',
    'capturedOn': '2026-11-11', 'publisher': 'Transferegov.br',
    'licence': 'https://opendatacommons.org/licenses/odbl/1-0/',
}
DTB = {
    'file': 'DTB_2025.zip', 'member': 'RELATORIO_DTB_BRASIL_2025_MUNICIPIOS.ods',
    'url': 'https://geoftp.ibge.gov.br/organizacao_do_territorio/estrutura_territorial/divisao_territorial/2025/DTB_2025.zip',
    'bytes': 1635600, 'sha256': 'd077a0e48c36cf18bcc96268b4a436200c014c6b8522c1a62d894acaf39dad27',
    'edition': 2025, 'capturedOn': '2026-11-11', 'publisher': 'IBGE', 'catalog': DTB_URL,
}
GOAL_FIELDS = ('proposalId', 'agreementId', 'workPlanGoalId', 'sourceDataRecord',
               'reportedGoalState', 'ibgeMunicipalityCode', 'matchStatus', 'plannedStart', 'plannedEnd')
PLACE_FIELDS = ('municipalityCode', 'municipalityName', 'stateNameFromIBGE', 'odsPhysicalRow')
STATUSES = ('municipality-linked', 'missing-state-or-municipality', 'unresolved-municipality')
FIELD_NAMES = {'ID_META', 'ID_PROPOSTA', 'NR_CONVENIO', 'UF_META', 'MUNICIPIO_META',
               'DATA_INICIO_META', 'DATA_FIM_META'}


def fingerprint(path):
    digest = sha256()
    with path.open('rb') as source:
        while chunk := source.read(2_000_000):
            digest.update(chunk)
    return digest.hexdigest()


def checked(path, meta):
    if path.stat().st_size != meta['bytes'] or fingerprint(path) != meta['sha256']:
        raise ValueError(f'Unexpected source fingerprint: {path.name}')
    return path


def encode(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode()


def fold_name(value):
    return ' '.join(''.join(char for char in normalize('NFKD', value.casefold())
                           if not combining(char)).split())


def read_places(path):
    with ZipFile(path) as outer, ZipFile(BytesIO(outer.read(DTB['member']))) as book:
        tree = ElementTree.fromstring(book.read('content.xml'))
    by_code = {}
    by_name = defaultdict(set)
    for coordinate, row in enumerate(tree.findall('.//{*}table-row'), 1):
        fields = [''.join(cell.itertext()) for cell in list(row)[:9]]
        if len(fields) != 9 or fields[0] not in STATES or not re.fullmatch(r'[0-9]{7}', fields[7]):
            continue
        prefix, state_name, code, name = fields[0], fields[1], fields[7], fields[8]
        if code in by_code or not code.startswith(prefix) or not state_name or not name:
            raise ValueError(f'Invalid IBGE municipality coordinate {coordinate}')
        by_code[code] = (code, name, state_name, coordinate)
        by_name[(STATES[prefix], fold_name(name))].add(code)
    return by_code, by_name


def read_transfer(path):
    manifest = json.loads((path / 'manifest.json').read_bytes())
    asset = manifest['asset']
    compressed = checked(path / asset['path'], asset).read_bytes()
    raw = decompress(compressed)
    if (len(raw) != asset['decodedBytes'] or sha256(raw).hexdigest() != asset['decodedSha256']
            or asset['sha256'] != 'e104204207990851b245721a8a6e22746e59ad7f4935da7ac41abf5e0dd01798'):
        raise ValueError('This geography edition requires the exact published transfer snapshot.')
    rows = json.loads(raw)
    return manifest, {row[0]: row for row in rows}


def normalize_date(value):
    for pattern in ('%d/%m/%Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(value.strip(), pattern).date().isoformat()
        except ValueError:
            continue
    return None


def read_goals(path, agreements, places, by_name):
    proposals = {row[1] for row in agreements.values()}
    records = []
    ids = set()
    counts = Counter(dict.fromkeys(STATUSES, 0))
    source_records = other_agreement = 0
    field_size_limit(1_000_000)
    with ZipFile(path) as archive, archive.open(GOALS['member']) as raw:
        if archive.namelist() != [GOALS['member']]:
            raise ValueError('Unexpected work-plan archive member list.')
        reader = DictReader(TextIOWrapper(raw, encoding='utf-8-sig', errors='surrogateescape', newline=''),
                            delimiter=';')
        if len(reader.fieldnames) != len(set(reader.fieldnames)) or FIELD_NAMES.difference(reader.fieldnames):
            raise ValueError('Unexpected work-plan source fields.')
        for source_records, row in enumerate(reader, 1):
            proposal, agreement, goal_id = row['ID_PROPOSTA'], row['NR_CONVENIO'], row['ID_META']
            if proposal not in proposals:
                continue
            if agreement not in agreements or agreements[agreement][1] != proposal:
                other_agreement += 1
                continue
            if (None in row or None in row.values() or not re.fullmatch(r'[0-9]{1,20}', goal_id)
                    or int(goal_id) == 0 or goal_id in ids):
                raise ValueError(f'Invalid selected source record {source_records}.')
            ids.add(goal_id)
            state, place = row['UF_META'].strip().upper(), row['MUNICIPIO_META'].strip()
            state_value = state if state in STATES.values() else None
            if state in {'', 'NULL', 'NA'} or place.upper() in {'', 'NULL', 'NA'}:
                codes, resolution = set(), 'missing-state-or-municipality'
            else:
                codes = {place} if place in places and STATES[place[:2]] == state else by_name.get((state, fold_name(place)), set())
                resolution = 'municipality-linked' if len(codes) == 1 else 'unresolved-municipality'
            code = next(iter(codes)) if len(codes) == 1 else None
            start, end = normalize_date(row['DATA_INICIO_META']), normalize_date(row['DATA_FIM_META'])
            if not start or not end or start > end:
                raise ValueError(f'Invalid planned dates at source record {source_records}.')
            counts[resolution] += 1
            records.append((proposal, agreement, goal_id, source_records, state_value, code, resolution, start, end))
    records.sort(key=lambda row: (row[1], row[2]))
    return records, source_records, other_agreement, counts


def coverage(goals, agreements, years):
    by_agreement = defaultdict(list)
    for goal in goals:
        by_agreement[goal[1]].append(goal)
    counts = Counter()
    for agreement, group in by_agreement.items():
        codes = {row[5] for row in group if row[5]}
        known = sum(bool(row[5]) for row in group)
        counts['allGoalsResolved'] += known == len(group)
        counts['someGoalsResolved'] += 0 < known < len(group)
        counts['noGoalsResolved'] += known == 0
        counts['multipleMunicipalities'] += len(codes) > 1
        state = agreements[agreement][4]
        counts['plannedStateDiffersFromProponent'] += bool(state and any(row[5] and row[4] != state for row in group))
    by_year = {}
    for year in years:
        year_counts = Counter()
        municipalities = set()
        for agreement, row in agreements.items():
            if not any(order[1][:4] == year for order in row[9]):
                continue
            group = [goal for goal in by_agreement[agreement]
                     if goal[7] <= year + '-12-31' and goal[8] >= year + '-01-01']
            codes = {goal[5] for goal in group if goal[5]}
            municipalities.update(codes)
            year_counts['agreementsWithBankOrders'] += 1
            year_counts['agreementsWithOverlappingGoals'] += bool(group)
            year_counts['agreementsWithLinkedOverlappingGoals'] += bool(codes)
            year_counts['linkedOverlappingGoals'] += sum(bool(goal[5]) for goal in group)
        by_year[year] = {**year_counts, 'linkedMunicipalities': len(municipalities)}
    return dict(counts), by_year


def build(inputs, output):
    transfer, agreements = read_transfer(TRANSFER)
    model = inputs / 'modelo-dados-real.zip'
    if fingerprint(model) != transfer['source']['model']['sha256']:
        raise ValueError('Unexpected Transferegov field dictionary fingerprint.')
    places, by_name = read_places(checked(inputs / DTB['file'], DTB))
    goals, source_rows, other_agreement, statuses = read_goals(checked(inputs / GOALS['file'], GOALS),
                                                              agreements, places, by_name)
    codes = {goal[5] for goal in goals if goal[5]}
    if {goal[1] for goal in goals} != set(agreements):
        raise ValueError('Unexpected coverage of pinned transfer agreements.')
    selected_places = [place for code, place in places.items() if code in codes]
    counts, by_year = coverage(goals, agreements, transfer['coverage'])
    content = encode({'municipalities': selected_places, 'plannedGoals': goals})
    buffer = BytesIO()
    with GzipFile(fileobj=buffer, mode='wb', filename='', mtime=0) as archive:
        archive.write(content)
    packed = buffer.getvalue()
    manifest = {
        'format': 'charitology-br-planned-geography-v1',
        'sources': {
            'workPlan': {**GOALS, 'dataRecords': source_rows, 'catalog': DATASET, 'dictionary': transfer['source']['model']},
            'municipalities': {**DTB, 'listedLocalities': len(places)},
            'transfers': {'base': '/data/funding-flows/brazil-transferegov/', 'capturedOn': transfer['capturedOn'],
                          'asset': transfer['asset']},
        },
        'selection': {
            'otherAgreementForSelectedProposal': other_agreement,
            'agreements': len(agreements), 'goals': len(goals), 'municipalities': len(selected_places),
            'goalStatuses': statuses, 'agreementCoverage': counts, 'byBankOrderYear': by_year,
        },
        'coordinates': {
            'sourceDataRecord': 'One-based CSV data record after the header in the work-plan archive.',
            'odsPhysicalRow': 'One-based table-row element in content.xml of the IBGE municipality workbook.',
        },
        'fields': {'goals': GOAL_FIELDS, 'municipalities': PLACE_FIELDS},
        'asset': {'path': 'planned-goals.json.gz', 'bytes': len(packed), 'sha256': sha256(packed).hexdigest(),
                  'decodedBytes': len(content), 'decodedSha256': sha256(content).hexdigest()},
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / manifest['asset']['path']).write_bytes(packed)
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs', type=Path)
    parser.add_argument('output', type=Path)
    arguments = parser.parse_args()
    build(arguments.inputs, arguments.output)
