"""Reproduce the Cisternas case's financial and census fields from pinned source files."""
from argparse import ArgumentParser
from collections import Counter, defaultdict
from csv import field_size_limit, reader
from datetime import datetime
from decimal import Decimal
from hashlib import sha256
from io import TextIOWrapper
from pathlib import Path
from zipfile import ZipFile
import json
import re

CASE = Path(__file__).resolve().parents[1] / 'src/data/funding-flows/brazil-cisterns.json'
INTERNAL = 'OBTV PARA O CONVENENTE'
PAYMENT = 'PAGAMENTO A FAVORECIDO COM OBTV'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify_file(path, source):
    digest = sha256()
    with path.open('rb') as raw:
        for block in iter(lambda: raw.read(1_048_576), b''):
            digest.update(block)
    require(path.stat().st_size == source['bytes'] and digest.hexdigest() == source['sha256'],
            f'{path.name} does not match the pinned source edition')


def rows(folder, source, columns=None):
    path = folder / source['file']
    columns = columns or source['fields']
    with ZipFile(path) as archive, archive.open(path.stem + '.csv') as raw:
        records = reader(TextIOWrapper(raw, encoding='utf-8-sig', errors='surrogateescape', newline=''), delimiter=';')
        header = next(records)
        require(len(header) == len(set(header)), f'Duplicate columns in {path.name}')
        indexes = [header.index(column) for column in columns]
        for coordinate, row in enumerate(records, 1):
            yield coordinate, tuple(row[index] for index in indexes)


def one_matching(folder, source, expected):
    found = [(record, values) for record, values in rows(folder, source) if values[0] == expected]
    require(len(found) == 1, f'Expected one selected record in {source["file"]}')
    return found[0]


def amount(value):
    if value.strip() in ('', '-', 'NA'):
        return None
    result = Decimal(value.replace(',', '.')) * 100
    require(result.is_finite() and result == result.to_integral_value() and result >= 0,
            'Unexpected value in a selected financial record')
    return int(result)


def iso_date(value):
    return datetime.strptime(value, '%d/%m/%Y').date().isoformat()


def verify_agreement(data, folder, archives):
    agreement = data['agreement']
    coord, (_, proposal, signed, date, original, current, available) = one_matching(folder, archives['convenio'], agreement['id'])
    require(signed == 'SIM' and (
        coord, proposal, iso_date(date), amount(original), amount(current), amount(available)
    ) == tuple(agreement[key] for key in (
        'sourceRecord', 'proposalId', 'signedOn', 'originalAgreementTotalCents',
        'currentFederalContributionCents', 'reportedMadeAvailableCents'
    )), 'Agreement fields differ')
    coord, (_, proposal_number, cnpj, legal_nature) = one_matching(folder, archives['proposta'], agreement['proposalId'])
    require(legal_nature == 'Organização da Sociedade Civil' and
            (coord, proposal_number, cnpj) == (agreement['proposalSourceRecord'], agreement['proposalNumber'], agreement['cnpj']),
            'Proposal fields differ')

    amendment = data['amendment']
    matches = []
    for record, (ident, amendment_id, kind, value, date) in rows(folder, archives['termo_aditivo']):
        if ident == agreement['id'] and kind == 'Acréscimo':
            matches.append((record, amendment_id, amount(value), iso_date(date)))
    require(matches == [tuple(amendment[key] for key in ('sourceRecord', 'id', 'federalIncreaseCents', 'csvSignedOn'))],
            'Amendment fields differ')

    orders = [{'date': iso_date(date), 'madeAvailableCents': amount(value), 'orderId': order_id, 'sourceRecord': record}
              for record, (ident, order_id, date, value) in rows(folder, archives['desembolso']) if ident == agreement['id']]
    require(len({row['orderId'] for row in orders}) == len(orders), 'Repeated selected bank order')
    require(sorted(orders, key=lambda order: (order['date'], order['sourceRecord'])) == data['bankOrders'],
            'Bank-order projection differs')


def measure(values):
    require(all(value is not None for value in values), 'Missing amount in an account payment')
    return {'rows': len(values), 'amountCents': sum(values), 'zeroAmountRows': values.count(0)}


