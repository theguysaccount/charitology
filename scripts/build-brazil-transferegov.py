"""Rebuild the Brazil civil society transfer edition from pinned public archives."""
import csv
import gzip
import io
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile


PORTAL = 'https://api-publica.transferegov.gestao.gov.br/'
DOWNLOADS = PORTAL + 'downloads/dadosgov/'
LICENSE = 'https://opendatacommons.org/licenses/odbl/1-0/'
OSC = 'Organização da Sociedade Civil'
YEARS = ('2024', '2025')
ARCHIVES = {
    'proposta': '8ef18d1536a8d6d36a8ef71550978c7bede2a546b74ff33d756d3290ecc17e4e',
    'convenio': '96110a017e3e0b8d139faedc6a105334d13d8f86f433e67b840d6f75779c6f4d',
    'desembolso': 'c58bbe64621d6300a4154193a1714d3d68127d423ad6aa660fb3b8d4b2efe833',
}
MODEL_URL = 'https://www.gov.br/transferegov/pt-br/ferramentas-gestao/paineis-gerenciais/arquivos/modelo-dados-csvs-discricionarias-e-legais.zip/@@display-file/file'
MODEL_HASH = '558e962ec1854f001ad6a54ae406b6436847d02101233a96e5bff4427c0b7716'

csv.field_size_limit(1_000_000)


def records(inputs, name):
    file = f'siconv_{name}.csv'
    with ZipFile(inputs / f'siconv_{name}.zip') as archive:
        if archive.namelist() != [file]:
            raise ValueError(f'Unexpected archive members in {name}.')
        with archive.open(file) as raw:
            reader = csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''), delimiter=';')
            if len(set(reader.fieldnames)) != len(reader.fieldnames):
                raise ValueError(f'Duplicate CSV headers in {name}.')
            for coordinate, row in enumerate(reader, 1):
                if None in row or None in row.values():
                    raise ValueError(f'Unexpected CSV width in {name} at record {coordinate}.')
                yield coordinate, row


def identifier(value):
    return value if re.fullmatch(r'[0-9]{1,20}', value) and int(value) else None


def cnpj(raw):
    value = re.sub(r'[./-]', '', raw.strip().upper())
    if not re.fullmatch(r'[0-9A-Z]{12}[0-9]{2}', value) or len(set(value)) == 1:
        return None
    for position in (12, 13):
        total = sum((ord(char) - 48) * (2 + index % 8) for index, char in enumerate(reversed(value[:position])))
        remainder = total % 11
        if int(value[position]) != (0 if remainder < 2 else 11 - remainder):
            return None
    return value


def source_date(value):
    match = re.fullmatch(r'([0-9]{2})/([0-9]{2})/([0-9]{4})', value)
    if not match:
        return None
    day, month, year = map(int, match.groups())
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def cents(value):
    if not re.fullmatch(r'-?[0-9]{1,12}(?:,[0-9]{1,2})?', value):
        return None
    whole, _, fraction = value.lstrip('-').partition(',')
    magnitude = int(whole) * 100 + int(fraction.ljust(2, '0'))
    return -magnitude if value.startswith('-') else magnitude


def read_proposals(inputs):
    proposals = {}
    totals = Counter()
    for coordinate, row in records(inputs, 'proposta'):
        totals['proposalRows'] += 1
        if row['NATUREZA_JURIDICA'] != OSC:
            continue
        totals['civilSocietyProposalRows'] += 1
        proposal = identifier(row['ID_PROPOSTA'])
        registration = cnpj(row['IDENTIF_PROPONENTE'])
        name = ' '.join(row['NM_PROPONENTE'].split())
        if not proposal or not registration or not 1 <= len(name) <= 320:
            totals['unusableCivilSocietyProposalRows'] += 1
            continue
        state = row['UF_PROPONENTE']
        if not re.fullmatch(r'[A-Z]{2}', state):
            state = None
        proposals[proposal] = (registration, name, state, coordinate)
    occurrences = Counter(row['ID_PROPOSTA'] for _, row in records(inputs, 'proposta') if row['ID_PROPOSTA'] in proposals)
    usable = {key: value for key, value in proposals.items() if occurrences[key] == 1}
    totals['duplicateCivilSocietyProposalRows'] = sum(n for n in occurrences.values() if n > 1)
    totals['usableCivilSocietyProposals'] = len(usable)
    return usable, totals


def read_agreements(inputs, proposals, totals):
    occurrences = Counter()
    agreements = {}
    for coordinate, row in records(inputs, 'convenio'):
        totals['agreementRows'] += 1
        raw_id = row['NR_CONVENIO']
        agreement = identifier(raw_id) or (raw_id if re.fullmatch(r'[0-9][A-Z]{5}', raw_id) else None)
        if not agreement:
            totals['unusableAgreementRows'] += 1
            continue
        occurrences[agreement] += 1
        proposal = row['ID_PROPOSTA']
        if proposal in proposals:
            agreements[agreement] = (proposal, coordinate, source_date(row['DIA_ASSIN_CONV']), cents(row['VL_REPASSE_CONV']))
    totals['duplicateAgreementNumbers'] = sum(n > 1 for n in occurrences.values())
    usable = {key: value for key, value in agreements.items() if occurrences[key] == 1}
    totals['joinedCivilSocietyAgreements'] = len(usable)
    return usable


