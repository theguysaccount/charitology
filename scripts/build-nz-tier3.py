"""Build the New Zealand identity and Tier 3 returns edition from pinned OData."""
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


CAPTURED_AT = '2026-11-11T12:20:58.053383+00:00'
SOURCES = {'organisations': {'url': 'https://www.odata.charities.govt.nz/Organisations?%24format=json&%24select=OrganisationId%2CCharityRegistrationNumber%2CName%2CRegistrationStatus%2CGroupId%2CDateRegistered%2CDeregistrationDate&%24orderby=OrganisationId&%24returnall=true&%24inlinecount=allpages',
                   'bytes': 19333812,
                   'sha256': '692c576977310d94655e8ad3be908b0ccc843532b725af85f11c96c807444263',
                   'rows': 46189,
                   'fields': ['CharityRegistrationNumber',
                              'DateRegistered',
                              'DeregistrationDate',
                              'GroupId',
                              'Name',
                              'OrganisationId',
                              'RegistrationStatus']},
 'tier3-2024': {'url': 'https://www.odata.charities.govt.nz/AnnualReturn?%24format=json&%24select=AnnualReturnId%2COrganisationId%2CGroupId%2CReportingTierId%2CStatus%2CYearEnded%2CReportingCurrency%2CTotalGrossIncome%2CTotalExpenditure&%24orderby=AnnualReturnId&%24returnall=true&%24inlinecount=allpages&%24filter=ReportingTierId+eq+3+and+YearEnded+ge+datetime%272024-01-01T00%3A00%3A00%27+and+YearEnded+lt+datetime%272025-01-01T00%3A00%3A00%27',
                'bytes': 3908342,
                'sha256': 'e0723e59b85a2b19dd04301fba92fcc476905ef1756d5a4d38554a4690d23ee6',
                'rows': 9906,
                'fields': ['AnnualReturnId',
                           'GroupId',
                           'OrganisationId',
                           'ReportingCurrency',
                           'ReportingTierId',
                           'Status',
                           'TotalExpenditure',
                           'TotalGrossIncome',
                           'YearEnded']},
 'tier3-2025': {'url': 'https://www.odata.charities.govt.nz/AnnualReturn?%24format=json&%24select=AnnualReturnId%2COrganisationId%2CGroupId%2CReportingTierId%2CStatus%2CYearEnded%2CReportingCurrency%2CTotalGrossIncome%2CTotalExpenditure&%24orderby=AnnualReturnId&%24returnall=true&%24inlinecount=allpages&%24filter=ReportingTierId+eq+3+and+YearEnded+ge+datetime%272025-01-01T00%3A00%3A00%27+and+YearEnded+lt+datetime%272026-01-01T00%3A00%3A00%27',
                'bytes': 4083607,
                'sha256': '1c18ba172da594b21dab310fff569b73e23327352d453cfeec8369313e73b850',
                'rows': 10351,
                'fields': ['AnnualReturnId',
                           'GroupId',
                           'OrganisationId',
                           'ReportingCurrency',
                           'ReportingTierId',
                           'Status',
                           'TotalExpenditure',
                           'TotalGrossIncome',
                           'YearEnded']},
 'tiers': {'url': 'https://www.odata.charities.govt.nz/ReportingTier?%24format=json&%24select=ReportingTierId%2CName&%24orderby=ReportingTierId&%24returnall=true&%24inlinecount=allpages',
           'bytes': 1506,
           'sha256': 'dbd317929ae56af910a420f685c704836f6f25f47790e83042f6b4e5266d348c',
           'rows': 5,
           'fields': ['Name', 'ReportingTierId']},
 'currencies': {'url': 'https://www.odata.charities.govt.nz/ReportingCurrency?%24format=json&%24select=ReportingCurrencyId%2CName&%24orderby=ReportingCurrencyId&%24returnall=true&%24inlinecount=allpages',
                'bytes': 959,
                'sha256': '722092082b81693a8b8d41a27ef91cde101a88378dd72554a92a10443ae10a59',
                'rows': 4,
                'fields': ['Name', 'ReportingCurrencyId']}}

