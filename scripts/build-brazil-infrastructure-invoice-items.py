#!/usr/bin/env python3
"""Rebuild the institutional invoice-item comparison for the pinned agreements."""

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path

from brazil_infrastructure_payments import (
    ACCOUNT_SHA, CAPTURED_ON, PAYMENT_ARCHIVE, PROJECT_SHA, collect_payments,
    exact_total, qualified_id, read_edition, receipt_tuple, source_receipt,
)
from brazil_transferegov_archives import exact_cents, verified_rows

ITEM_ARCHIVE = 'siconv_itens_dl'
ITEM_RECEIPT = (548_549_412, '61eb9f42b30e9501c97a92ff0519d30eed237eeb796f2af65afd8422fb260ab6', 10_079_834)
STATUS = ('equal', 'grossHigher', 'paymentHigher', 'paymentScopeUnresolved', 'noItems', 'itemIdentityUnresolved', 'unknownItemAmount')


def collect_items(documents, directory):
    matches = Counter()
    invalid_item_ids = set()
    by_document = defaultdict(dict)
    first_by_id = {}
    conflicts = set()
    with verified_rows(ITEM_ARCHIVE, directory, ITEM_RECEIPT) as rows:
        for _, row in rows():
            document = row['ID_DL']
            if document not in documents:
                continue
            matches[document] += 1
            item = row['ID_ITEM_DL']
            if not qualified_id(item):
                invalid_item_ids.add(document)
                continue
            first_by_id.setdefault(item, row)
            by_document[document].setdefault(item, row['VALOR_TOTAL_ITEM_DL'])
        # Duplicate rows are safe to collapse only when the entire parsed row
        # repeats exactly, including its document identifier and source text.
        for _, row in rows():
            item = row['ID_ITEM_DL']
            if item in first_by_id and row != first_by_id[item]:
                conflicts.add(item)
    return matches, by_document, invalid_item_ids, conflicts


def compare_document(payments, all_references, item_count, item_values, bad_identity):
    if len(payments) != all_references or len({(row.supplier, row.category, row.issue_day) for row in payments}) != 1:
        return 'paymentScopeUnresolved', None, None
    if item_count == 0:
        return 'noItems', None, None
    if bad_identity:
        return 'itemIdentityUnresolved', None, None
    try:
        item_cents = [exact_cents(value) for value in item_values]
    except ValueError:
        return 'unknownItemAmount', None, None
    if None in item_cents:
        return 'unknownItemAmount', None, None
    gross = exact_total(item_cents)
    paid = exact_total(row.cents for row in payments)
    status = 'equal' if gross == paid else 'grossHigher' if gross > paid else 'paymentHigher'
    return status, gross, paid


def add_document(bucket, status, payments, item_rows, unique_items, gross, paid):
    bucket['documents'] += 1
    bucket['paymentRows'] += len(payments)
    bucket['lineRows'] += item_rows
    bucket['statuses'][status] += 1
    if gross is not None:
        years = {int(row.day[:4]) for row in payments}
        bucket['comparablePaymentRows'] += len(payments)
        bucket['comparedUniqueItems'] += unique_items
        bucket['multiYearDocuments'] += len(years) > 1
        earliest = min(years)
        bucket['earliestIncludedPaymentYear'] = min(earliest, bucket['earliestIncludedPaymentYear'] or earliest)
        latest = max(years)
        bucket['latestIncludedPaymentYear'] = max(latest, bucket['latestIncludedPaymentYear'] or latest)
        bucket['grossItemCentsBRL'] = exact_total((bucket['grossItemCentsBRL'] or 0, gross))
        bucket['reportedPaymentCentsBRL'] = exact_total((bucket['reportedPaymentCentsBRL'] or 0, paid))


def build(directory):
    project_edition = read_edition('brazil-project-execution.json', PROJECT_SHA)
    accounts = read_edition('brazil-infrastructure-account-movements.json', ACCOUNT_SHA)
    projects = {project['agreement']: project for project in project_edition['projects']}
    receipt = receipt_tuple(accounts['sources']['archives'][PAYMENT_ARCHIVE])
    documents, occurrences, unkeyed, institutional_counts = collect_payments(projects, accounts, directory, receipt)
    item_rows, items, invalid_ids, conflicts = collect_items(documents, directory)
    periods = {}
    for document, payments in documents.items():
        agreements = {row.agreement for row in payments}
        if len(agreements) != 1:
            raise ValueError('A selected document spans more than one agreement.')
        agreement, = agreements
        issue_days = {row.issue_day for row in payments}
        issue_day = next(iter(issue_days)) if len(issue_days) == 1 else None
        year = int(issue_day[:4]) if issue_day else None
        project = projects[agreement]
        bucket = periods.setdefault((agreement, year), {
            'agreement': agreement, 'proposal': project['proposal'], 'project': project['project'],
            'issueYear': year, 'partialYear': year == int(CAPTURED_ON[:4]),
            'documents': 0, 'paymentRows': 0, 'lineRows': 0, 'comparedUniqueItems': 0,
            'comparablePaymentRows': 0, 'multiYearDocuments': 0, 'earliestIncludedPaymentYear': None, 'latestIncludedPaymentYear': None,
            'grossItemCentsBRL': None, 'reportedPaymentCentsBRL': None,
            'statuses': {name: 0 for name in STATUS},
        })
        values = items.get(document, {})
        bad_identity = document in invalid_ids or not conflicts.isdisjoint(values)
        status, gross, paid = compare_document(payments, occurrences[document], item_rows[document], values.values(), bad_identity)
        add_document(bucket, status, payments, item_rows[document], len(values), gross, paid)

    rows = [periods[key] for key in sorted(periods, key=lambda pair: (pair[0], pair[1] or 0))]
    states = {name: sum(row['statuses'][name] for row in rows) for name in STATUS}
    return {
        'format': 'charitology-brazil-infrastructure-invoice-items-v1',
        'capturedOn': CAPTURED_ON,
        'currency': 'BRL',
        'sources': {
            'projectEditionSha256': PROJECT_SHA,
            'accountEditionSha256': ACCOUNT_SHA,
            'archives': {name: source_receipt(name, pin) for name, pin in ((PAYMENT_ARCHIVE, receipt), (ITEM_ARCHIVE, ITEM_RECEIPT))},
            'dataModel': accounts['sources']['dataModel'],
            'license': accounts['sources']['license'],
        },
        'coverage': {
            'projectAgreements': len(projects),
            'agreementsWithInstitutionalPayments': len(institutional_counts),
            'institutionalPayments': sum(institutional_counts.values()),
            'paymentsWithoutDocumentId': sum(unkeyed.values()),
            'documents': len(documents),
            'repeatedPaymentDocuments': sum(len(group) > 1 for group in documents.values()),
            'lineRows': sum(item_rows.values()),
            'comparedUniqueItems': sum(row['comparedUniqueItems'] for row in rows),
            'comparablePaymentRows': sum(row['comparablePaymentRows'] for row in rows),
            'multiYearDocuments': sum(row['multiYearDocuments'] for row in rows),
            'statuses': states,
        },
        'paymentsWithoutDocumentIdByAgreement': dict(sorted(unkeyed.items())),
        'periods': rows,
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
