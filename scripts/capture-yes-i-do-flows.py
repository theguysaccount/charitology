"""Reproduce a bounded IATI case from six exact public publisher captures."""
import json
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import date
from decimal import Decimal
from hashlib import sha256
from pathlib import Path


INDEX_HASH = 'd8a8d282be2a585c330b36769feac1ad848d0db07b994001acde9ada8898969e'
SOURCES = {
    'ministry': ('Netherlands Ministry of Foreign Affairs', 'XM-DAC-7', 'XM-DAC-7-PPR-28431',
                 'minbuza_nl-activities20162017', '97783a0c63112219997677f3db06bd0b761553a17ebd3dc1912679e776222ac5'),
    'plan': ('Plan International Netherlands', 'NL-KVK-41198890', 'NL-KVK-41198890-YID',
             'plannlno-ao', '51759596f070834a04178dc99870e2ce575dd8b7bb895e8d0daf36bdf705b9b9'),
    'amref': ('Amref Flying Doctors Netherlands', 'NL-KVK-41150298', 'NL-KVK-41150298-4203',
              'amrefnl-activity', '0a266c998defb348b91d2f7605e89400930d5ae39d076f18bc548cca002b6cef'),
    'ethiopia': ('Amref Health Africa in Ethiopia', 'ET-MFA-0001989741', 'ET-MFA-0001989741-R177',
                 'amrefeth-et', '5fabb5d69fb03a02aeabe3bf6aba9eefd15a7f1d71a1dba84d5f4185a8310fce'),
    'kenya': ('Amref Health Africa in Kenya', 'KE-NCB-93175', 'KE-NCB-93175-C237',
              'amrefkenya-activity', 'c507f7b62c2414e88d9ee27f09bbc1de3a0d9cb15c8d257851f4cea3267eed65'),
    'malawi': ('Amref Health Africa in Malawi', 'MW-NBM-R1527', 'MW-NBM-R1527-W106',
               'amrefmw-activities', '098e33f8ae43f0a17ec970cc32d7883ec6f88eb09d17e2124af0251408c45212'),
}
ROUTES = (('ministry', 'plan'), ('plan', 'amref'), ('amref', 'ethiopia'), ('amref', 'kenya'), ('amref', 'malawi'))


def capture(path, expected):
    raw = path.read_bytes()
    if sha256(raw).hexdigest() != expected:
        raise ValueError(f'Expected the exact public capture: {path.name}')
    return raw


def transaction(row, activity, position):
    value = row.find('value')
    currency = value.get('currency', activity.get('default-currency'))
    amount = Decimal(value.text.strip())
    day = date.fromisoformat(row.find('transaction-date').get('iso-date')).isoformat()
    assert currency == 'EUR' and amount.is_finite() and amount == amount.quantize(Decimal('0.01'))
    return {
        'position': position, 'ref': row.get('ref') or None,
        'date': day, 'valueDate': date.fromisoformat(value.get('value-date')).isoformat(),
        'amount': str(amount), 'currency': currency,
    }


def rows(activities, sender, recipient):
    origin, target = activities[sender], activities[recipient]
    provider_org, provider_activity = SOURCES[sender][1:3]
    receiver_org, receiver_activity = SOURCES[recipient][1:3]
    if sender == 'ministry':
        assert any(org.get('ref', '').casefold() == receiver_org.casefold() for org in origin.findall('participating-org'))
    outgoing, incoming = [], []
    for index, row in enumerate(origin.findall('transaction'), 1):
        if row.find('transaction-type').get('code') != '3':
            continue
        receiver = row.find('receiver-org')
        if receiver is None:
            continue
        if sender == 'ministry':
            # The ministry identifies Plan at activity level. These rows carry no recipient identifier.
            assert not receiver.get('ref') and not receiver.get('receiver-activity-id')
        elif receiver.get('ref') != receiver_org:
            continue
        elif sender == 'amref':
            assert receiver.get('receiver-activity-id') == receiver_activity
        outgoing.append(transaction(row, origin, index))
    for index, row in enumerate(target.findall('transaction'), 1):
        if row.find('transaction-type').get('code') != '1':
            continue
        provider = row.find('provider-org')
        if provider is None or (provider.get('ref'), provider.get('provider-activity-id')) != (provider_org, provider_activity):
            continue
        incoming.append(transaction(row, target, index))
    return outgoing, incoming


def match_rows(outgoing, incoming):
    pairs = []
    remaining_out = {row['position']: row for row in outgoing}
    remaining_in = {row['position']: row for row in incoming}
    for days, category in ((0, 'same-date-and-amount'), (45, 'same-amount-different-date')):
        edges = []
        for oi, sent in remaining_out.items():
            for ii, received in remaining_in.items():
                delta = (date.fromisoformat(received['date']) - date.fromisoformat(sent['date'])).days
                if abs(delta) <= days and sent['currency'] == received['currency'] and Decimal(sent['amount']) == Decimal(received['amount']):
                    edges.append((oi, ii, delta))
        out_degree = Counter(pair[0] for pair in edges)
        in_degree = Counter(pair[1] for pair in edges)
        for oi, ii, delta in edges:
            if out_degree[oi] == in_degree[ii] == 1:
                pairs.append({'outgoing': oi, 'incoming': ii, 'daysApart': delta, 'category': category})
                del remaining_out[oi], remaining_in[ii]
    return {
        'pairs': sorted(pairs, key=lambda row: row['outgoing']),
        'unmatchedOutgoing': sorted(remaining_out),
        'unmatchedIncoming': sorted(remaining_in),
    }


def build(directory):
    index = json.loads(capture(directory / 'datasets-full.json', INDEX_HASH))
    metadata = {row['short_name']: row for row in index['datasets']}
    sources, activities = {}, {}
    for key, (name, org, aid, dataset, hash_value) in SOURCES.items():
        root = ET.fromstring(capture(directory / f'{key}-publisher.xml', hash_value))
        activity, = [item for item in root.iter('iati-activity') if item.findtext('iati-identifier') == aid]
        assert activity.find('reporting-org').get('ref') == org
        activities[key] = activity
        sources[key] = {
            'publisher': name, 'organizationId': org, 'activityId': aid, 'dataset': dataset,
            'sourceUrl': metadata[dataset]['source_url'], 'licenseCode': metadata[dataset]['licence_id'],
            'sha256': hash_value, 'transactionsInActivity': len(activity.findall('transaction')),
        }

    routes = []
    for sender, recipient in ROUTES:
        outgoing, incoming = rows(activities, sender, recipient)
        routes.append({'from': sender, 'to': recipient, 'outgoing': outgoing, 'incoming': incoming,
                       **match_rows(outgoing, incoming)})
    return {
        'schema': 'charitology-iati-transfer-trace-v1', 'capturedOn': '2026-11-10', 'currency': 'EUR',
        'metadataIndex': {'url': 'https://bulk-data.iatistandard.org/datasets-full', 'sha256': INDEX_HASH,
                          'created': index['index_created']},
        'sources': sources, 'candidateDateWindowDays': 45, 'routes': routes,
    }


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 scripts/capture-yes-i-do-flows.py <input-directory> <output.json>')
    output = Path(sys.argv[2])
    output.write_text(json.dumps(build(Path(sys.argv[1])), indent=2) + '\n', encoding='utf8')