ROOT = 'https://www.odata.charities.govt.nz/'
REGISTER = 'https://register.charities.govt.nz/Charity/'
PUBLISHER = 'Charities Services, New Zealand Department of Internal Affairs'
LICENCE = 'https://creativecommons.org/licenses/by/3.0/nz/'
OPEN_DATA = 'https://www.charities.govt.nz/charities-in-new-zealand/the-charities-register/open-data'
CURRENT_STANDARD = 'https://standards.xrb.govt.nz/standards-navigator/tier-3-nfp-standard/'
PREVIOUS_STANDARD = 'https://www.xrb.govt.nz/dmsdocument/658/'
FIELDS = ['organisationId', 'registrationNumber', 'name', 'registrationStatus', 'registeredOn',
          'deregisteredOn', 'registryGroupId', 'returns']
RETURN_FIELDS = ['annualReturnId', 'periodEnd', 'sourceStatusCode', 'reportedCurrency', 'currency',
                 'currencyBasis', 'totalGrossIncome', 'totalExpenditure']
EXCLUSIONS = ('otherReturnStatus', 'groupReturn', 'noSelectedOrganisation', 'unresolvedCurrency', 'repeatedPeriod')


def records(inputs, name, field):
    source = SOURCES[name]
    body = (inputs / (name + '.json')).read_bytes()
    if sha256(body).hexdigest() != source['sha256'] or len(body) != source['bytes']:
        raise ValueError(f'Pinned OData snapshot changed: {name}')
    data = json.loads(body)['d']
    rows = data['results']
    if len(rows) != source['rows'] or int(data['__count']) != len(rows) or '__next' in data:
        raise ValueError(f'OData capture was incomplete: {name}')
    ids = [row[field] for row in rows]
    if ids != sorted(set(ids)) or not all(type(value) is int and value > 0 for value in ids):
        raise ValueError(f'OData source IDs changed shape: {name}')
    fields = set(source['fields']) | {'__metadata'}
    if any(set(row) != fields for row in rows):
        raise ValueError(f'OData fields changed: {name}')
    return rows


def date_label(value):
    if value is None:
        return None
    if not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T00:00:00Z', value):
        raise ValueError('Unexpected source date.')
    return date.fromisoformat(value[:10]).isoformat()


def label(value):
    return unicodedata.normalize('NFC', ''.join(' ' if unicodedata.category(ch) == 'Cc' else ch for ch in (value or '')).strip())


