"""Verify the Iberia edition against the exact public files, without saving raw records."""
import argparse
import csv
from datetime import date
from decimal import Decimal
from hashlib import sha256
import io
import json
from itertools import chain
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from zipfile import ZipFile

parser = argparse.ArgumentParser(description=__doc__)
mode = parser.add_mutually_exclusive_group(required=True)
mode.add_argument('--source-dir', type=Path, help='Directory of the captured source files')
mode.add_argument('--fetch', action='store_true', help='Verify if the source sites still serve the exact edition')
args = parser.parse_args()
edition = json.loads((Path(__file__).resolve().parents[1] / 'src/data/funding-flows/iberia-hrsa.json').read_text())
entity = edition['organization']

def open_source(source, filename=None):
    if args.fetch:
        return urlopen(Request(source['url'], headers={'Accept-Encoding': 'identity'}), timeout=40)
    return (args.source_dir / (filename or Path(urlsplit(source['url']).path).name)).open('rb')

class VerifiedRead(io.RawIOBase):
    def __init__(self, source, response):
        self.source = source
        self.response = response
        self.size = 0
        self.digest = sha256()

    def readable(self):
        return True

    def readinto(self, buffer):
        count = self.response.readinto(buffer)
        self.size += count
        if self.size > self.source['bytes']:
            raise ValueError(f"Unexpected source size for {self.source['url']}")
        self.digest.update(memoryview(buffer)[:count])
        return count

    def verify(self):
        if self.size != self.source['bytes'] or self.digest.hexdigest() != self.source['sha256']:
            raise ValueError(f"Source fingerprint differs from the captured edition: {self.source['url']}")

def select(source, predicate, project):
    with open_source(source) as response:
        reader = VerifiedRead(source, response)
        with io.TextIOWrapper(io.BufferedReader(reader), encoding='utf-8-sig', newline='') as stream:
            csv.field_size_limit(16 * 1024 * 1024)
            selected = []
            count = 0
            for count, record in enumerate(csv.DictReader(stream), 1):
                if predicate(record):
                    selected.append(project(record, count))
        reader.verify()
    assert (count, len(selected)) == (source['sourceRows'], source['selectedRows'])
    return selected

def bytes_for(source, filename=None):
    with open_source(source, filename) as response:
        reader = VerifiedRead(source, response)
        with io.BufferedReader(reader) as stream:
            result = stream.read(source['bytes'] + 1)
        reader.verify()
    return result

def day(value):
    return date.fromisoformat(value.replace('/', '-')).isoformat()

def cents(value):
    scaled = Decimal(value) * 100
    assert scaled.is_finite() and scaled == scaled.to_integral_value()
    return int(scaled)

def project_award(row, position):
    assert row['Unique Entity Identifier'] == entity['uei']
    assert row['Grantee State Abbreviation'] == entity['granteeState']
    return {
        'grantNumber': row['Grant Number'], 'federalIssueYear': int(row['Award Year']),
        'awardedCents': cents(row['Financial Assistance']),
        'projectPeriodStart': day(row['Project Period Start Date Text String']),
        'projectPeriodEnd': day(row['Grant Project Period End Date Text']),
        'agencyGranteeLabel': row['Grantee Name'], 'agencyProgramLabel': row['Grant Program Name'],
        'sourceRefreshedOn': day(row['Data Warehouse Record Create Date Text']),
        'sourceRecord': position,
    }

source = edition['agencySource']
awards = select(source, lambda row: row['Grant Number'] in edition['programLabels'], project_award)
awards.sort(key=lambda row: (row['grantNumber'], row['federalIssueYear']))
expected = [{key: value for key, value in row.items() if key != 'agencyMapObjectId'} for row in edition['agencyAwards']]
assert awards == expected
assert bytes_for(source['dictionary']).startswith(b'PK')
map_file = bytes_for(source['crossCheck'], 'hrsa-award-map.json')
map_data = json.loads(map_file, parse_float=Decimal)
assert not map_data.get('exceededTransferLimit')
rows = sorted((feature['attributes'] for feature in map_data['features']),
              key=lambda row: (row['GRANT_NUM'], int(row['AWARD_YR'])))
assert len(rows) == len(awards) == source['crossCheck']['matchedRows']
for row, award in zip(rows, edition['agencyAwards']):
    assert (row['GRANT_NUM'], int(row['AWARD_YR']), cents(row['FA']),
            day(row['GRANT_PROJ_PERIOD_START_DT_TXT']), day(row['GRANT_PROJ_PERIOD_END_DT_TXT']), row['OBJECTID']) == (
            award['grantNumber'], award['federalIssueYear'], award['awardedCents'],
            award['projectPeriodStart'], award['projectPeriodEnd'], award['agencyMapObjectId'])

general_fields = ('auditee_ein', 'auditee_uei', 'report_id', 'fy_start_date', 'fy_end_date',
                  'fac_accepted_date', 'resubmission_status', 'audit_period_covered',
                  'resubmission_version', 'total_amount_expended')
for audit in edition['audits']:
    source = audit['generalSource']
    [(position, record)] = select(source,
        lambda row: row['is_public'] == 't' and row['entity_type'] == 'non-profit'
        and (row['auditee_ein'] == entity['ein'] or row['auditee_uei'] == entity['uei']),
        lambda row, position: (position, {key: row[key] for key in general_fields}))
    assert position == source['record']
    assert (record['auditee_ein'], record['auditee_uei'], record['report_id']) == (entity['ein'], entity['uei'], audit['reportId'])
    assert (record['fy_start_date'], record['fy_end_date'], record['fac_accepted_date']) == (
        audit['fiscalPeriodStart'], audit['fiscalPeriodEnd'], audit['acceptedOn'])
    assert record['resubmission_status'] == 'most_recent' and record['audit_period_covered'] == 'annual'
    assert int(record['resubmission_version']) == audit['submissionVersion']
    assert cents(record['total_amount_expended']) == audit['reportedExpensesCents']
    assert bytes_for(audit['scheduleSource'], audit['reportId'] + '.pdf').startswith(b'%PDF-')

coverage = edition['parishCoverage']
for estimate in coverage['estimates']:
    source = estimate['source']
    with ZipFile(io.BytesIO(bytes_for(source))) as archive:
        with io.TextIOWrapper(archive.open(source['member']), encoding='utf-8-sig', newline='') as stream:
            for _ in range(source['preambleLines']):
                next(stream)
            header = next(stream)
            assert header.lstrip().lower().startswith('year,version,')
            records = csv.DictReader(chain([header], stream), skipinitialspace=True)
            records.fieldnames = [field.strip().lower() for field in records.fieldnames]
            [(position, row)] = [(n, row) for n, row in enumerate(records, 1)
                                 if all(row[key].strip() == value for key, value in coverage['selection'].items())]
    assert position == source['sourceRecord']
    assert row['county_name'].strip() == 'Iberia Parish'
    assert int(row['year']) == estimate['calendarYear'] and row['version'].strip() == estimate['sourceVersion']
    for field, column in {'population':'nipr', 'populationMargin':'nipr_moe',
                          'uninsured':'nui', 'uninsuredMargin':'nui_moe'}.items():
        assert estimate[field] == int(row[column])
    assert estimate['uninsuredPercent'] == row['pctui'].strip()
    assert estimate['uninsuredPercentMargin'] == row['pctui_moe'].strip()

print('Verified the HRSA source files, three FAC general CSVs, three original audit PDFs and three Census archives.')
