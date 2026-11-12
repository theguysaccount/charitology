"""Project two pinned OSCR files into searchable financial histories and a comparison."""
import csv
import gzip
import io
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile

DATE = '2026-11-12'
PUBLISHER = 'Office of the Scottish Charity Regulator'
CATALOGUE = 'https://www.oscr.org.uk/about-charities/search-the-register/download-the-scottish-charity-register/'
FIELDS = 'https://www.oscr.org.uk/media/uixby3ex/2023-03-22-description-of-charity-register-download-fields.pdf'
LICENSE = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'
ATTRIBUTION = ('© Crown Copyright and database right 2026. Contains information from the Scottish Charity Register '
               'supplied by the Office of the Scottish Charity Regulator and licensed under the Open Government Licence v.3.0.')
SOURCES = {
    'register': {
        'publisher': PUBLISHER, 'url': 'https://www.oscr.org.uk/download/charity-register',
        'member': 'CharityExport-12-Nov-2026.csv',
        'sha256': '3cd98e1d462ea52e9d3f414b5269b7addc3da911b3e90e62f39f46c72d5550b2',
    },
    'returns': {
        'publisher': PUBLISHER, 'url': 'https://www.oscr.org.uk/download/5-years-charity-register',
        'member': 'CharityExport-5Years-12-Nov-2026.csv',
        'sha256': 'fd0712d90956c95dd8162abfc1157e5f93f947c1656637075acc5e4a72379c48',
    },
}
INCOME = {
    'donationsAndLegaciesGBP': ' Donations and legacies income',
    'charitableActivitiesIncomeGBP': 'Charitable activities income',
    'otherTradingIncomeGBP': 'Other trading activities income',
    'investmentsIncomeGBP': 'Investments income',
    'otherIncomeGBP': 'Other income',
}
SPENDING = {
    'raisingFundsGBP': 'Raising funds spending',
    'charitableActivitiesSpendingGBP': 'Charitable activities spending',
    'otherSpendingGBP': 'Other spending',
}
CLASSES = {'Standard', 'Cross Border', 'Registered Social Landlord'}
STATUSES = {'Active', 'Not Submitted', 'Not Monitored'}
LOCATIONS = {
    'Aberdeen', 'Aberdeenshire', 'Angus', 'Argyll And Bute', 'City of Edinburgh',
    'Clackmannanshire', 'Dumfries And Galloway', 'Dundee City', 'East Ayrshire',
    'East Dunbartonshire', 'East Lothian', 'East Renfrewshire', 'Falkirk', 'Fife',
    'Glasgow City', 'Highland', 'Inverclyde', 'Midlothian', 'Moray', 'North Ayrshire',
    'North Lanarkshire', 'Orkney Islands', 'Perth And Kinross', 'Renfrewshire',
    'Scottish Borders', 'Shetland Islands', 'South Ayrshire', 'South Lanarkshire',
    'Stirling', 'West Dunbartonshire', 'West Lothian', 'Western Isles', 'Outwith Scotland',
}
SPREADS = {
    'A specific local point, community or neighbourhood', 'Wider, but within one local authority area',
    'More than one local authority area in Scotland', 'One or a few bases or facilities serving people who come from a broad area',
    'Operations cover all or most of Scotland', 'Scotland and other parts of the UK', 'UK and overseas', 'Overseas only',
}
PAIRS = [
    ('SC039570', '213890', 'Save the Children Fund', 'https://www.savethechildren.org.uk/about-us/charity-ratings'),
    ('SC037738', '220949', 'British Red Cross Society', 'https://www.redcross.org.uk/terms-and-conditions'),
    ('SC039042', '202918', 'Oxfam GB', 'https://www.oxfam.org.uk/documents/1077/Oxfam__GB_Annual_Report_2024-2025.pdf'),
]

def rows(inputs, label):
    source = SOURCES[label]
    path = inputs / f'scotland-{label}.zip'
    assert sha256(path.read_bytes()).hexdigest() == source['sha256'], f'Capture changed: {path.name}'
    with ZipFile(path) as archive, archive.open(source['member']) as raw:
        assert archive.namelist() == [source['member']]
        reader = csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''))
        for record, row in enumerate(reader, 1):
            assert None not in row and None not in row.values(), record
            yield record, row

def day(raw):
    assert re.fullmatch(r'[0-9]{2}/[0-9]{2}/[0-9]{4}', raw), raw
    dd, mm, yyyy = map(int, raw.split('/'))
    return date(yyyy, mm, dd).isoformat()

