"""Rebuild the MDS call case from pinned official notices, bank orders, plans and survey estimates.

Use pdfplumber 0.11.9 for the notice text extraction. The current download
links may serve newer archive bytes. Supply the exact captures listed in SOURCES.
"""
import argparse
import csv
import gzip
import io
import json
import re
from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import date, datetime
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile

import pdfplumber


PROGRAM_ID = '54042'
PROGRAM_CODE = '5500020240023'
NOTICE_FILES = ('resultado-definitivo-14-2024.pdf', 'convocacao-adicional-14-2024.pdf')
NOTICE_LINE = re.compile(r'^\.+(\d{6}/2024)\s.*?\s\.(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})\s')
UF_BY_IBGE = dict(zip('11 12 13 14 15 16 17 21 22 23 24 25 26 27 28 29 31 32 33 35 41 42 43 50 51 52 53'.split(),
                      'RO AC AM RR PA AP TO MA PI CE RN PB PE AL SE BA MG ES RJ SP PR SC RS MS MT GO DF'.split()))
DOWNLOADS = 'https://api-publica.transferegov.gestao.gov.br/downloads/dadosgov/'
NOTICES = 'https://mds.gov.br/webarquivos/MDS/2_Acoes_e_Programas/Acesso_a_Alimentos_e_a_Agua/Programa_Cozinha_Solidaria/Editais_de_Chamada_Publica/'
SOURCES = {
    'siconv_proposta.zip': (DOWNLOADS + 'siconv_proposta.zip', '8ef18d1536a8d6d36a8ef71550978c7bede2a546b74ff33d756d3290ecc17e4e'),
    'siconv_convenio.zip': (DOWNLOADS + 'siconv_convenio.zip', '96110a017e3e0b8d139faedc6a105334d13d8f86f433e67b840d6f75779c6f4d'),
    'siconv_programa.zip': (DOWNLOADS + 'siconv_programa.zip', 'f7059da77d4bfabaa50127ddd7106f3c0387f19d11d795714e1806a9bd7fa555'),
    'siconv_programa_proposta.zip': (DOWNLOADS + 'siconv_programa_proposta.zip', 'cecf74cf71c4501434a2f0d292c76a3405ad410ce4871a1a10fff974da693dc6'),
    'siconv_meta_crono_fisico.zip': (DOWNLOADS + 'siconv_meta_crono_fisico.zip', '2072a4aaec570f721e3306a828fc07a3d1c77b082d911457bf858e5d8350dbfe'),
    NOTICE_FILES[0]: (NOTICES + 'Resultado_definitivo_Edital_14_2024.pdf', '2c5f2d438212b846bec74fab5db75f7f1d2d219c2444d654a3f53d5b5b494ac5'),
    NOTICE_FILES[1]: (NOTICES + 'Retificacao_Edital_14_2024.pdf', '0280d8f58970e2b6a9a0adaf1725352435b4e5ae9b044362422448eb32664b79'),
    'pnad-food-classes-2024.json': ('https://apisidra.ibge.gov.br/values/t/9552/n3/all/v/162,5123,9784,9785/p/2024/c12404/all',
                                    'aa788813d9f3349f871c3e2bc49d169f047f943efe121b41f404416eb6d41261'),
}
FINANCE = Path(__file__).resolve().parents[1] / 'public/data/funding-flows/brazil-transferegov/agreements.json.gz'
FINANCE_SHA = 'e104204207990851b245721a8a6e22746e59ad7f4935da7ac41abf5e0dd01798'
NEED_CLASSES = {'109099': 'any', '109102': 'severe'}
NEED_MEASURES = {'162': 'householdsThousands', '5123': 'householdsCvPercent', '9784': 'sharePercent', '9785': 'shareCvPercent'}


def cnpj(value):
    return re.sub(r'[^0-9A-Z]', '', value)


def source_date(value):
    try:
        return datetime.strptime(value, '%d/%m/%Y').date()
    except ValueError:
        return None


@contextmanager
def records(inputs, name):
    path = f'siconv_{name}.csv'
    with ZipFile(inputs / path.replace('.csv', '.zip')) as archive, archive.open(path) as raw:
        yield enumerate(csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''), delimiter=';'), 1)


def notice_pairs(path):
    pairs = {}
    with pdfplumber.open(path) as pdf:
        for page, pdf_page in enumerate(pdf.pages[:2], 1):
            for line in pdf_page.extract_text().splitlines():
                match = NOTICE_LINE.match(line)
                if match:
                    proposal, identity = match.groups()
                    pair = (proposal, cnpj(identity))
                    assert pair not in pairs
                    pairs[pair] = page
    assert len(pairs) == 23, (path, len(pairs))
    return pairs


def need_by_state(path):
    survey = json.loads(path.read_text())
    state_need = {}
    assert survey[0]['D1N'] == 'Unidade da Federação'
    for entry in survey[1:]:
        state, measure, period, class_id, place = (entry[f'D{col}C'] for col in range(1, 6))
        if place != '6795' or class_id not in NEED_CLASSES:
            continue
        assert period == '2024'
        uf = UF_BY_IBGE[state]
        record = state_need.setdefault(uf, {'stateCode': state, 'stateName': entry['D1N'], 'any': {}, 'severe': {}})
        sample = record[NEED_CLASSES[class_id]]
        name = NEED_MEASURES[measure]
        assert name not in sample and record['stateName'] == entry['D1N'] and re.fullmatch(r'\d+(?:\.\d+)?', entry['V'])
        sample[name] = entry['V']
    assert len(state_need) == 27 and all(len(row['any']) == len(row['severe']) == 4 for row in state_need.values())
    return state_need