def check_account_payments(data, folder, archives):
    agreement = data['agreement']['id']
    institution_ids = {institution['cnpj'] for institution in data['institutions']}
    keys = set()
    periods = defaultdict(lambda: {'other': [], 'internal': [], 'institutional': defaultdict(list)})
    internal = {}
    payment_file = archives['pagamento']
    for _, (agreement_id, movement, kind, date, category, value, payee) in rows(folder, payment_file):
        if agreement_id != agreement:
            continue
        require(movement and movement not in keys, 'Selected account movement is missing a unique ID')
        require(kind == PAYMENT and category != 'OBTV PARA EXECUTOR', 'Unexpected selected payment category')
        keys.add(movement)
        year = int(iso_date(date)[:4])
        cents = amount(value)
        if category == INTERNAL:
            internal[movement] = (year, cents)
            periods[year]['internal'].append(cents)
        else:
            periods[year]['other'].append(cents)
            # Read identifiers for exact institution matches only. Never retain the other payee fields.
            candidate = payee.strip()
            if re.fullmatch(r'[0-9./-]+', candidate):
                cnpj = re.sub(r'[^0-9]', '', candidate)
                if cnpj in institution_ids:
                    periods[year]['institutional'][cnpj].append(cents)

    frequencies = Counter(movement for _, (movement,) in rows(folder, payment_file, ['NR_MOV_FIN']) if movement in internal)
    require(frequencies == Counter(dict.fromkeys(internal, 1)), 'An internal ID has more than one parent')
    onward = defaultdict(list)
    for _, (movement, value) in rows(folder, archives['obtv_convenente'], ['NR_MOV_FIN', 'VL_PAGO_OBTV_CONV']):
        if movement in internal:
            onward[movement].append(amount(value))
    coverage = defaultdict(Counter)
    for movement, (year, parent_amount) in internal.items():
        values = onward[movement]
        coverage[year].update({
            'matchedInternalIds': bool(values),
            'rows': len(values),
            'internalIdsMissingAnyAmount': None in values,
            'internalIdsWithEqualAmount': bool(values) and None not in values and sum(values) == parent_amount,
        })

    projected = []
    for year, period in sorted(periods.items()):
        projected.append({
            'calendarYear': year,
            'partialCalendarYear': str(year) == data['edition'][:4],
            'otherPayments': measure(period['other']),
            'internalTransfers': measure(period['internal']),
            'onward': {key: coverage[year][key] for key in ('matchedInternalIds', 'rows',
                       'internalIdsMissingAnyAmount', 'internalIdsWithEqualAmount')},
            'institutionalPayees': {cnpj: measure(values) for cnpj, values in period['institutional'].items()},
        })
    require(projected == data['accountYears'], 'Account payment or institutional payee projection differs')


def verify_census(data, folder):
    for series in data['census']:
        source = data['sources']['sidra']['tables'][series['table']]
        path = folder / source['file']
        verify_file(path, source)
        _, *records = json.loads(path.read_bytes())
        require(len(records) == source['sourceRows'], 'Census record count differs')
        for row in series['rows']:
            category = source['categoryColumn']
            selection = source['coordinates']
            values = {}
            for record in records:
                if (record['D1C'] != row['municipalityCode'] or record['D3C'] != str(series['calendarYear']) or
                        any(record[key] != value for key, value in selection.items() if key != 'D2C')):
                    continue
                key = record['D2C'], record[category]
                require(key not in values, 'Repeated selected census coordinate')
                values[key] = record['V']
            total = int(values[selection['D2C'], source['totalCategory']])
            affected = int(values[selection['D2C'], source['affectedCategory']])
            percent = str((Decimal(100) * affected / total).quantize(Decimal('0.01')))
            if source['rateVariable']:
                require(percent == values[source['rateVariable'], source['affectedCategory']], 'Published census share differs')
            require((total, affected, percent) == (row['residents'], row['residentsWithMeasure'], row['percent']),
                    'Census population, measure or percentage differs')


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('captures', type=Path, help='directory with the exact ZIP and JSON captures listed in the case data')
    folder = parser.parse_args().captures
    field_size_limit(1_000_000)
    data = json.loads(CASE.read_bytes())
    archives = data['sources']['transferegov']['archives']
    for source in archives.values():
        verify_file(folder / source['file'], source)
    verify_agreement(data, folder, archives)
    check_account_payments(data, folder, archives)
    verify_census(data, folder)
    print('Cisternas: exact source bytes reproduce the proposal, agreement, amendment, bank orders, payment aggregates and census rows.')


if __name__ == '__main__':
    main()