def write_gzip(output, rows):
    path = 'records.json.gz'
    raw = (json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    stream = io.BytesIO()
    with gzip.GzipFile(fileobj=stream, filename='', mode='wb', mtime=0, compresslevel=9) as compressed:
        compressed.write(raw)
    body = stream.getvalue()
    (output / path).write_bytes(body)
    return {'path': path, 'rows': len(rows), 'bytes': len(body), 'decodedBytes': len(raw),
            'sha256': sha256(body).hexdigest(), 'decodedSha256': sha256(raw).hexdigest()}


def build(inputs, output):
    tier = {row['ReportingTierId']: row['Name'] for row in records(inputs, 'tiers', 'ReportingTierId')}
    currencies = {row['Name'] for row in records(inputs, 'currencies', 'ReportingCurrencyId')}
    if tier.get(3) != 'Tier3' or currencies != {'NZD', 'AUD', 'USD', 'Other'}:
        raise ValueError('The source tier or currency mapping changed.')

    identity = {}
    registry_rows = records(inputs, 'organisations', 'OrganisationId')
    registry_status = Counter()
    skipped = Counter()
    registrations = Counter()
    for row in registry_rows:
        number = row['CharityRegistrationNumber'] or ''
        name = label(row['Name'])
        if not re.fullmatch(r'CC[0-9]{5}', number):
            skipped['unusableRegistrationNumber'] += 1
        elif not name:
            skipped['nameUnavailable'] += 1
        else:
            status = row['RegistrationStatus']
            if status not in (None, 'Registered', 'Deregistered', 'Removed'):
                raise ValueError('New registration status.')
            key = row['OrganisationId']
            identity[key] = [key, number, name, status, date_label(row['DateRegistered']),
                             date_label(row['DeregistrationDate']), row['GroupId']]
            registry_status[status or 'Unknown'] += 1
            registrations[number] += 1

    history = defaultdict(list)
    editions = {}
    for year in ('2024', '2025'):
        source_rows = records(inputs, 'tier3-' + year, 'AnnualReturnId')
        excluded = Counter()
        currencies_seen = Counter()
        returns = defaultdict(list)
        for row in source_rows:
            end = date_label(row['YearEnded'])
            if end is None or end[:4] != year or row['ReportingTierId'] != 3:
                raise ValueError(f'Tier or period drift in {year}.')
            filer = row['OrganisationId']
            currency = row['ReportingCurrency']
            if row['Status'] != 10:
                excluded['otherReturnStatus'] += 1
            elif row['GroupId'] is not None:
                excluded['groupReturn'] += 1
            elif filer not in identity:
                excluded['noSelectedOrganisation'] += 1
            elif currency is not None and currency not in ('NZD', 'AUD', 'USD'):
                excluded['unresolvedCurrency'] += 1
            else:
                amounts = (row['TotalGrossIncome'], row['TotalExpenditure'])
                if any(type(value) is not int or abs(value) >= 2**53 for value in amounts):
                    raise ValueError(f'Unexpected amount precision in {year}.')
                basis = 'reported' if currency else 'tier-3-standard'
                returns[(filer, end)].append([row['AnnualReturnId'], end, row['Status'], currency,
                                              currency or 'NZD', basis, *amounts])
        included = 0
        for (filer, _), candidates in returns.items():
            if len(candidates) != 1:
                excluded['repeatedPeriod'] += len(candidates)
                continue
            filing = candidates[0]
            history[filer].append(filing)
            currencies_seen[filing[5]] += 1
            included += 1
        if included + sum(excluded.values()) != len(source_rows):
            raise ValueError(f'Return coverage does not balance in {year}.')
        editions[year] = {'sourceReturns': len(source_rows), 'includedReturns': included,
                          'excluded': {field: excluded[field] for field in EXCLUSIONS},
                          'currencyBasis': dict(sorted(currencies_seen.items()))}
    rows = [[*value, sorted(history[key], key=lambda r: r[1], reverse=True)]
            for key, value in sorted(identity.items(), key=lambda item: (item[1][2].casefold(), item[0]))]
    output.mkdir(parents=True)
    manifest = {
        'format': 'charitology-nz-tier3-v1', 'capturedAt': CAPTURED_AT, 'publisher': PUBLISHER,
        'licence': LICENCE, 'openData': OPEN_DATA, 'register': REGISTER, 'odata': ROOT,
        'standards': {'current': CURRENT_STANDARD, 'previous': PREVIOUS_STANDARD},
        'tier': 3, 'selectedReturnStatus': 10, 'fields': FIELDS, 'returnFields': RETURN_FIELDS,
        'sources': SOURCES, 'editions': editions,
        'registry': {'sourceRows': len(registry_rows), 'included': len(rows),
                     'statuses': dict(sorted(registry_status.items())),
                     'excluded': {field: skipped[field] for field in ('unusableRegistrationNumber', 'nameUnavailable')},
                     'repeatedRegistrationNumbers': sorted(number for number, count in registrations.items() if count > 1),
                     'withFinancialHistory': sum(bool(row[7]) for row in rows),
                     'withBothYears': sum(len({r[1][:4] for r in row[7]}) == 2 for row in rows)},
        'asset': write_gzip(output, rows),
    }
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 scripts/build-nz-tier3.py <pinned-input-directory> <new-output-directory>')
    build(Path(sys.argv[1]), Path(sys.argv[2]))