def amount(value):
    assert re.fullmatch(r'-?[0-9]{1,13}', value), 'Unexpected OSCR amount'
    return value

def name_bucket(name):
    normalized = unicodedata.normalize('NFKD', name).lower()
    initial = next((ch for ch in normalized if unicodedata.category(ch)[0] in 'LN'), '_')
    return initial if initial in 'abcdefghijklmnopqrstuvwxyz0123456789' else '_'

def read_register(inputs):
    identities = {}
    for record, row in rows(inputs, 'register'):
        number = row['Charity Number']
        name = row['Charity Name'].strip()
        status = row['Charity Status']
        kind = row['Regulatory Type']
        location = row['Main Operating Location'] or None
        spread = row['Geographical Spread'] or None
        assert re.fullmatch(r'SC[0-9]{6}', number) and number not in identities, record
        assert name and len(name) <= 250 and status in STATUSES and kind in CLASSES, record
        assert (location is None or location in LOCATIONS) and (spread is None or spread in SPREADS), record
        identities[number] = [number, name, status, kind, location, spread, record]
    return identities

def read_returns(inputs, identities):
    counts = Counter()
    candidates = defaultdict(lambda: defaultdict(list))
    numbers = set()
    before_end = []
    conflicts = []
    for record, row in rows(inputs, 'returns'):
        number = row['Charity Number']
        kind = row['Regulatory Type']
        assert number in identities and kind in CLASSES, record
        numbers.add(number)
        counts['input'] += 1
        received, end = row['Date annual return received'], row['Year End']
        if not received:
            counts['missingReceipt'] += 1
            if end:
                day(end)
                counts['missingReceiptWithYearEnd'] += 1
            continue
        received, end = day(received), day(end)
        if received < end:
            before_end.append([number, end, received, record])
            continue
        income = amount(row['Most recent year income'])
        expenditure = amount(row['Most recent year expenditure'])
        income_detail = [amount(row[field]) for field in INCOME.values()]
        spending_detail = [amount(row[field]) for field in SPENDING.values()]
        candidates[number][end].append([
            end, received, income, expenditure, record,
            income_detail if kind == 'Standard' and any(map(int, income_detail)) else None,
            spending_detail if kind == 'Standard' and any(map(int, spending_detail)) else None,
        ])

    assert numbers == set(identities)
    histories = {}
    for number, periods in candidates.items():
        history = []
        for end, versions in sorted(periods.items(), reverse=True):
            if len(versions) > 1:
                conflicts.append([number, end, [filing[4] for filing in versions]])
                counts['conflictingRows'] += len(versions)
                continue
            filing = versions[0]
            history.append(filing)
            counts['included'] += 1
            counts['withIncomeDetail'] += filing[5] is not None
            counts['withSpendingDetail'] += filing[6] is not None
        if history:
            histories[number] = history
    counts['receiptBeforeEnd'] = len(before_end)
    assert counts['input'] == sum(counts[key] for key in ('missingReceipt', 'receiptBeforeEnd', 'conflictingRows', 'included'))
    return histories, dict(counts), {'receiptBeforeEnd': before_end, 'conflictingYearEnds': sorted(conflicts)}

def read_ew_shard(root, assets, key):
    asset = assets[key]
    packed = (root / asset['path']).read_bytes()
    assert len(packed) == asset['bytes'] and sha256(packed).hexdigest() == asset['sha256']
    raw = gzip.decompress(packed)
    assert len(raw) == asset['decodedBytes'] and sha256(raw).hexdigest() == asset['decodedSha256']
    values = json.loads(raw)
    assert len(values) == asset['rows']
    return values

