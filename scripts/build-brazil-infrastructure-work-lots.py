#!/usr/bin/env python3
"""Rebuild the pinned Transferegov works-contract, lot and authorization edition."""

import argparse
from collections import Counter, defaultdict
from datetime import date, datetime
import json
from pathlib import Path
import re

from brazil_infrastructure_payments import (
    CAPTURED_ON, PROJECT_SHA, qualified_id, read_edition, receipt_tuple, source_receipt,
)
from brazil_transferegov_archives import cnpj, exact_cents, verified_rows

CIPI_SHA = '850e1c79e330c554840ef8d5d6ce984147f30b805b8f600bee422d08569b241e'
PAYMENT_SHA = '7df2978953b130f398faaa9aec21217206250f90cff78f796dcf2e4f7aea02ff'
MODEL_SHA = '359a5f9e54bf636bd0192140b20998740c307e4a5c4fd39efe665dc11ae90444'
CONTRACTS = 'siconv_contrato'
PROCUREMENT = 'siconv_licitacao'
LOT = 'siconv_inst_cont_contratos_lotes_empresas_modulo_empresas'
AIO = 'siconv_inst_cont_proposta_aio_modulo_empresas'
SUBGOAL = 'siconv_inst_cont_metas_submetas_po_modulo_empresas'
WORKS_ARCHIVES = {
    LOT: (1_329_941, '060364b80029df9a38114898107c5c7e61335404680dd046d1bca67d710128ce', 38_521),
    AIO: (345_979, '089d0bd183b4ad4a76bb90f846ae94117a6715dd77a20f130cd5f8b4b7292bab', 33_235),
    SUBGOAL: (2_247_267, 'a3e121fa3f0a722867c47470fff83451db044936574ea693afb11200bb5e212e', 47_595),
}


def day(value):
    if not value:
        return None
    if re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', value):
        return date.fromisoformat(value).isoformat()
    if re.fullmatch(r'[0-9]{2}/[0-9]{2}/[0-9]{4}', value):
        return datetime.strptime(value, '%d/%m/%Y').date().isoformat()
    raise ValueError('Unrecognized source date.')


def required_id(value):
    if not qualified_id(value):
        raise ValueError('Unrecognized source identifier.')
    return value


def check_label(value, pattern):
    if not re.fullmatch(pattern, value):
        raise ValueError('Unexpected source label.')
    return value


def contract_key(record):
    return record['agreement'], record['procurementId'], record['contractId']


def procurement_owners(projects, directory, pin):
    with verified_rows(PROCUREMENT, directory, pin) as rows:
        selected = {row['ID_LICITACAO'] for _, row in rows() if row['NR_CONVENIO'] in projects}
        owners = defaultdict(list)
        for _, row in rows():
            key = row['ID_LICITACAO']
            if key in selected:
                owners[key].append(row['NR_CONVENIO'])
    return owners


def siconv_signature(proposal, row):
    return (proposal, cnpj(row['ID_FORNECEDOR_CONTRATO']), row['NR_CONTRATO'].strip(),
            day(row['DATA_ASSINATURA_CONTRATO']))


def contract_signatures(candidates, projects, owners, directory, pin):
    by_coordinate = {record['contractSourceRow']: record for record in candidates}
    if len(by_coordinate) != len(candidates):
        raise ValueError('The two source cohorts share a contract row.')
    signatures = {}
    counts = Counter()
    with verified_rows(CONTRACTS, directory, pin) as rows:
        for coordinate, row in rows():
            record = by_coordinate.get(coordinate)
            if record is None:
                continue
            key = contract_key(record)
            agreement, procurement, contract = key
            if (procurement, contract) != (row['ID_LICITACAO'], row['ID_CONTRATO']) or owners[procurement] != [agreement]:
                raise ValueError(f'SICONV source row {coordinate} disagrees with its upstream edition.')
            signature = siconv_signature(projects[agreement]['proposal'], row)
            if not all(signature):
                raise ValueError(f'SICONV source row {coordinate} has an incomplete signature.')
            signatures[key] = signature

        if len(signatures) != len(candidates):
            raise ValueError('A pinned contract source row is missing.')
        known = set(signatures.values())
        for _, row in rows():
            agreements = set(owners.get(row['ID_LICITACAO'], ())).intersection(projects)
            for agreement in agreements:
                signature = siconv_signature(projects[agreement]['proposal'], row)
                if signature in known:
                    counts[signature] += 1
    return signatures, counts


def capture_authorizations(directory):
    owners = defaultdict(list)
    with verified_rows(AIO, directory, WORKS_ARCHIVES[AIO]) as rows:
        for coordinate, row in rows():
            owners[row['ID_PROPOSTA_INSTRUMENTO_CONTRATUAL']].append((coordinate, row))
    return owners


