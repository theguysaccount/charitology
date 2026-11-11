#!/usr/bin/env python3
"""Rebuild the agreement-year account movement comparison from the pinned official archives."""

import argparse
from collections import Counter, defaultdict
from datetime import datetime
from decimal import Decimal
from hashlib import sha256
import json
from pathlib import Path
import re

from brazil_transferegov_archives import ARCHIVE_BASE, verified_rows

DATA = Path(__file__).resolve().parent.parent / 'src/data/funding-flows'
PROJECT_HASH = 'a6a9ebd38da473a623bbcab293ff0047bf61ab19eace9a26659b64b3bc05b0c7'
CAPTURED_ON = '2026-11-11'
BANK_ORDER_YEARS = (2024, 2025)
ARCHIVES = {
    'siconv_pagamento': (374_662_483, '36920c43e8efb80f9a1f9a7f0c55620f0dff2210bce012ac613fbbef77338c62', 7_575_512),
    'siconv_obtv_convenente': (58_726_469, '5312063de10c902ea02f9a50fd2980c2c4a0466fe937bf9929a57d751fbe7d88', 3_113_841),
}
MODEL = {
    'url': 'https://www.gov.br/transferegov/pt-br/ferramentas-gestao/paineis-gerenciais/arquivos/modelo-dados-csvs-discricionarias-e-legais.zip/@@display-file/file',
    'sha256': '558e962ec1854f001ad6a54ae406b6436847d02101233a96e5bff4427c0b7716',
    'member': 'modelo_dados_siconv.zip!/modelo_dados_sincov/bd_portal.public.xml',
}
PAYMENT_KIND = 'PAGAMENTO A FAVORECIDO COM OBTV'
TO_HOLDER = 'OBTV PARA O CONVENENTE'
INVOICE_CATEGORIES = frozenset(('NOTA FISCAL', 'RECIBO-CNPJ'))
OTHER_CATEGORIES = frozenset(('DIÁRIAS', 'FOLHA DE PAGAMENTO', 'RECIBO DE PAGAMENTO A AUTONOMO'))
ONWARD_STATES = ('equalAmountParents', 'unknownAmountParents', 'differentAmountParents', 'noOnwardRecordParents')


def cnpj(value):
    if not re.fullmatch(r'[0-9./-]+', value):
        return None
    digits = re.sub(r'[^0-9]', '', value)
    if len(digits) != 14 or len(set(digits)) == 1:
        return None
    for offset, weights in (
        (12, (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)),
        (13, (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)),
    ):
        remainder = sum(int(digit) * weight for digit, weight in zip(digits, weights)) % 11
        if int(digits[offset]) != (0 if remainder < 2 else 11 - remainder):
            return None
    return digits


def exact_cents(value):
    if value in ('', '-', 'NA'):
        return None
    if not re.fullmatch(r'[0-9]+(?:,[0-9]{1,2}0*)?', value):
        raise ValueError('Unexpected BRL token in the selected source rows.')
    amount = Decimal(value.replace(',', '.')) * 100
    if amount != amount.to_integral_value() or amount > 2**53 - 1:
        raise ValueError('Amount cannot be represented as exact browser cents.')
    return int(amount)


def exact_sum(values):
    result = sum(values)
    if result > 2**53 - 1:
        raise ValueError('Aggregate cannot be represented as exact browser cents.')
    return result


def scan_payments(projects, directory):
    periods = defaultdict(Counter)
    movements = set()
    to_holder = {}
    category_totals = defaultdict(Counter)
    dates = set()
    with verified_rows('siconv_pagamento', directory, ARCHIVES['siconv_pagamento']) as rows:
        for index, record in rows():
            agreement = record['NR_CONVENIO']
            if agreement not in projects:
                continue
            movement = record['NR_MOV_FIN']
            if not re.fullmatch(r'[0-9]{1,20}', movement) or (agreement, movement) in movements:
                raise ValueError(f'Invalid or repeated movement key at source row {index}.')
            movements.add((agreement, movement))
            category = record['DESC_DL']
            if record['TP_MOV_FINANCEIRA'] != PAYMENT_KIND or category not in INVOICE_CATEGORIES | OTHER_CATEGORIES | {TO_HOLDER}:
                raise ValueError(f'Unqualified movement label at source row {index}.')
            day = datetime.strptime(record['DATA_PAG'], '%d/%m/%Y').date()
            amount = exact_cents(record['VL_PAGO'])
            if day.isoformat() > CAPTURED_ON or amount is None:
                raise ValueError(f'Unqualified date or missing amount at source row {index}.')
            dates.add(day)
            period = periods[agreement, day.year]
            total = category_totals[category]
            total['rows'] += 1
            total['zeroAmountRows'] += amount == 0
            period['movementRows'] += 1
            if category == TO_HOLDER:
                if movement in to_holder:
                    raise ValueError(f'Repeated transfer key at source row {index}.')
                to_holder[movement] = (agreement, day.year, amount)
                period['holderRows'] += 1
                holder = cnpj(record['IDENTIF_FORNECEDOR'])
                if holder and holder == projects[agreement]['cnpj']:
                    period['holderAmountRows'] += 1
                    period['holderAmountCents'] += amount
                    total['publishedAmountRows'] += 1
                continue
            if category in INVOICE_CATEGORIES and cnpj(record['IDENTIF_FORNECEDOR']):
                period['institutionalRows'] += 1
                period['institutionalAmountCents'] += amount
                total['publishedAmountRows'] += 1
            else:
                period['withheldNonHolderRows'] += 1
        # The onward file carries only the movement ID. Check that a selected
        # parent occurs once in the whole payment archive, across agreements.
        global_counts = Counter(record['NR_MOV_FIN'] for _, record in rows() if record['NR_MOV_FIN'] in to_holder)
        if global_counts != Counter(dict.fromkeys(to_holder, 1)):
            raise ValueError('An onward movement ID has more than one parent in the full archive.')
    return periods, to_holder, category_totals, dates