def read_transfers(inputs, agreements, totals):
    candidates = []
    occurrences = Counter()
    counts = {year: Counter(dict.fromkeys(('sourceRows', 'outsideJoinedAgreements', 'invalidOrderRows',
                                            'duplicateOrderRows', 'includedOrders', 'reportedOrderCents'), 0)) for year in YEARS}
    for coordinate, row in records(inputs, 'desembolso'):
        totals['disbursementRows'] += 1
        order = identifier(row['ID_DESEMBOLSO'])
        if order:
            occurrences[order] += 1
        year, agreement = row['ANO_DESEMBOLSO'], row['NR_CONVENIO']
        if year not in counts:
            continue
        current = counts[year]
        current['sourceRows'] += 1
        if agreement not in agreements:
            current['outsideJoinedAgreements'] += 1
            continue
        order_date = source_date(row['DATA_DESEMBOLSO'])
        amount = cents(row['VL_DESEMBOLSADO'])
        if not order or not order_date or order_date[:4] != year or amount is None or amount <= 0:
            current['invalidOrderRows'] += 1
            continue
        candidates.append((year, agreement, [order, order_date, amount, coordinate]))
    transfers = defaultdict(list)
    for year, agreement, order in candidates:
        if occurrences[order[0]] != 1:
            counts[year]['duplicateOrderRows'] += 1
            continue
        transfers[agreement].append(order)
        counts[year]['includedOrders'] += 1
        counts[year]['reportedOrderCents'] += order[2]
    for count in counts.values():
        assert count['sourceRows'] == sum(count[key] for key in ('outsideJoinedAgreements', 'invalidOrderRows', 'duplicateOrderRows', 'includedOrders'))
        assert count['reportedOrderCents'] < 2 ** 53
    return transfers, counts


def verify_inputs(inputs):
    for name, expected in [(f'siconv_{key}.zip', value) for key, value in ARCHIVES.items()] + [('modelo-dados-real.zip', MODEL_HASH)]:
        digest = sha256()
        with (inputs / name).open('rb') as stream:
            while chunk := stream.read(1_048_576):
                digest.update(chunk)
        if digest.hexdigest() != expected:
            raise ValueError(f'Original file differs from the pinned capture: {name}')


def build(inputs, output):
    verify_inputs(inputs)
    proposals, totals = read_proposals(inputs)
    agreements = read_agreements(inputs, proposals, totals)
    transfers, coverage = read_transfers(inputs, agreements, totals)
    rows = []
    for agreement, orders in sorted(transfers.items()):
        proposal, agreement_record, signature_date, contribution = agreements[agreement]
        registration, name, state, proposal_record = proposals[proposal]
        rows.append([agreement, proposal, registration, name, state, proposal_record, agreement_record,
                     signature_date, contribution, sorted(orders, key=lambda order: (order[1], order[0]))])
    raw = (json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, filename='', mode='wb', mtime=0, compresslevel=9) as compressed:
        compressed.write(raw)
    packed = buffer.getvalue()
    asset = {'path': 'agreements.json.gz', 'rows': len(rows), 'bytes': len(packed), 'decodedBytes': len(raw),
             'sha256': sha256(packed).hexdigest(), 'decodedSha256': sha256(raw).hexdigest()}
    manifest = {
        'format': 'charitology-br-transferegov-v1', 'currency': 'BRL', 'capturedOn': '2026-11-10',
        'source': {'publisher': 'Transferegov.br', 'dataset': PORTAL + 'downloads', 'license': LICENSE,
                   'licenseName': 'ODbL-1.0', 'legalNature': OSC, 'model': {'url': MODEL_URL, 'sha256': MODEL_HASH},
                   'archives': {key: {'url': DOWNLOADS + f'siconv_{key}.zip', 'sha256': value} for key, value in ARCHIVES.items()}},
        'counts': dict(sorted(totals.items())), 'coverage': coverage,
        'organizations': len({row[2] for row in rows}),
        'agreementFields': ['agreementId', 'proposalId', 'cnpj', 'publishedOrganizationName', 'proponentState',
                            'proposalRecord', 'agreementRecord', 'signatureDate', 'federalContributionAtCaptureCentsBRL', 'orders'],
        'orderFields': ['disbursementId', 'bankOrderDate', 'madeAvailableToAgreementAccountCentsBRL', 'disbursementRecord'],
        'asset': asset,
    }
    output.mkdir(parents=True)
    (output / asset['path']).write_bytes(packed)
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
    (output / 'README.txt').write_text(
        'Brazil civil society transfers. Source data by Transferegov.br.\n'
        f'Original data: {manifest["source"]["dataset"]}\n'
        f'Database license: Open Database License (ODbL) 1.0, {LICENSE}\n'
        'Charitology selected and reformatted these data under the same license.\n'
        'The compressed JSON is the full selected database. See manifest.json for source coordinates, fields and coverage.\n',
        encoding='utf8',
    )
    print(json.dumps({'asset': asset, 'coverage': coverage, 'organizations': manifest['organizations']}))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 scripts/build-brazil-transferegov.py <pinned-capture-directory> <new-output-directory>')
    build(*map(Path, sys.argv[1:]))
