"""Build the fixed November 2026 Brazil infrastructure evidence edition."""
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from csv import DictReader, field_size_limit
from datetime import datetime
from decimal import Decimal
from gzip import decompress
from hashlib import sha256
from io import TextIOWrapper
from pathlib import Path
from tempfile import TemporaryFile
from time import sleep
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zipfile import ZipFile
import argparse
import json
import re

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'public/data/funding-flows'
PORTAL = 'https://api-publica.transferegov.gestao.gov.br/downloads'
OBRAS = 'https://api-publica.obrasgov.gestao.gov.br/obras'
SIDRA = 'https://apisidra.ibge.gov.br/values/t/10125/n6/4209003,3549904/v/all/p/2022'
ARCHIVES = {
    'siconv_empenho': (23644993, 'acdc4a11da4d2f222d725884e8d1db317bac2ce62e4e4823fd1720daf4ed4f5e'),
    'siconv_empenho_cipi': (1574111, '7f27662f686b297930bc2833107c4f9b9803727ce27f2109049c434b3afe950f'),
    'siconv_execucao_fisica_cipi': (432260, '55c22f10331b90717418f36c2f5370dcf6147d697180884956af283903e3f12c'),
}
API_FIELDS = {
    'projeto-investimento': ('situacao', 'dt_inicial_efetiva', 'dt_final_efetiva', 'uf_principal',
                            'natureza_intervencao', 'especie_intervencao', 'sistema_resp'),
    'geometria': ('id_geometria', 'cod_ibge', 'no_municipio', 'sg_uf', 'origem_geometria'),
    'execucao-fisica': ('percentual_execucao_fisica', 'dt_inicial_execucao', 'dt_final_execucao',
                       'dt_cadastro_execucao', 'dt_atualizacao_execucao', 'tipo_instrumento'),
}
TRANSFER_SHA = 'e104204207990851b245721a8a6e22746e59ad7f4935da7ac41abf5e0dd01798'
PLANS_SHA = '37db3c2e25dc5194b1c6335191296e07f328f99cad386c5d9ee6908dc05ed22d'
VERSION_SHA = '62972ff4105edefda0f338882053c4c49844f4a9558a0c2324326c39aa41b2ce'
field_size_limit(1_000_000)


def digest(value):
    return sha256(value).hexdigest()


