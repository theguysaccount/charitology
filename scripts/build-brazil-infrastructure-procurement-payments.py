#!/usr/bin/env python3
"""Follow published infrastructure expense documents to procurement and contracts."""

import argparse
from collections import Counter, defaultdict
from datetime import datetime
import json
from pathlib import Path

from brazil_infrastructure_payments import (
    ACCOUNT_SHA, CAPTURED_ON, PAYMENT_ARCHIVE, PROJECT_SHA, collect_payments,
    exact_total, qualified_id, read_edition, receipt_tuple, source_receipt,
)
from brazil_transferegov_archives import cnpj, verified_rows

INVOICE_SHA = '69feade787bc633991fe2f71b93846a3c28d671b8a869a4d4887d9af6c5897a0'
CONTRACT_EDITION_SHA = '850e1c79e330c554840ef8d5d6ce984147f30b805b8f600bee422d08569b241e'
HEADER = 'siconv_dl'
TENDER = 'siconv_licitacao'
CONTRACT = 'siconv_contrato'
HEADER_PIN = (216_458_339, 'fbf12c69a4a1fd3381834018fae6b12b2afda43fa7ad88075b0bea35e459d906', 7_710_768)
CONTRACT_STATES = ('verified', 'noReference', 'unresolved')


def capture_headers(documents, directory):
    headers = defaultdict(list)
    with verified_rows(HEADER, directory, HEADER_PIN) as rows:
        for coordinate, row in rows():
            if row['ID_DL'] in documents:
                headers[row['ID_DL']].append({
                    'row': coordinate, 'proposal': row['ID_PROPOSTA'],
                    'procurementId': row['ID_LICITACAO'], 'contractId': row['ID_CONTRATO'],
                    'issueDay': datetime.strptime(row['DATA_DE_EMISSAO'], '%d/%m/%Y').date().isoformat(),
                    'type': row['DESCRICAO'],
                })
    return headers


def capture_procurements(ids, directory, receipt):
    procurements = defaultdict(list)
    with verified_rows(TENDER, directory, receipt) as rows:
        for coordinate, row in rows():
            if row['ID_LICITACAO'] in ids:
                procurements[row['ID_LICITACAO']].append((row['NR_CONVENIO'], coordinate))
    return procurements


def capture_contracts(pairs, directory, receipt):
    contracts = defaultdict(list)
    with verified_rows(CONTRACT, directory, receipt) as rows:
        for coordinate, row in rows():
            pair = row['ID_LICITACAO'], row['ID_CONTRATO']
            if pair in pairs:
                contracts[pair].append((cnpj(row['ID_FORNECEDOR_CONTRATO']), coordinate))
    return contracts


def add_group(groups, key, identity, payments):
    group = groups.setdefault(key, {
        **identity, 'documents': 0, 'paymentRows': 0, 'reportedPaymentCentsBRL': 0,
        'firstPaymentYear': None, 'lastPaymentYear': None,
    })
    years = [int(payment.day[:4]) for payment in payments]
    first, last = min(years), max(years)
    group['firstPaymentYear'] = min(first, group['firstPaymentYear'] or first)
    group['lastPaymentYear'] = max(last, group['lastPaymentYear'] or last)
    group['documents'] += 1
    group['paymentRows'] += len(payments)
    group['reportedPaymentCentsBRL'] = exact_total((group['reportedPaymentCentsBRL'], *(row.cents for row in payments)))
    return group


