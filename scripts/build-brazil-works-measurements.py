#!/usr/bin/env python3
"""Rebuild the proposal-level Transferegov works monitoring edition."""

from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
import argparse
import json
import re

from brazil_transferegov_archives import ARCHIVE_BASE, verified_rows

DATA = Path(__file__).resolve().parent.parent / 'src/data/funding-flows'
PROJECT_HASH = 'a6a9ebd38da473a623bbcab293ff0047bf61ab19eace9a26659b64b3bc05b0c7'
HEADERS = 'siconv_acomp_obras_contratos_medicoes_modulo_empresas'
ITEMS = 'siconv_acomp_obras_valores_itens_medicao_modulo_empresas'
ARCHIVES = {
    HEADERS: (816_146, 'a5e7e80101c562eeeecba62e1dfdc9e148e8f66099cb8cf68338fd96484cacd8', 28_667),
    ITEMS: (402_887, 'dc19b91f409c20cfc5813e4a0f3e8497a8ee5241ce5655f6335bbc3567fcb2e9', 26_429),
}
MODEL = {
    'url': 'https://www.gov.br/transferegov/pt-br/ferramentas-gestao/paineis-gerenciais/arquivos/modelo-dados-csvs-discricionarias-e-legais.zip/@@display-file/file',
    'sha256': '558e962ec1854f001ad6a54ae406b6436847d02101233a96e5bff4427c0b7716',
    'member': 'modelo_dados_siconv.zip!/modelo_dados_sincov/bd_portal.public.xml',
}
CURRENCY_GUIDE = 'https://obras.campinagrande.pb.gov.br/wp-content/uploads/2025/07/Procedimento-interno-projeto-VLT.pdf'
STATUSES = frozenset((
    'Aceita', 'Atestada', 'Em Ateste pelo Convenente', 'Em Análise pelo Concedente/Mandatária',
    'Enviada para Complementação do Convenente', 'Enviada para o Convenente',
))
KEY = 'ID_CONTRATO_MEDICAO_ACOMPANHAMENTO_OBRA'
AMOUNT_PREFIX = 'VALOR_EXECUCAO_FISICA_ACUMULADA_'
AMOUNT_FIELDS = {'total': 'TOTAL', 'grantor': 'CONCEDENTE', 'recipient': 'CONVENENTE', 'company': 'EMPRESA'}


def identifier(value):
    if not re.fullmatch(r'[0-9]{1,20}', value):
        raise ValueError('Unexpected monitoring identifier.')
    return value


def day(value):
    if not value:
        return None
    if not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', value):
        raise ValueError('Unexpected date format.')
    return date.fromisoformat(value).isoformat()


def cents(value):
    if not value:
        return None
    if not re.fullmatch(r'[0-9]+(?:,[0-9]{1,2})?', value):
        raise ValueError('Unexpected monitoring amount format.')
    result = int(Decimal(value.replace(',', '.')) * 100)
    if result > 2**53 - 1:
        raise ValueError('Monitoring amount exceeds exact browser integer.')
    return result


def read_headers(projects, directory):
    proposals_by_key = defaultdict(set)
    reports = []
    with verified_rows(HEADERS, directory, ARCHIVES[HEADERS]) as rows:
        for source_row, row in rows():
            key = row[KEY]
            proposal = row['ID_PROPOSTA']
            if key:
                proposals_by_key[key].add(proposal)
            if proposal not in projects:
                continue
            status = row['SITUACAO_MEDICAO_ACOMPANHAMENTO_OBRA'] or None
            measurement = row['ID_MEDICAO_ACOMPANHAMENTO_OBRA']
            start = day(row['DATA_INICIO_MEDICAO_OBJETO_ACOMPANHAMENTO_OBRA'])
            end = day(row['DATA_FIM_MEDICAO_OBJETO_ACOMPANHAMENTO_OBRA'])
            if (status is not None and status not in STATUSES) or bool(start) != bool(end) or (start and end and start > end):
                raise ValueError(f'Unexpected monitoring header at source row {source_row}.')
            sequence = row['NUMERO_MEDICAO_ACOMPANHAMENTO_OBRA']
            latest = row['NR_ULTIMA_MEDICAO_ACOMPANHAMENTO_OBRA']
            reports.append({
                **projects[proposal], 'proposal': proposal, 'monitoringContractId': identifier(key), 'sourceRow': source_row,
                'worksStartOn': day(row['DATA_INICIO_OBRA_CONTRATO_ACOMPANHAMENTO_OBRA']),
                'measurementId': identifier(measurement) if measurement else None,
                'measurementNumber': identifier(sequence) if sequence else None,
                'lastMeasurementNumber': identifier(latest) if latest else None,
                'measurementStatus': status, 'periodStart': start, 'periodEnd': end,
            })
    for report in reports:
        if proposals_by_key[report['monitoringContractId']] != {report['proposal']}:
            raise ValueError(f"Monitoring key has multiple proposals at source row {report['sourceRow']}.")
    return reports


