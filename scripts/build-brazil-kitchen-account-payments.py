"""Build agreement-account aggregates from pinned Transferegov archives."""
import argparse
import csv
import io
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile


DOWNLOADS = 'https://api-publica.transferegov.gestao.gov.br/downloads/dadosgov/'
ARCHIVES = {
    'pagamento': '3dd3211bb16116972e8ad84fc7c0da3e317120db09e11bedbd7299a723621965',
    'obtv_convenente': '91468433dab7b4964eae465667809ccadbce007009b5b434b9c9aba9ae3555f2',
    'ingresso_contrapartida': 'b75be816a4780c93b7c9bec326216629716640af0ce5e6f9b287956456a7c626',
    'pagamento_tributo': '730f2ff653bcac1bfa805f4b8e465f16b30e1702d052a27d08801edd6d388ec1',
}
CASE_PATH = Path(__file__).resolve().parents[1] / 'src/data/brazil-solidarity-kitchens.json'
CASE_SHA = 'cb8ee70e4fdefd2c786e11362c4c7551ca42396dde1f99ad16bc790c789d5ca9'
CAPTURED_ON = '2026-11-11'
INTERNAL = 'OBTV PARA O CONVENENTE'
FIELDS = {
    'pagamento': ['NR_CONVENIO', 'NR_MOV_FIN', 'TP_MOV_FINANCEIRA', 'DESC_DL', 'DATA_PAG', 'VL_PAGO'],
    'obtv_convenente': ['NR_MOV_FIN', 'VL_PAGO_OBTV_CONV'],
    'ingresso_contrapartida': ['NR_CONVENIO', 'DT_INGRESSO_CONTRAPARTIDA', 'VL_INGRESSO_CONTRAPARTIDA'],
    'pagamento_tributo': ['NR_CONVENIO', 'DATA_TRIBUTO', 'VL_PAG_TRIBUTOS'],
}


def archive_name(key):
    return f'siconv_{key}.zip'


def verify(path, expected):
    digest = sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1_048_576), b''):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise ValueError(f'Source bytes changed for {path.name}.')


def fields(captures, key, columns):
    with ZipFile(captures / archive_name(key)) as zipped, zipped.open(f'siconv_{key}.csv') as raw:
        reader = csv.reader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''), delimiter=';')
        header = next(reader)
        if len(set(header)) != len(header):
            raise ValueError(f'Duplicate columns in {key}.')
        indexes = [header.index(name) for name in columns]
        for row in reader:
            yield tuple(row[index] for index in indexes)


def cents(value):
    value = value.strip()
    if value in ('', '-', 'NA'):
        return None
    if not re.fullmatch(r'[0-9]{1,12}(?:,[0-9]{1,2}0*)?', value):
        raise ValueError('Unrecognized amount format in selected records.')
    result = Decimal(value.replace(',', '.')) * 100
    assert result == result.to_integral_value()
    return int(result)


def iso_date(value):
    return datetime.strptime(value, '%d/%m/%Y').date().isoformat()


def record_totals(records):
    amounts = [amount for _, amount in records]
    dates = [date for date, _ in records]
    assert None not in amounts
    return {'rows': len(records), 'cents': sum(amounts),
            'firstRecordDate': min(dates, default=None), 'lastRecordDate': max(dates, default=None)}


def read_payments(captures, agreements):
    selected = {}
    counts = Counter()
    for agreement, movement, payment_type, category, date, amount in fields(captures, 'pagamento', FIELDS['pagamento']):
        counts['sourcePaymentRows'] += 1
        if agreement not in agreements:
            continue
        if not movement or (agreement, movement) in selected:
            raise ValueError('Missing or repeated selected payment key.')
        if payment_type != 'PAGAMENTO A FAVORECIDO COM OBTV' or category == 'OBTV PARA EXECUTOR':
            raise ValueError('The pinned payment cohort has an unexpected transaction type.')
        selected[(agreement, movement)] = (category == INTERNAL, iso_date(date), cents(amount))
    counts['agreementsWithPaymentRows'] = len({agreement for agreement, _ in selected})
    counts['selectedPaymentRows'] = len(selected)
    return selected, counts