def encode(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def open_source(address):
    return urlopen(Request(address, headers={'Accept-Encoding': 'identity'}), timeout=35)


def fetch_json(url, file, inputs):
    if inputs:
        raw = (inputs / file).read_bytes()
    else:
        for attempt in range(2):
            try:
                with open_source(url) as response:
                    raw = response.read(2_000_001)
                break
            except HTTPError as error:
                if error.code not in (502, 503, 504) or attempt:
                    raise
                sleep(2)
    if len(raw) > 2_000_000:
        raise ValueError(f'Oversized source: {file}')
    return json.loads(raw, parse_float=Decimal), {'url': url, 'bytes': len(raw), 'sha256': digest(raw)}


def records(name, inputs):
    size, sha = ARCHIVES[name]
    url = f'{PORTAL}/dadosgov/{name}.zip'
    hashed = sha256()
    count = 0
    with TemporaryFile() as spool, ((inputs / (name + '.zip')).open('rb') if inputs else open_source(url)) as raw:
        while chunk := raw.read(1_000_000):
            count += len(chunk)
            if count > size:
                raise ValueError(f'Unexpected source size: {name}')
            hashed.update(chunk)
            spool.write(chunk)
        if count != size or hashed.hexdigest() != sha:
            raise ValueError(f'Unexpected source fingerprint: {name}')
        with ZipFile(spool) as archive:
            member = name + '.csv'
            if archive.namelist() != [member]:
                raise ValueError(f'Unexpected members: {name}')
            with TextIOWrapper(archive.open(member), encoding='utf-8-sig', errors='surrogateescape', newline='') as stream:
                yield from enumerate(DictReader(stream, delimiter=';'), 1)


def read_edition(name, expected):
    base = BASE / name
    manifest = json.loads((base / 'manifest.json').read_bytes())
    asset = manifest['asset']
    data = (base / asset['path']).read_bytes()
    if digest(data) != expected or asset['sha256'] != expected:
        raise ValueError(f'Unexpected prior edition: {name}')
    return json.loads(decompress(data)), {'asset': asset, 'base': f'/data/funding-flows/{name}/'}


def date(value):
    if not value:
        return None
    return datetime.strptime(value, '%d/%m/%Y').date().isoformat()


def cents(value):
    if not value:
        return None
    if not re.fullmatch(r'-?[0-9]+(?:,[0-9]{1,2})?', value):
        raise ValueError(f'Unrecognized BRL amount: {value!r}')
    number = int(Decimal(value.replace(',', '.')) * 100)
    if abs(number) > 2**53 - 1:
        raise ValueError('BRL amount exceeds an exact browser integer.')
    return number


def percentage(value):
    if value is None or value == '':
        return None
    number = Decimal(str(value).replace(',', '.'))
    if not 0 <= number <= 100:
        raise ValueError(f'Invalid physical percentage: {value!r}')
    return str(number)


def join_commitments(agreements, inputs):
    cipi = defaultdict(list)
    siconv = defaultdict(list)
    for coordinate, row in records('siconv_empenho_cipi', inputs):
        key = (row['UG_EMITENTE'], row['NR_EMPENHO'])
        if all(key) and row['ID_PROJETO_INVESTIMENTO']:
            cipi[key].append((coordinate, row['ID_PROJETO_INVESTIMENTO'], row['DATA_EMISSAO'],
                             row['VALOR_EMPENHO'], row['SISTEMA_ORIGEM']))
    for coordinate, row in records('siconv_empenho', inputs):
        key = (row['UG_EMITENTE'], row['NR_EMPENHO'])
        if key in cipi:
            siconv[key].append((coordinate, row['NR_CONVENIO'], row['ID_EMPENHO'], row['DATA_EMISSAO'],
                               row['VALOR_EMPENHO'], row['DESC_TIPO_NOTA'], row['DESC_SITUACAO_EMPENHO']))
    by_agreement = defaultdict(lambda: defaultdict(list))
    for key, source_rows in siconv.items():
        agreement_ids = {row[1] for row in source_rows}
        project_ids = {row[1] for row in cipi[key]}
        if len(agreement_ids) != 1 or len(project_ids) != 1:
            continue
        agreement = next(iter(agreement_ids))
        project = next(iter(project_ids))
        if agreement not in agreements:
            continue
        if len(cipi[key]) != 1 or len(source_rows) != 1:
            raise ValueError('Unexpected multiple source rows for a selected commitment.')
        c_row, _, c_date, c_amount, c_system = cipi[key][0]
        s_row, _, s_id, s_date, s_amount, s_type, s_status = source_rows[0]
        by_agreement[agreement][project].append({
            'issuingUnit': key[0], 'commitmentNumber': key[1],
            'siconv': {'row': s_row, 'id': s_id, 'issueDate': date(s_date), 'amountCentsBRL': cents(s_amount),
                       'noteType': s_type, 'status': s_status},
            'cipi': {'row': c_row, 'issueDate': date(c_date), 'amountCentsBRL': cents(c_amount), 'sourceSystem': c_system},
        })
    if any(len(projects) != 1 for projects in by_agreement.values()):
        raise ValueError('Unexpected multi-project relationship in the pinned edition.')
    output = {agreement: next(iter(projects.items())) for agreement, projects in by_agreement.items()}
    if len(output) != 88 or len({row[0] for row in output.values()}) != 88:
        raise ValueError('Unexpected agreement or project coverage.')
    return output


def read_physical(projects, inputs):
    result = defaultdict(list)
    for coordinate, row in records('siconv_execucao_fisica_cipi', inputs):
        project = row['id_projeto_investimento']
        if project in projects:
            result[project].append({'row': coordinate, 'statusCode': row['id_situacao'],
                                    'statusDate': date(row['data_situacao']),
                                    'percent': percentage(row['percentual_execucao'])})
    return result


def read_api(project, inputs):
    if not re.fullmatch(r'[0-9]+\.[0-9]{2}-[0-9]{2}', project):
        raise ValueError(f'Unexpected project identifier {project}')
    result = {}
    for endpoint, fields in API_FIELDS.items():
        address = OBRAS + '/' + endpoint + '?' + urlencode({
            'id_projeto_investimento': project, 'pagina': 1, 'tamanho_da_pagina': 200,
        })
        value, receipt = fetch_json(address, f'obrasgov/{project}-{endpoint}.json', inputs)
        rows = value['data']
        if value['page_number'] != 1 or value['total_pages'] > 1 or len(rows) != value['total_items']:
            raise ValueError('The pinned API edition uses complete, single-page responses.')
        if any(row['id_projeto_investimento'] != project for row in rows):
            raise ValueError('Wrong project in the API response.')
        clean = []
        for row in rows:
            projected = {field: row[field] for field in fields}
            if endpoint == 'execucao-fisica':
                projected['percentual_execucao_fisica'] = percentage(projected['percentual_execucao_fisica'])
            clean.append(projected)
        result[endpoint] = {'source': receipt, 'rows': clean}
        if not inputs:
            sleep(.40)
    if len(result['projeto-investimento']['rows']) != 1 or len(result['execucao-fisica']['rows']) > 1:
        raise ValueError('Unexpected project or physical record count.')
    return result


def read_need(inputs):
    rows, receipt = fetch_json(SIDRA, 'ibge-10125.json', inputs)
    values = {}
    for index, row in enumerate(rows[1:], 1):
        if row['D3C'] == '2022' and row['D4C'] == '6794' and row['D5C'] == '95253':
            code = row['D1C']
            item = values.setdefault(code, {'municipality': row['D1N'], 'variables': {}})
            if row['D2C'] in item['variables']:
                raise ValueError('Repeated census variable.')
            item['variables'][row['D2C']] = {'value': row['V'], 'row': index}
    expected = {'4209003': ('29506', '1665', '5.6'), '3549904': ('683181', '41456', '6.1')}
    if {code: tuple(item['variables'][var]['value'] for var in ('11852', '12785', '13403'))
            for code, item in values.items()} != expected:
        raise ValueError('Unexpected preliminary census observations.')
    return {'source': receipt, 'year': 2022, 'table': '10125', 'values': values}


def build(inputs):
    transfer_rows, transfer_meta = read_edition('brazil-transferegov', TRANSFER_SHA)
    plan, plan_meta = read_edition('brazil-planned-geography', PLANS_SHA)
    agreements = {row[0]: row for row in transfer_rows}
    joins = join_commitments(agreements, inputs)
    history = read_physical({value[0] for value in joins.values()}, inputs)
    places = {row[0]: row[1] for row in plan['municipalities']}
    goals = defaultdict(list)
    for row in plan['plannedGoals']:
        if row[1] in joins:
            goals[row[1]].append(row)
    before, version = fetch_json(OBRAS + '/data-atualizacao', 'obrasgov/version.json', inputs)
    if version['sha256'] != VERSION_SHA:
        raise ValueError('Obrasgov publisher version differs from the pinned November 11 edition.')
    ordered = sorted(joins)
    with ThreadPoolExecutor(max_workers=2) as pool:
        api = list(pool.map(lambda agreement: read_api(joins[agreement][0], inputs), ordered))
    after, end = fetch_json(OBRAS + '/data-atualizacao', 'obrasgov/version.json', inputs)
    if before != after or end != version:
        raise ValueError('Obrasgov changed during capture.')
    projects = []
    counts = Counter()
    for agreement, observations in zip(ordered, api):
        project, commitments = joins[agreement]
        physical = observations['execucao-fisica']['rows']
        status = observations['projeto-investimento']['rows'][0]['situacao']
        geography = observations['geometria']['rows']
        if any(not re.fullmatch(r'[0-9]{7}', str(row['cod_ibge'])) for row in geography):
            raise ValueError('Unexpected municipality identifier.')
        current = {str(row['cod_ibge']) for row in geography}
        planned = {row[5] for row in goals[agreement] if row[5]}
        comparison = ('unknown-plan' if not planned else 'unknown-register' if not current else
                      'same' if planned == current else 'partial' if planned & current else 'different')
        counts[comparison] += 1
        counts['commitments'] += len(commitments)
        counts['geographyRows'] += len(geography)
        counts['currentPhysical'] += bool(physical)
        counts['historicalPhysical'] += bool(history[project])
        counts['historicalPhysicalRows'] += len(history[project])
        if physical and physical[0]['percentual_execucao_fisica'] is not None:
            number = Decimal(physical[0]['percentual_execucao_fisica'])
            counts['current100'] += number == 100
            counts['current100OtherStatus'] += number == 100 and status != 'Concluída'
        row = agreements[agreement]
        projects.append({'agreement': agreement, 'proposal': row[1], 'cnpj': row[2],
                         'organization': row[3], 'proponentState': row[4],
                         'project': project, 'bankOrders': row[9],
                         'plannedMunicipalities': [{'code': code, 'name': places[code]} for code in sorted(planned)],
                         'goals': len(goals[agreement]), 'unresolvedGoals': sum(row[5] is None for row in goals[agreement]),
                         'geographyComparison': comparison, 'api': observations, 'physicalHistory': history[project],
                         'commitments': sorted(commitments, key=lambda item: item['siconv']['row'])})
    archives = {name: {'url': f'{PORTAL}/dadosgov/{name}.zip', 'bytes': size, 'sha256': sha}
                for name, (size, sha) in ARCHIVES.items()}
    return {'format': 'charitology-br-infrastructure-v1', 'capturedOn': '2026-11-11', 'currency': 'BRL',
            'sources': {'archives': archives, 'apiVersion': {**version, 'reported': before},
                        'transfer': transfer_meta, 'plans': plan_meta,
                        'licence': 'https://opendatacommons.org/licenses/odbl/1-0/'},
            'coverage': {'transferAgreements': len(agreements), 'selectedProjects': len(projects), **counts},
            'census': read_need(inputs), 'projects': projects}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--fetch', action='store_true', help='read the exact dated official sources over HTTPS')
    mode.add_argument('--inputs', type=Path, help='directory with the exact original capture files')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    data = build(args.inputs)
    reference = ROOT / 'src/data/funding-flows/brazil-project-execution.json'
    if reference.exists() and data != json.loads(reference.read_text(encoding='utf-8')):
        parser.error('Source replay differs from the pinned project edition.')
    args.output.write_text(encode(data), encoding='utf-8')
    print(encode(data['coverage']).strip())