def comparison(ew_root, histories):
    manifest_bytes = (ew_root / 'manifest.json').read_bytes()
    ew = json.loads(manifest_bytes)
    assert ew['format'] == 'charitology-ew-returns-v1' and ew['currency'] == 'GBP'
    assert ew['periodFields'] == ['start', 'end', 'annualReturnReceived', 'grossIncomeGBP', 'grossExpenditureGBP', 'sourceRecord']
    pairs = []
    for sc_number, ew_number, label, proof in PAIRS:
        (bucket,) = [bucket for number, bucket in read_ew_shard(ew_root, ew['ids'], ew_number[:2]) if number == ew_number]
        (organization,) = [record for record in read_ew_shard(ew_root, ew['names'], bucket) if record[0] == ew_number]
        by_end = {row[0]: row for row in histories[sc_number] if row[0][:4] in ('2023', '2024', '2025')}
        periods = []
        for start, end, received, income, spending, record in sorted(organization[3], key=lambda p: p[1], reverse=True):
            if end not in by_end:
                continue
            _, sc_received, sc_income, sc_spending, sc_record, _, _ = by_end[end]
            periods.append({
                'end': end,
                'scotland': {'start': None, 'received': sc_received, 'incomeGBP': sc_income,
                             'expenditureGBP': sc_spending, 'sourceRecord': sc_record},
                'englandAndWales': {'start': start, 'received': received, 'incomeGBP': income,
                                    'expenditureGBP': spending, 'sourceRecord': record},
                'englandAndWalesMinusScotlandGBP': {
                    'income': int(income) - int(sc_income), 'expenditure': int(spending) - int(sc_spending),
                },
            })
        assert len(periods) == len(by_end) == len({period['end'] for period in periods}) == 3
        pairs.append({'name': label, 'identitySource': proof, 'scotlandNumber': sc_number,
                      'englandAndWalesNumber': ew_number, 'englandAndWalesOrganizationId': organization[2],
                      'periods': periods})
    return {
        'format': 'charitology-cross-register-returns-v1', 'currency': 'GBP',
        'matchingRule': 'Public confirmation of both registration numbers, then equal financial year end.',
        'scotland': {'date': DATE, 'sources': SOURCES, 'license': LICENSE, 'attribution': ATTRIBUTION},
        'englandAndWales': {'date': ew['date'], 'sources': ew['sources'], 'license': ew['license'],
                            'manifestSha256': sha256(manifest_bytes).hexdigest()},
        'pairs': pairs,
    }

def write_shard(output, path, rows):
    raw = (json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    packed = io.BytesIO()
    with gzip.GzipFile(filename='', fileobj=packed, mode='wb', mtime=0, compresslevel=9) as archive:
        archive.write(raw)
    body = packed.getvalue()
    (output / path).write_bytes(body)
    return {'path': path, 'rows': len(rows), 'bytes': len(body), 'decodedBytes': len(raw),
            'sha256': sha256(body).hexdigest(), 'decodedSha256': sha256(raw).hexdigest()}

def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf8')

def build(inputs, ew_root, output):
    identities = read_register(inputs)
    histories, counts, withheld = read_returns(inputs, identities)
    cross_register = comparison(ew_root, histories)
    names, ids = defaultdict(list), defaultdict(list)
    for number, identity in identities.items():
        bucket = name_bucket(identity[1])
        names[bucket].append([*identity, histories.get(number, [])])
        ids[number[:4]].append([number, bucket])

    output.mkdir(parents=True)
    (output / 'names').mkdir()
    (output / 'ids').mkdir()
    first = min(filing[0] for history in histories.values() for filing in history)
    last = max(filing[0] for history in histories.values() for filing in history)
    manifest = {
        'format': 'charitology-scotland-returns-v1', 'date': DATE, 'currency': 'GBP', 'jurisdiction': 'Scotland',
        'catalogue': CATALOGUE, 'fieldNotes': FIELDS, 'license': LICENSE, 'attribution': ATTRIBUTION,
        'identities': len(identities), 'withReturns': len(histories),
        'multiPeriod': sum(len(history) > 1 for history in histories.values()),
        'firstYearEnd': first, 'lastYearEnd': last, 'counts': counts, 'withheld': withheld,
        'organizationFields': ['number', 'name', 'status', 'regulatoryType', 'mainOperatingLocation', 'geographicalSpread', 'registryRecord', 'filings'],
        'periodFields': ['end', 'annualReturnReceived', 'grossIncomeGBP', 'grossExpenditureGBP', 'sourceRecord', 'incomeDetail', 'spendingDetail'],
        'incomeDetailFields': list(INCOME), 'spendingDetailFields': list(SPENDING),
        'sources': SOURCES,
        'names': {key: write_shard(output, f'names/{key}.json.gz', sorted(values, key=lambda row: (row[1].casefold(), row[0])))
                  for key, values in sorted(names.items())},
        'ids': {key: write_shard(output, f'ids/{key}.json.gz', sorted(values)) for key, values in sorted(ids.items())},
    }
    write_json(output / 'manifest.json', manifest)
    write_json(output / 'cross-register.json', cross_register)
    print(f"{manifest['identities']} registrations, {counts['included']} dated returns, {len(cross_register['pairs'])} paired registrations.")

if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: build-scotland-charity-financials.py <captures> <England and Wales edition> <new output directory>')
    build(*(Path(value) for value in sys.argv[1:]))