def reconcile_onward(captures, internal):
    occurrences = Counter(movement for (movement,) in fields(captures, 'pagamento', ['NR_MOV_FIN']) if movement in internal)
    assert len(occurrences) == len(internal) and all(count == 1 for count in occurrences.values())
    onward = defaultdict(list)
    for movement, amount in fields(captures, 'obtv_convenente', FIELDS['obtv_convenente']):
        if movement in internal:
            onward[movement].append(cents(amount))
    return onward


def read_separate(captures, key, agreements):
    source_rows = 0
    selected = set()
    grouped = defaultdict(list)
    for agreement, date, value in fields(captures, key, FIELDS[key]):
        source_rows += 1
        if agreement not in agreements:
            continue
        date, amount = iso_date(date), cents(value)
        record = (agreement, date, amount)
        if record in selected:
            raise ValueError(f'Repeated agreement, date and amount in selected {key} records.')
        selected.add(record)
        grouped[date[:4]].append((date, amount))
    return grouped, {'sourceRows': source_rows, 'agreementsWithRows': len({row[0] for row in selected}), 'selectedRows': len(selected)}


def build(captures):
    csv.field_size_limit(1_000_000)
    verify(CASE_PATH, CASE_SHA)
    for key, expected in ARCHIVES.items():
        verify(captures / archive_name(key), expected)
    case = json.loads(CASE_PATH.read_text(encoding='utf-8'))
    agreements = {row['agreementId'] for row in case['selected'] if row.get('signed')}
    payments, counts = read_payments(captures, agreements)
    internal = {movement: (date, amount) for (_, movement), (is_internal, date, amount) in payments.items() if is_internal}
    onward = reconcile_onward(captures, internal)
    partner, partner_counts = read_separate(captures, 'ingresso_contrapartida', agreements)
    taxes, tax_counts = read_separate(captures, 'pagamento_tributo', agreements)

    years = sorted({date[:4] for _, date, _ in payments.values()} | partner.keys() | taxes.keys())
    periods = []
    for year in years:
        other = [(date, amount) for is_internal, date, amount in payments.values() if not is_internal and date.startswith(year)]
        movements = {key: (date, amount) for key, (date, amount) in internal.items() if date.startswith(year)}
        coverage = Counter(dict.fromkeys(('withOnwardRecord', 'withoutOnwardRecord', 'withMissingOnwardAmount',
                                           'withMatchingOnwardAmount', 'withDifferentOnwardAmount', 'matchingOnwardCents'), 0))
        for key, (_, parent_amount) in movements.items():
            values = onward.get(key)
            if not values:
                coverage['withoutOnwardRecord'] += 1
                continue
            coverage['withOnwardRecord'] += 1
            if None in values:
                coverage['withMissingOnwardAmount'] += 1
            elif sum(values) == parent_amount:
                coverage['withMatchingOnwardAmount'] += 1
                coverage['matchingOnwardCents'] += parent_amount
            else:
                coverage['withDifferentOnwardAmount'] += 1
        periods.append({'calendarYear': year, 'partialCalendarYear': year == CAPTURED_ON[:4],
                        'otherAgreementAccountPayments': record_totals(other),
                        'internalTransfersToAgreementHolder': record_totals(list(movements.values())),
                        'onwardRecordsByParentYear': dict(coverage),
                        'reportedPartnerContributions': record_totals(partner[year]), 'reportedTaxPayments': record_totals(taxes[year])})
    return {'edition': CAPTURED_ON, 'currency': 'BRL', 'publisher': 'Transferegov.br',
            'license': 'https://opendatacommons.org/licenses/odbl/1-0/',
            'case': {'data': '/record/funding-flows/brazil-solidarity-kitchens/data.json', 'sha256': CASE_SHA,
                     'signedAgreements': len(agreements)},
            'counts': dict(counts, partnerContributionArchive=partner_counts, taxPaymentArchive=tax_counts),
            'sources': {key: {'url': DOWNLOADS + archive_name(key), 'file': archive_name(key), 'sha256': expected, 'fields': FIELDS[key]}
                        for key, expected in ARCHIVES.items()},
            'scope': 'Reported agreement-account movements. Exact onward links use the financial movement ID. Other stages cannot be reconciled from these fields.',
            'periods': periods}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('captures', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.write_text(json.dumps(build(args.captures), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