def build(inputs):
    for path, expected in [(inputs / file, spec[1]) for file, spec in SOURCES.items()] + [(FINANCE, FINANCE_SHA)]:
        with path.open('rb') as raw:
            if sha256_stream(raw) != expected:
                raise ValueError(f'Unexpected bytes in {path.name}.')
    csv.field_size_limit(1_000_000)
    first, later = (notice_pairs(inputs / file) for file in NOTICE_FILES)
    assert first.keys() == later.keys()
    with records(inputs, 'programa') as programs:
        program_rows = [n for n, row in programs if row['ID_PROGRAMA'] == PROGRAM_ID and row['COD_PROGRAMA'] == PROGRAM_CODE]
    assert program_rows
    with records(inputs, 'programa_proposta') as links:
        coordinates = defaultdict(list)
        for n, row in links:
            if row['ID_PROGRAMA'] == PROGRAM_ID:
                coordinates[row['ID_PROPOSTA']].append(n)
    selected = {}
    with records(inputs, 'proposta') as proposals:
        for n, row in proposals:
            proposal_id = row['ID_PROPOSTA']
            if proposal_id not in coordinates:
                continue
            number = row['NR_PROPOSTA']
            if re.fullmatch(r'\d{1,6}/2024', number) is None:
                continue
            pair = (number.zfill(11), cnpj(row['IDENTIF_PROPONENTE']))
            if pair not in first:
                continue
            assert proposal_id not in selected and len(coordinates[proposal_id]) == 1
            selected[proposal_id] = {'proposalId': proposal_id, 'proposalNumber': pair[0], 'cnpj': pair[1],
                                     'noticePage': first[pair], 'laterNoticePage': later[pair],
                                     'programLinkRecord': coordinates[proposal_id][0], 'proposalRecord': n,
                                     'modality': row['MODALIDADE']}
    assert len(selected) == 23 and len({row['cnpj'] for row in selected.values()}) == 23
    with records(inputs, 'convenio') as agreements:
        for n, row in agreements:
            if row['ID_PROPOSTA'] not in selected:
                continue
            match = selected[row['ID_PROPOSTA']]
            assert 'agreementId' not in match
            signed = source_date(row['DIA_ASSIN_CONV'])
            match.update(agreementId=row['NR_CONVENIO'], agreementRecord=n,
                         signed=signed.isoformat() if signed else None, signatureFlag=row['IND_ASSINADO'])
    terms = {row['agreementId']: row for row in selected.values() if row.get('signed')}
    assert len(terms) == 21 and {row['modality'] for row in terms.values()} == {'TERMO DE COLABORACAO'}, (
        len(terms), Counter((row['modality'], row.get('signatureFlag'), bool(row.get('signed'))) for row in selected.values()))
    assert all((row['signatureFlag'] == 'SIM') == bool(row['signed']) for row in selected.values())
    with gzip.open(FINANCE, 'rt', encoding='utf-8') as source:
        finance = {row[0]: row for row in json.load(source) if row[0] in terms}
    assert terms.keys() == finance.keys()
    for identity, data in finance.items():
        term = terms[identity]
        assert (term['proposalId'], term['cnpj'], term['proposalRecord'], term['agreementRecord']) == (data[1], data[2], data[5], data[6])
        assert term['signed'] == data[7]
        term.update(organizationName=data[3], contributionCents=data[8], orders=data[9],
                    plannedStates=defaultdict(list), geographyGaps=Counter())

    with records(inputs, 'meta_crono_fisico') as plans:
        for n, row in plans:
            term = terms.get(row['NR_CONVENIO'])
            if not term:
                continue
            if row['ID_PROPOSTA'] != term['proposalId']:
                term['geographyGaps']['differentProposalId'] += 1
                continue
            if row['COD_PROGRAMA'] and row['COD_PROGRAMA'] != PROGRAM_CODE:
                term['geographyGaps']['differentProgramCode'] += 1
                continue
            start, end = source_date(row['DATA_INICIO_META']), source_date(row['DATA_FIM_META'])
            if start is None or end is None or start > end:
                term['geographyGaps']['missingDates'] += 1
            elif start > date(2025, 12, 31) or end < date(2025, 1, 1):
                continue
            elif row['UF_META'] in UF_BY_IBGE.values():
                term['plannedStates'][row['UF_META']].append(n)
            else:
                term['geographyGaps']['missingState'] += 1

    return {
        'edition': '2026-11-11', 'currency': 'BRL', 'programId': PROGRAM_ID, 'programCode': PROGRAM_CODE, 'programRows': program_rows,
        'sources': {file: {'url': url, 'sha256': digest} for file, (url, digest) in SOURCES.items()},
        'transferEdition': {'manifest': '/data/funding-flows/brazil-transferegov/manifest.json', 'sha256': FINANCE_SHA,
                            'license': 'https://opendatacommons.org/licenses/odbl/1-0/'},
        'planYear': 2025, 'surveyPeriod': '2024-Q4', 'surveyLocationClass': '6795',
        'surveyClasses': NEED_CLASSES, 'surveyMeasures': NEED_MEASURES,
        'orderFields': ['orderId', 'date', 'cents', 'sourceRecord'],
        'selected': sorted(selected.values(), key=lambda x: x['proposalNumber']),
        'foodInsecurity2024': need_by_state(inputs / 'pnad-food-classes-2024.json'),
    }


def sha256_stream(raw):
    digest = sha256()
    while chunk := raw.read(1_048_576):
        digest.update(chunk)
    return digest.hexdigest()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs', type=Path, help='Directory of pinned official source captures.')
    parser.add_argument('output', type=Path, help='Path for the resulting public JSON snapshot.')
    args = parser.parse_args()
    args.output.write_text(json.dumps(build(args.inputs), indent=2, sort_keys=True, ensure_ascii=False) + '\n', encoding='utf-8')
