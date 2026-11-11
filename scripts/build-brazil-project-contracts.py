#!/usr/bin/env python3
"""Reproduce the exact public works contract comparison for the November 11 edition."""

from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
import argparse
import json
import re

from brazil_transferegov_archives import ARCHIVE_BASE, verified_rows

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'src/data/funding-flows'
PROJECT_HASH = 'a6a9ebd38da473a623bbcab293ff0047bf61ab19eace9a26659b64b3bc05b0c7'
ARCHIVES = {
    'siconv_contrato_cipi': (4_275_091, '6120b226e3185118dfdf703641493c2057a34786320a1689b97b83aac77f733c', 39_099),
    'siconv_licitacao': (27_194_887, 'dc71781983b8b9175dbb76bfc967e279a01bbc69c09b4ec2495af3d0613b9480', 991_315),
    'siconv_contrato': (75_481_522, '93217bada644822989ddc7f9ebc3271aec488febcb2e0714c36a2eb5cc55ae6d', 757_996),
}
PORTAL_LINK = re.compile(
    r'https://instrumentoscontratuais\.transferegov\.sistema\.gov\.br/contratos/contratos/'
    r'instrumentos-contratuais/detalhar/detalhar/([0-9]{1,20})&Usr=guest&Pwd=guest'
)


def institutional(value):
    if not re.fullmatch(r'[0-9]{14}', value) or len(set(value)) == 1:
        return False
    for position, weights in [(12, (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)),
                              (13, (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))]:
        remainder = sum(int(digit) * weight for digit, weight in zip(value, weights)) % 11
        if int(value[position]) != (0 if remainder < 2 else 11 - remainder):
            return False
    return True


def number(value):
    if not re.fullmatch(r'[0-9]{1,20}', value):
        raise ValueError('Unexpected source identifier shape.')
    return value


def day(value):
    if not value:
        return None
    if re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', value):
        return date.fromisoformat(value).isoformat()
    return datetime.strptime(value, '%d/%m/%Y').date().isoformat()


def signature(row):
    return tuple(row[field] for field in ('NR_CONTRATO', 'DATA_ASSINATURA_CONTRATO',
                                         'VALOR_GLOBAL_CONTRATO', 'ID_FORNECEDOR_CONTRATO'))


def amount(value):
    if not re.fullmatch(r'[0-9]+(?:,[0-9]{1,2})?', value):
        raise ValueError('Unexpected BRL amount format.')
    cents = int(Decimal(value.replace(',', '.')) * 100)
    if cents > 2**53 - 1:
        raise ValueError('Contract amount exceeds exact browser integer.')
    return cents


def matched_projects(projects, directory):
    by_project = {row['project']: row['agreement'] for row in projects}
    groups = defaultdict(list)
    references = defaultdict(set)
    with verified_rows('siconv_contrato_cipi', directory, ARCHIVES['siconv_contrato_cipi']) as rows:
        for coordinate, row in rows():
            project = row['ID_PROJETO_INVESTIMENTO']
            agreement = by_project.get(project)
            if agreement is None:
                continue
            link = PORTAL_LINK.fullmatch(row['LINK_TRANSPARENCIA'])
            if row['ID_CONTRATO'] != agreement or not link or row['VALOR_ACUMULADO']:
                raise ValueError(f'Unexpected CIPI scope at source row {coordinate}.')
            key = signature(row)
            if not institutional(key[3]):
                raise ValueError(f'Unqualified institutional identifier at CIPI row {coordinate}.')
            group = (agreement, project, key)
            references[link[1]].add(group)
            groups[group].append({
                'sourceRow': coordinate, 'portalReference': link[1],
                'publishedOn': day(row['DATA_PUBLICACAO_CONTRATO']),
                'archiveStatus': row['SITUACAO'],
            })
    return groups, references