def read_items(reports, directory):
    records = {}
    for report in reports:
        key = report['monitoringContractId']
        records[key] = {field: report[field] for field in ('agreement', 'project', 'proposal', 'monitoringContractId')}
    seen = set()
    items = []
    with verified_rows(ITEMS, directory, ARCHIVES[ITEMS]) as rows:
        for source_row, row in rows():
            key = row[KEY]
            if key not in records:
                continue
            item = identifier(row['ID_SUBMETA_VRPL'])
            if (key, item) in seen:
                raise ValueError(f'Repeated measurement item at source row {source_row}.')
            seen.add((key, item))
            amounts = {label: cents(row[AMOUNT_PREFIX + field + '_ACOMPANHAMENTO_OBRA'])
                       for label, field in AMOUNT_FIELDS.items()}
            items.append({**records[key], 'measurementItemId': item, 'sourceRow': source_row, 'amountCentsBRL': amounts})
    return items


def build(directory):
    raw = (DATA / 'brazil-project-execution.json').read_bytes()
    if sha256(raw).hexdigest() != PROJECT_HASH:
        raise ValueError('Unexpected prior project edition.')
    projects = {row['proposal']: {'agreement': row['agreement'], 'project': row['project']} for row in json.loads(raw)['projects']}
    reports = read_headers(projects, directory)
    items = read_items(reports, directory)
    reports.sort(key=lambda row: (row['agreement'], row['periodStart'] or '', row['sourceRow']))
    items.sort(key=lambda row: (row['agreement'], row['sourceRow']))
    with_measurement = [row for row in reports if row['measurementId']]
    if len({row['measurementId'] for row in with_measurement}) != len(with_measurement):
        raise ValueError('Selected report identifiers repeat.')
    return {
        'format': 'charitology-br-works-measurements-v1',
        'capturedOn': '2026-11-11',
        'currency': 'BRL',
        'sources': {
            'projectEditionSha256': PROJECT_HASH,
            'archives': {name: {'url': f'{ARCHIVE_BASE}/{name}.zip', 'bytes': size,
                                'sha256': digest, 'dataRows': count}
                         for name, (size, digest, count) in ARCHIVES.items()},
            'dataModel': MODEL,
            'currencyExample': CURRENCY_GUIDE,
            'license': 'https://opendatacommons.org/licenses/odbl/1-0/',
        },
        'coverage': {
            'projectProposals': len(projects),
            'proposalsWithMonitoringRows': len({r['proposal'] for r in reports}),
            'monitoringRows': len(reports),
            'identifiedMeasurements': len(with_measurement),
            'proposalsWithMeasurements': len({r['proposal'] for r in with_measurement}),
            'measurementsWithPeriods': sum(r['periodStart'] is not None and r['periodEnd'] is not None for r in with_measurement),
            'statusCounts': dict(sorted(Counter(r['measurementStatus'] or 'unknown' for r in reports).items())),
            'monitoringKeysWithItemAmounts': len({r['monitoringContractId'] for r in items}),
            'proposalsWithItemAmounts': len({r['proposal'] for r in items}),
            'itemRows': len(items),
            'itemFieldsPresent': {key: sum(row['amountCentsBRL'][key] is not None for row in items) for key in AMOUNT_FIELDS},
        },
        'monitoring': reports,
        'items': items,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--fetch', action='store_true', help='read the pinned official archives over HTTPS')
    mode.add_argument('--inputs', type=Path, help='folder containing the two exact source ZIPs')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    data = build(args.inputs)
    reference = DATA / 'brazil-works-measurements.json'
    if reference.exists() and data != json.loads(reference.read_text(encoding='utf-8')):
        parser.error('Source replay differs from the pinned works monitoring edition.')
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(data['coverage'], ensure_ascii=False, indent=2))