def build(directory):
    project_edition = read_edition('brazil-project-execution.json', PROJECT_SHA)
    accounts = read_edition('brazil-infrastructure-account-movements.json', ACCOUNT_SHA)
    invoices = read_edition('brazil-infrastructure-invoice-items.json', INVOICE_SHA)
    cipi = read_edition('brazil-project-contracts.json', CONTRACT_EDITION_SHA)
    archive_receipts = {
        PAYMENT_ARCHIVE: receipt_tuple(accounts['sources']['archives'][PAYMENT_ARCHIVE]),
        HEADER: HEADER_PIN,
        TENDER: receipt_tuple(cipi['sources']['archives'][TENDER]),
        CONTRACT: receipt_tuple(cipi['sources']['archives'][CONTRACT]),
    }
    projects = {project['agreement']: project for project in project_edition['projects']}
    docs, occurrences, unkeyed, _ = collect_payments(projects, accounts, directory, archive_receipts[PAYMENT_ARCHIVE])
    if unkeyed or len(docs) != invoices['coverage']['documents']:
        raise ValueError('Document selection diverges from the pinned invoice edition.')
    headers = capture_headers(docs, directory)
    tender_ids = {header['procurementId'] for group in headers.values() for header in group
                  if qualified_id(header['procurementId'])}
    pairs = {(header['procurementId'], header['contractId']) for group in headers.values() for header in group
             if header['procurementId'] in tender_ids and qualified_id(header['contractId'])}
    tender_sources = capture_procurements(tender_ids, directory, archive_receipts[TENDER])
    contract_sources = capture_contracts(pairs, directory, archive_receipts[CONTRACT])
    cipi_pairs = {(row['agreement'], row['procurementContract']['procurementId'], row['procurementContract']['contractId'])
                  for row in cipi['contracts']}
    procurement_groups = {}
    contract_groups = {}
    counts = Counter()
    reasons = Counter()
    invoice_keys = defaultdict(Counter)

    for document, payments in docs.items():
        agreement = payments[0].agreement
        project = projects[agreement]
        candidates = headers[document]
        identities = {(row.agreement, row.supplier, row.category, row.issue_day) for row in payments}
        if len(candidates) != 1 or occurrences[document] != len(payments) or len(identities) != 1:
            raise ValueError('Document or payment scope is ambiguous in this pinned cohort.')
        header, = candidates
        _, supplier, category, issue_day = next(iter(identities))
        if header['proposal'] != project['proposal'] or header['issueDay'] != issue_day or header['type'] != category:
            raise ValueError(f'Document, project or issue date differs at source row {header["row"]}.')
        tender = header['procurementId']
        records = tender_sources[tender]
        if len(records) != 1 or records[0][0] != agreement:
            raise ValueError(f'Procurement identity is ambiguous at document source row {header["row"]}.')

        issue_key = (agreement, int(issue_day[:4]))
        invoice_keys[issue_key]['documents'] += 1
        invoice_keys[issue_key]['paymentRows'] += len(payments)
        invoice_keys[issue_key]['amount'] += exact_total(row.cents for row in payments)
        identity = {'agreement': agreement, 'proposal': project['proposal'], 'project': project['project'],
                    'procurementId': tender, 'procurementSourceRow': records[0][1]}
        group = add_group(procurement_groups, (agreement, tender), identity, payments)
        states = group.setdefault('contractStates', {name: 0 for name in CONTRACT_STATES})
        contract = header['contractId']
        if not qualified_id(contract):
            state = 'noReference'
        else:
            candidates = contract_sources[tender, contract]
            if len(candidates) == 1 and candidates[0][0] == supplier:
                state = 'verified'
                key = agreement, tender, contract
                add_group(contract_groups, key, {
                    **identity, 'contractId': contract, 'contractSourceRow': candidates[0][1],
                    'alsoInCipiContractEdition': key in cipi_pairs,
                }, payments)
            else:
                state = 'unresolved'
                reason = 'missingPair' if not candidates else 'repeatedPair' if len(candidates) != 1 else 'supplierDiffers'
                reasons[reason] += 1
        counts[state] += 1
        states[state] += 1

    expected = {(row['agreement'], row['issueYear']): {
        'documents': row['documents'], 'paymentRows': row['comparablePaymentRows'], 'amount': row['reportedPaymentCentsBRL'],
    } for row in invoices['periods']}
    if invoice_keys != expected:
        raise ValueError('The procurement scope does not reproduce the pinned invoice cohorts.')

    procurements = [procurement_groups[key] for key in sorted(procurement_groups)]
    contracts = [contract_groups[key] for key in sorted(contract_groups)]
    return {
        'format': 'charitology-brazil-infrastructure-procurement-payments-v1',
        'capturedOn': CAPTURED_ON, 'currency': 'BRL',
        'sources': {
            'projectEditionSha256': PROJECT_SHA, 'accountEditionSha256': ACCOUNT_SHA,
            'invoiceEditionSha256': INVOICE_SHA, 'cipiContractEditionSha256': CONTRACT_EDITION_SHA,
            'archives': {name: source_receipt(name, receipt) for name, receipt in archive_receipts.items()},
            'dataModel': accounts['sources']['dataModel'], 'license': accounts['sources']['license'],
        },
        'coverage': {
            'projectAgreements': len(projects), 'agreementsWithProcurements': len({r['agreement'] for r in procurements}),
            'procurements': len(procurements), 'documents': len(docs),
            'paymentRows': sum(r['paymentRows'] for r in procurements),
            'contractStates': {name: counts[name] for name in CONTRACT_STATES},
            'unresolvedContractReasons': {name: reasons[name] for name in ('missingPair', 'repeatedPair', 'supplierDiffers')},
            'verifiedContracts': len(contracts), 'agreementsWithVerifiedContracts': len({r['agreement'] for r in contracts}),
            'contractsAlsoInCipiEdition': sum(r['alsoInCipiContractEdition'] for r in contracts),
        },
        'procurements': procurements, 'contracts': contracts,
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
