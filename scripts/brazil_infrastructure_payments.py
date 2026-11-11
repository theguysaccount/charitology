"""Shared rules for the pinned infrastructure institutional payment rows."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from hashlib import sha256
import json
from pathlib import Path
import re

from brazil_transferegov_archives import ARCHIVE_BASE, cnpj, exact_cents, verified_rows

DATA = Path(__file__).resolve().parent.parent / 'src/data/funding-flows'
PROJECT_SHA = 'a6a9ebd38da473a623bbcab293ff0047bf61ab19eace9a26659b64b3bc05b0c7'
ACCOUNT_SHA = 'f7891b348388f83d9d588ae7b44c376f6f2d311bb53f3de17d42b264c98e9dc4'
CAPTURED_ON = '2026-11-11'
PAYMENT_ARCHIVE = 'siconv_pagamento'
INSTITUTIONAL_DOCUMENTS = frozenset(('NOTA FISCAL', 'RECIBO-CNPJ'))
MOVEMENT_TYPE = 'PAGAMENTO A FAVORECIDO COM OBTV'


@dataclass(frozen=True)
class Payment:
    agreement: str
    day: str
    issue_day: str | None
    supplier: str
    category: str
    cents: int


def qualified_id(token):
    return bool(re.fullmatch(r'[1-9][0-9]{0,19}', token or ''))


def issued_day(token):
    if token in ('', '-', 'NA'):
        return None
    day = date.fromisoformat(token).isoformat()
    if day != token or day > CAPTURED_ON:
        raise ValueError('Unexpected issue date in the selected payment records.')
    return day


def read_edition(name, expected):
    data = (DATA / name).read_bytes()
    if sha256(data).hexdigest() != expected:
        raise ValueError(f'{name}: unexpected upstream edition.')
    return json.loads(data)


def receipt_tuple(source):
    return source['bytes'], source['sha256'], source['dataRows']


def source_receipt(name, receipt):
    size, digest, count = receipt
    return {'url': f'{ARCHIVE_BASE}/{name}.zip', 'bytes': size, 'sha256': digest, 'dataRows': count}


def collect_payments(projects, accounts, directory, receipt):
    documents = defaultdict(list)
    unkeyed = Counter()
    counts = Counter()
    amounts = Counter()
    with verified_rows(PAYMENT_ARCHIVE, directory, receipt) as rows:
        for coordinate, row in rows():
            agreement = row['NR_CONVENIO']
            category = row['DESC_DL']
            if (agreement not in projects or category not in INSTITUTIONAL_DOCUMENTS
                    or row['TP_MOV_FINANCEIRA'] != MOVEMENT_TYPE):
                continue
            supplier = cnpj(row['IDENTIF_FORNECEDOR'])
            if not supplier:
                continue
            day = datetime.strptime(row['DATA_PAG'], '%d/%m/%Y').date().isoformat()
            amount = exact_cents(row['VL_PAGO'])
            if amount is None or day > CAPTURED_ON:
                raise ValueError(f'Unqualified institutional payment at source row {coordinate}.')
            key = agreement, int(day[:4])
            counts[key] += 1
            amounts[key] += amount
            document = row['ID_DL']
            if qualified_id(document):
                documents[document].append(Payment(agreement, day, issued_day(row['DATA_EMISSAO_DL']), supplier, category, amount))
            else:
                unkeyed[agreement] += 1
        # A document can have installments. Check every payment reference for the
        # selected IDs before considering any document complete in this capture.
        occurrences = Counter(row['ID_DL'] for _, row in rows() if row['ID_DL'] in documents)

    expected = {
        (row['agreement'], row['calendarYear']): (row['institutionalPayments']['rows'], row['institutionalPayments']['amountCentsBRL'])
        for row in accounts['periods'] if row['institutionalPayments']['rows']
    }
    if {key: (n, amounts[key]) for key, n in counts.items()} != expected:
        raise ValueError('The source rows do not reproduce the institutional account edition.')
    by_agreement = Counter()
    for (agreement, _), count in counts.items():
        by_agreement[agreement] += count
    return documents, occurrences, unkeyed, by_agreement


def exact_total(values):
    amount = sum(values)
    if amount > 2**53 - 1:
        raise ValueError('Total cannot be represented as exact browser cents.')
    return amount