def match_lot_records(signatures, authorizations, directory):
    known = set(signatures.values())
    matches = defaultdict(list)
    lot_owners = Counter()
    with verified_rows(LOT, directory, WORKS_ARCHIVES[LOT]) as rows:
        for coordinate, row in rows():
            instrument = row['ID_PROPOSTA_INSTRUMENTO_CONTRATUAL']
            lot = row['ID_LOTE_INSTRUMENTO_CONTRATUAL']
            lot_owners[instrument, lot] += 1
            originals = {record['ID_PROPOSTA'] for _, record in authorizations.get(instrument, [])}
            if not originals:
                continue
            supplier = cnpj(row['IDENTIFICACAO_EMPRESA_EXECUTORA_INSTRUMENTO_CONTRATUAL'])
            number = row['NUMERO_INSTRUMENTO_CONTRATUAL'].strip()
            signed = day(row['DATA_ASSINATURA_INSTRUMENTO_CONTRATUAL'])
            for proposal in originals:
                signature = proposal, supplier, number, signed
                if signature in known:
                    matches[signature].append({
                        'worksInstrumentId': required_id(instrument),
                        'worksContractId': required_id(row['ID_CONTRATO_INSTRUMENTO_CONTRATUAL']),
                        'lotId': required_id(lot),
                        'lotNumber': check_label(row['NUMERO_LOTE_INSTRUMENTO_CONTRATUAL'], r'[0-9]{1,12}'),
                        'lotSourceRow': coordinate,
                    })
    return matches, lot_owners


def qualification(signature, counts, matches, authorizations, lot_owners):
    if counts[signature] != 1:
        return 'ambiguousSiconv'
    if not matches:
        return 'noExactWorksMatch'
    instruments = {(row['worksInstrumentId'], row['worksContractId']) for row in matches}
    if len(instruments) != 1:
        return 'ambiguousWorksContract'
    instrument, _ = next(iter(instruments))
    if len(authorizations[instrument]) != 1:
        return 'ambiguousWorksInstrument'
    if any(lot_owners[instrument, row['lotId']] != 1 for row in matches):
        return 'ambiguousLot'
    return 'linked'


def matched_authorizations(lots, authorizations):
    by_instrument = {}
    for lot in lots:
        instrument = lot['worksInstrumentId']
        if instrument in by_instrument:
            continue
        (coordinate, row), = authorizations[instrument]
        status = row['SITUACAO_AIO_INSTRUMENTO_CONTRATUAL']
        issued = day(row['DATA_EMISSAO_AIO_INSTRUMENTO_CONTRATUAL'])
        authorization_id = row['ID_AIO_INSTRUMENTO_CONTRATUAL']
        if status == 'Emitida':
            if not issued or issued > CAPTURED_ON:
                raise ValueError(f'Invalid authorization issue date at source row {coordinate}.')
            authorization_id = required_id(authorization_id)
        elif status == 'Não Emitida' and not issued and not qualified_id(authorization_id):
            authorization_id = None
        else:
            raise ValueError(f'Unknown authorization combination at source row {coordinate}.')
        by_instrument[instrument] = {
            'agreement': lot['agreement'], 'proposal': lot['proposal'], 'project': lot['project'],
            'worksInstrumentId': instrument, 'authorizationId': authorization_id,
            'authorizationStatus': status, 'issuedOn': issued, 'authorizationSourceRow': coordinate,
        }
    return sorted(by_instrument.values(), key=lambda row: (row['agreement'], row['worksInstrumentId']))


def matched_subgoals(lots, directory):
    by_lot = {(row['worksInstrumentId'], row['lotId']): row for row in lots}
    if len(by_lot) != len(lots):
        raise ValueError('A lot is assigned to more than one upstream contract.')
    result = {}
    with verified_rows(SUBGOAL, directory, WORKS_ARCHIVES[SUBGOAL]) as rows:
        for coordinate, row in rows():
            key = row['ID_PROPOSTA_INSTRUMENTO_CONTRATUAL'], row['ID_LOTE_INSTRUMENTO_CONTRATUAL']
            lot = by_lot.get(key)
            if lot is None:
                continue
            subgoal = required_id(row['ID_SUBMETA_INSTRUMENTO_CONTRATUAL'])
            subgoal_key = key + (subgoal,)
            if subgoal_key in result:
                raise ValueError(f'Repeated subgoal within a lot at source row {coordinate}.')
            amount = exact_cents(row['VALOR_TOTAL_LICITADO_INSTRUMENTO_CONTRATUAL'])
            result[subgoal_key] = {
                **{field: lot[field] for field in ('agreement', 'proposal', 'project', 'worksInstrumentId', 'lotId')},
                'goalId': required_id(row['ID_META_INSTRUMENTO_CONTRATUAL']), 'subgoalId': subgoal,
                'budgetId': required_id(row['ID_PO_INSTRUMENTO_CONTRATUAL']),
                'reportedSubgoalStatus': check_label(row['SITUACAO_SUBMETA_INSTRUMENTO_CONTRATUAL'], r'[A-Z]{2,8}'),
                'plannedStartOn': day(row['DATA_PREVISAO_INICIO_OBRA_INSTRUMENTO_CONTRATUAL']),
                'budgetReferenceOn': day(row['DATABASE_PO_VRPL_INSTRUMENTO_CONTRATUAL']),
                'sourceLocalityCode': check_label(row['SIGLA_LOCALIDADE_PO_INSTRUMENTO_CONTRATUAL'], r'[A-Z]{2}'),
                'tenderedAmountCentsBRL': amount, 'subgoalSourceRow': coordinate,
            }
    return sorted(result.values(), key=lambda row: (row['agreement'], row['lotId'], row['subgoalId']))