def find_candidates(groups, directory):
    signatures = {key for _, _, key in groups}
    contracts = defaultdict(list)
    with verified_rows('siconv_contrato', directory, ARCHIVES['siconv_contrato']) as rows:
        for coordinate, row in rows():
            key = signature(row)
            if key not in signatures:
                continue
            contract_id, procurement_id = number(row['ID_CONTRATO']), number(row['ID_LICITACAO'])
            contracts[key].append({
                'contractId': contract_id, 'procurementId': procurement_id, 'sourceRow': coordinate,
                'publishedOn': day(row['DATA_PUBLICACAO_CONTRATO']),
                'startsOn': day(row['DATA_INICIO_VIGENCIA_CONTRATO']),
                'endsOn': day(row['DATA_FIM_VIGENCIA_CONTRATO']),
            })

        keys = {(c['procurementId'], c['contractId']) for group in contracts.values() for c in group}
        occurrences = Counter()
        for _, row in rows():
            key = (row['ID_LICITACAO'], row['ID_CONTRATO'])
            if key in keys:
                occurrences[key] += 1

    tender_ids = {procurement_id for procurement_id, _ in keys}
    tenders = defaultdict(list)
    with verified_rows('siconv_licitacao', directory, ARCHIVES['siconv_licitacao']) as rows:
        for coordinate, row in rows():
            procurement_id = row['ID_LICITACAO']
            if procurement_id in tender_ids:
                tenders[procurement_id].append((row['NR_CONVENIO'], coordinate))
    return contracts, occurrences, tenders


def build(directory):
    project_bytes = (BASE / 'brazil-project-execution.json').read_bytes()
    if sha256(project_bytes).hexdigest() != PROJECT_HASH:
        raise ValueError('Unexpected prior project edition.')
    projects = json.loads(project_bytes)['projects']
    groups, references = matched_projects(projects, directory)
    contracts, occurrences, tenders = find_candidates(groups, directory)
    result = []
    for (agreement, project, key), archive_rows in groups.items():
        candidates = []
        for contract in contracts[key]:
            procurement_id = contract['procurementId']
            tender = tenders[procurement_id]
            if len(tender) != 1 or tender[0][0] != agreement:
                continue
            if occurrences[procurement_id, contract['contractId']] != 1:
                continue
            candidates.append({**contract, 'procurementSourceRow': tender[0][1]})

        contract_number, signed, value, _ = key
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9 ./_\-]{0,63}', contract_number) or not signed:
            raise ValueError('Unexpected printed contract number or signing date.')
        if len(candidates) != 1:
            raise ValueError(f'Expected one procurement match for agreement {agreement}.')
        for row in archive_rows:
            row['sharedPortalReference'] = len(references[row['portalReference']]) > 1
        result.append({
            'agreement': agreement, 'project': project, 'contractNumber': contract_number,
            'signedOn': day(signed), 'globalAmountCentsBRL': amount(value),
            'procurementContract': candidates[0], 'cipiRows': archive_rows,
        })

    result.sort(key=lambda row: (row['agreement'], row['signedOn'], row['procurementContract']['contractId']))
    contract_keys = {(r['procurementContract']['procurementId'], r['procurementContract']['contractId']) for r in result}
    if len(contract_keys) != len(result):
        raise ValueError('A procurement contract matches multiple published groups.')
    return {
        'format': 'charitology-br-infrastructure-contracts-v1',
        'capturedOn': '2026-11-11',
        'currency': 'BRL',
        'sources': {
            'projectEditionSha256': PROJECT_HASH,
            'archives': {name: {'url': f'{ARCHIVE_BASE}/{name}.zip', 'bytes': size,
                                'sha256': digest, 'dataRows': count}
                         for name, (size, digest, count) in ARCHIVES.items()},
            'license': 'https://opendatacommons.org/licenses/odbl/1-0/',
        },
        'coverage': {
            'projectEditionAgreements': len(projects),
            'agreementsWithContractRecords': len({row['agreement'] for row in result}),
            'cipiSourceRows': sum(map(len, groups.values())),
            'pairedContractReferences': len(result),
            'referencesWithRepeatedCipiRows': sum(len(rows) > 1 for rows in groups.values()),
            'portalReferences': len(references),
            'portalReferencesSharedByDifferentContracts': sum(len(items) > 1 for items in references.values()),
            'pairedReferencesWithSharedPortalReference': sum(any(row['sharedPortalReference'] for row in r['cipiRows']) for r in result),
        },
        'contracts': result,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--fetch', action='store_true', help='read the pinned public archives over HTTPS')
    mode.add_argument('--inputs', type=Path, help='folder containing the three exact source ZIPs')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    data = build(args.inputs)
    reference = BASE / 'brazil-project-contracts.json'
    if reference.exists() and data != json.loads(reference.read_text(encoding='utf-8')):
        parser.error('Source replay differs from the pinned contract edition.')
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(data['coverage'], indent=2))