def reconcile_onward(periods, to_holder, directory):
    onward = defaultdict(list)
    with verified_rows('siconv_obtv_convenente', directory, ARCHIVES['siconv_obtv_convenente']) as rows:
        for _, record in rows():
            movement = record['NR_MOV_FIN']
            if movement in to_holder:
                onward[movement].append(exact_cents(record['VL_PAGO_OBTV_CONV']))
    for movement, (agreement, year, parent_amount) in to_holder.items():
        values = onward[movement]
        if not values:
            state = 'noOnwardRecordParents'
        elif None in values:
            state = 'unknownAmountParents'
        elif exact_sum(values) == parent_amount:
            state = 'equalAmountParents'
        else:
            state = 'differentAmountParents'
        periods[agreement, year][state] += 1
        periods[agreement, year]['onwardRows'] += len(values)


def published_amount(count, amount):
    return exact_sum([amount]) if count else None


def build(directory):
    project_bytes = (DATA / 'brazil-project-execution.json').read_bytes()
    if sha256(project_bytes).hexdigest() != PROJECT_HASH:
        raise ValueError('Unexpected prior infrastructure edition.')
    projects = {row['agreement']: row for row in json.loads(project_bytes)['projects']}
    periods, to_holder, category_totals, dates = scan_payments(projects, directory)
    reconcile_onward(periods, to_holder, directory)
    rows = []
    for (agreement, year), totals in sorted(periods.items()):
        project = projects[agreement]
        orders = [row for row in project['bankOrders'] if int(row[1][:4]) == year]
        onward = {key: totals[key] for key in ONWARD_STATES}
        if sum(onward.values()) != totals['holderRows']:
            raise ValueError('Onward states fail to partition the holder-transfer cohort.')
        rows.append({
            'agreement': agreement,
            'proposal': project['proposal'],
            'project': project['project'],
            'calendarYear': year,
            'partialYear': str(year) == CAPTURED_ON[:4],
            'movementRows': totals['movementRows'],
            'institutionalPayments': {
                'rows': totals['institutionalRows'],
                'amountCentsBRL': published_amount(totals['institutionalRows'], totals['institutionalAmountCents']),
            },
            'otherNonHolderRowsWithoutAmounts': totals['withheldNonHolderRows'],
            'holderTransfers': {
                'rows': totals['holderRows'],
                'holderIdMatchedRows': totals['holderAmountRows'],
                'amountCentsBRL': published_amount(totals['holderAmountRows'], totals['holderAmountCents']),
            },
            'onward': {'rows': totals['onwardRows'], **onward},
            'sameYearBankOrders': {
                'rows': len(orders), 'amountCentsBRL': published_amount(len(orders), exact_sum(row[2] for row in orders)),
            } if year in BANK_ORDER_YEARS else None,
        })

    return {
        'format': 'charitology-br-infrastructure-account-movements-v1',
        'capturedOn': CAPTURED_ON,
        'currency': 'BRL',
        'sources': {
            'projectEditionSha256': PROJECT_HASH,
            'archives': {name: {'url': f'{ARCHIVE_BASE}/{name}.zip', 'bytes': size,
                                'sha256': digest, 'dataRows': count}
                         for name, (size, digest, count) in ARCHIVES.items()},
            'dataModel': MODEL,
            'license': 'https://opendatacommons.org/licenses/odbl/1-0/',
        },
        'bankOrderYears': BANK_ORDER_YEARS,
        'coverage': {
            'projectAgreements': len(projects),
            'agreementsWithMovements': len({r['agreement'] for r in rows}),
            'agreementYears': len(rows),
            'firstMovementDate': min(dates).isoformat(),
            'lastMovementDate': max(dates).isoformat(),
            'movementRows': sum(r['movementRows'] for r in rows),
            'zeroAmountRows': sum(totals['zeroAmountRows'] for totals in category_totals.values()),
            'institutionalPaymentRows': sum(r['institutionalPayments']['rows'] for r in rows),
            'otherNonHolderRowsWithoutAmounts': sum(r['otherNonHolderRowsWithoutAmounts'] for r in rows),
            'holderTransferRows': len(to_holder),
            'holderIdMatchedRows': sum(r['holderTransfers']['holderIdMatchedRows'] for r in rows),
            'onwardRows': sum(r['onward']['rows'] for r in rows),
            'onwardParentStates': {key: sum(r['onward'][key] for r in rows) for key in ONWARD_STATES},
            'categories': [
                {'sourceLabel': key, 'rows': value['rows'], 'publishedAmountRows': value['publishedAmountRows']}
                for key, value in sorted(category_totals.items())
            ],
        },
        'periods': rows,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--fetch', action='store_true', help='read the two exact archive captures from their official URLs')
    mode.add_argument('--inputs', type=Path, help='directory with the exact two source ZIPs')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    text = json.dumps(build(args.inputs), ensure_ascii=False, indent=2) + '\n'
    reference = DATA / 'brazil-infrastructure-account-movements.json'
    if reference.exists() and text != reference.read_text(encoding='utf-8'):
        parser.error('Source replay differs from the pinned account movement edition.')
    args.output.write_text(text, encoding='utf-8')
    print(json.dumps(json.loads(text)['coverage'], ensure_ascii=False, indent=2))