def build(directory):
    projects_edition = read_edition('brazil-project-execution.json', PROJECT_SHA)
    cipi = read_edition('brazil-project-contracts.json', CIPI_SHA)
    payments = read_edition('brazil-infrastructure-procurement-payments.json', PAYMENT_SHA)
    model = read_edition('brazil-works-measurements.json', MODEL_SHA)['sources']['dataModel']
    projects = {row['agreement']: row for row in projects_edition['projects']}
    receipts = {name: receipt_tuple(cipi['sources']['archives'][name]) for name in (CONTRACTS, PROCUREMENT)}
    candidates = [
        {'agreement': row['agreement'], 'procurementId': row['procurementContract']['procurementId'],
         'contractId': row['procurementContract']['contractId'], 'contractSourceRow': row['procurementContract']['sourceRow'],
         'contractNumber': row['contractNumber'], 'signedOn': row['signedOn'], 'cohort': 'cipi'}
        for row in cipi['contracts']
    ] + [
        {**{key: row[key] for key in ('agreement', 'procurementId', 'contractId', 'contractSourceRow')}, 'cohort': 'payments'}
        for row in payments['contracts']
    ]
    owners = procurement_owners(projects, directory, receipts[PROCUREMENT])
    signatures, counts = contract_signatures(candidates, projects, owners, directory, receipts[CONTRACTS])
    authorization_source = capture_authorizations(directory)
    match_rows, lot_owners = match_lot_records(signatures, authorization_source, directory)
    lots = []
    contract_coverage = []
    for record in candidates:
        signature = signatures[contract_key(record)]
        match = match_rows[signature]
        status = qualification(signature, counts, match, authorization_source, lot_owners)
        if record['cohort'] == 'payments':
            contract_coverage.append({**record, 'linkStatus': status})
            continue
        agreement = record['agreement']
        identity = {'agreement': agreement, 'proposal': projects[agreement]['proposal'], 'project': projects[agreement]['project']}
        contract_coverage.append({**record, **identity, 'linkStatus': status})
        if status == 'linked':
            for row in match:
                lots.append({**identity, 'procurementId': record['procurementId'], 'contractId': record['contractId'],
                             'contractNumber': record['contractNumber'], 'signedOn': record['signedOn'], **row})
    lots.sort(key=lambda row: (row['agreement'], row['procurementId'], row['lotId']))
    subgoals = matched_subgoals(lots, directory)
    authorizations = matched_authorizations(lots, authorization_source)
    cipi_status = Counter(row['linkStatus'] for row in contract_coverage if row['cohort'] == 'cipi')
    payment_status = Counter(row['linkStatus'] for row in contract_coverage if row['cohort'] == 'payments')
    return {
        'format': 'charitology-br-infrastructure-work-lots-v1', 'capturedOn': CAPTURED_ON, 'currency': 'BRL',
        'sources': {
            'projectEditionSha256': PROJECT_SHA, 'cipiContractEditionSha256': CIPI_SHA,
            'paymentContractEditionSha256': PAYMENT_SHA, 'worksMeasurementEditionSha256': MODEL_SHA,
            'archives': {name: source_receipt(name, pin) for name, pin in {**receipts, **WORKS_ARCHIVES}.items()},
            'dataModel': model, 'license': cipi['sources']['license'],
        },
        'coverage': {
            'projectAgreements': len(projects), 'cipiContracts': len(cipi['contracts']), 'paymentContracts': len(payments['contracts']),
            'cipiContractLinkStatuses': dict(sorted(cipi_status.items())),
            'paymentContractLinkStatuses': dict(sorted(payment_status.items())),
            'agreementsWithLots': len({row['agreement'] for row in lots}), 'lots': len(lots),
            'lotsWithSubgoals': len({(row['worksInstrumentId'], row['lotId']) for row in subgoals}), 'subgoals': len(subgoals),
            'subgoalsWithTenderedAmount': sum(row['tenderedAmountCentsBRL'] is not None for row in subgoals),
            'authorizations': len(authorizations), 'issuedAuthorizations': sum(row['issuedOn'] is not None for row in authorizations),
        },
        'contractCoverage': contract_coverage, 'lots': lots, 'subgoals': subgoals, 'authorizations': authorizations,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--fetch', action='store_true', help='read the exact pinned archives from their official URLs')
    mode.add_argument('--inputs', type=Path, help='directory containing the exact pinned source ZIPs')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    edition = build(args.inputs)
    args.output.write_text(json.dumps(edition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(edition['coverage'], indent=2))
