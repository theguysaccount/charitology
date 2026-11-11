#!/usr/bin/env python3
"""Join the fixed Ipea extract to the published Transferegov edition."""

import argparse
from collections import Counter, defaultdict
from contextlib import closing
import csv
import gzip
from hashlib import sha256
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen


SOURCE = {
    'publisher': 'Instituto de Pesquisa Econômica Aplicada (Ipea)',
    'title': 'Base de Dados das Organizações da Sociedade Civil',
    'edition': '2026-08',
    'accessedOn': '2026-11-11',
    'catalog': 'https://mapaosc.ipea.gov.br/base-dados',
    'methodology': 'https://mapaosc.ipea.gov.br/metodologia',
    'terms': 'https://mapaosc.ipea.gov.br/termosuso',
    'dictionary': 'https://mapaosc.ipea.gov.br/arquivos/subitems/4038-dicionario-de-dados-mapa-oscs.xlsx',
    'dictionarySha256': 'c52a109a3e498e180c2b0947804c1d76425a163a5f6e920823eb1b1c98e91c95',
    'url': 'https://mapaosc.ipea.gov.br/download/20260806_MOSC_baseDivulgacao.csv',
    'sourceBytes': 343956497,
    'sourceSha256': '77d4b622ae84df3cc97fb274662463b9112a8e2e93e655e1beb3316fad37193e',
    'sourceRows': 1113949,
}
TRANSFER_SHA256 = 'e104204207990851b245721a8a6e22746e59ad7f4935da7ac41abf5e0dd01798'
STATUSES = {'Ativa', 'Inapta', 'Nula ou Baixada', 'Suspensa'}
FIELDS = ('cnpj', 'situacao_cadastral', 'matriz_filial', 'UF_Sigla')
ROOT = Path(__file__).resolve().parent.parent


class FingerprintedReader(io.RawIOBase):
    def __init__(self, source):
        self.source = source
        self.digest = sha256()
        self.size = 0

    def readable(self):
        return True

    def readinto(self, buffer):
        count = self.source.readinto(buffer)
        self.size += count
        if self.size > SOURCE['sourceBytes']:
            raise ValueError('The Ipea source exceeds its fixed capture size')
        self.digest.update(memoryview(buffer)[:count])
        return count


def read_registry(source, targets):
    reader = FingerprintedReader(source)
    # Some unused narrative fields contain legacy bytes. Selected values below
    # must match the publisher's exact vocabulary or an ASCII identifier.
    with io.TextIOWrapper(io.BufferedReader(reader), encoding='utf-8', errors='surrogateescape', newline='') as stream:
        rows = csv.reader(stream, delimiter=';', strict=True)
        header = next(rows)
        positions = [header.index(field) for field in FIELDS]
        if any(header.count(field) != 1 for field in FIELDS):
            raise ValueError('The Ipea source has duplicate selected fields')
        records = {}
        conflicts = set()
        count = 0
        for count, row in enumerate(rows, 1):
            if len(row) != len(header):
                raise ValueError(f'Invalid column count in source record {count}')
            cnpj = row[positions[0]]
            if cnpj not in targets:
                continue
            if cnpj in records or cnpj in conflicts:
                records.pop(cnpj, None)
                conflicts.add(cnpj)
                continue
            status, office, state = (row[position] for position in positions[1:])
            if status not in STATUSES or office not in {'Matriz', 'Filial', 'Não Identificado'}:
                raise ValueError(f'Unexpected registration fields in source record {count}: {status!r}, {office!r}')
            if state and (len(state) != 2 or not state.isascii() or not state.isalpha() or not state.isupper()):
                raise ValueError(f'Unexpected state code in source record {count}')
            records[cnpj] = [cnpj, count, status, office, state or None]
    if (reader.size, reader.digest.hexdigest(), count) != (SOURCE['sourceBytes'], SOURCE['sourceSha256'], SOURCE['sourceRows']):
        raise ValueError('The Ipea source did not match the fixed capture')
    return records, conflicts


def coverage(agreements, records, conflicts):
    groups = {name: [] for name in ('exact', 'unmatched', 'ambiguous')}
    for row in agreements:
        cnpj = row[2]
        groups['exact' if cnpj in records else 'ambiguous' if cnpj in conflicts else 'unmatched'].append(row)
    result = {}
    for kind, group in groups.items():
        years = defaultdict(lambda: {'ids': set(), 'orders': 0, 'centsBRL': 0})
        for row in group:
            for order in row[9]:
                period = years[order[1][:4]]
                period['ids'].add(row[2])
                period['orders'] += 1
                period['centsBRL'] += order[2]
        result[kind] = {
            'identifiers': len({row[2] for row in group}),
            'agreements': len(group),
            'orders': sum(len(row[9]) for row in group),
            'byBankOrderYear': {
                year: {'identifiers': len(entry['ids']), 'orders': entry['orders'], 'centsBRL': entry['centsBRL']}
                for year, entry in sorted(years.items())
            },
        }
    return result


def build(source, output):
    transfer_dir = ROOT / 'public/data/funding-flows/brazil-transferegov'
    transfer = json.loads((transfer_dir / 'manifest.json').read_text())
    packed_agreements = (transfer_dir / transfer['asset']['path']).read_bytes()
    if sha256(packed_agreements).hexdigest() != TRANSFER_SHA256 or transfer['asset']['sha256'] != TRANSFER_SHA256:
        raise ValueError('The Transferegov edition has changed')
    agreements = json.loads(gzip.decompress(packed_agreements))
    targets = {row[2] for row in agreements}
    records, conflicts = read_registry(source, targets)
    decoded = (json.dumps([records[cnpj] for cnpj in sorted(records)], separators=(',', ':')) + '\n').encode()
    packed = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=packed, mtime=0) as archive:
        archive.write(decoded)
    data = packed.getvalue()
    manifest = {
        'format': 'charitology-br-osc-registry-v1',
        'source': SOURCE,
        'transfers': {
            'capturedOn': transfer['capturedOn'],
            'manifest': '/data/funding-flows/brazil-transferegov/manifest.json',
            'assetSha256': TRANSFER_SHA256,
            'identifiers': len(targets),
            'agreements': len(agreements),
            'orders': sum(len(row[9]) for row in agreements),
        },
        'coverage': coverage(agreements, records, conflicts),
        'ambiguousCnpjs': sorted(conflicts),
        'registrationStatuses': dict(sorted(Counter(row[2] for row in records.values()).items())),
        'officeTypes': dict(sorted(Counter(row[3] for row in records.values()).items())),
        'fields': ['cnpj', 'ipeaSourceRecord', 'registrationStatus', 'officeType', 'registeredState'],
        'sourceColumns': {
            'cnpj': 'cnpj',
            'ipeaSourceRecord': 'one-based CSV data record after the header',
            'registrationStatus': 'situacao_cadastral',
            'officeType': 'matriz_filial',
            'registeredState': 'UF_Sigla',
        },
        'asset': {
            'path': 'registrations.json.gz',
            'rows': len(records),
            'bytes': len(data),
            'sha256': sha256(data).hexdigest(),
            'decodedBytes': len(decoded),
            'decodedSha256': sha256(decoded).hexdigest(),
        },
    }
    output.mkdir(parents=True, exist_ok=False)
    (output / 'registrations.json.gz').write_bytes(data)
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--csv', type=Path, help='the exact original Ipea file')
    source.add_argument('--fetch', action='store_true', help='stream the exact public capture without saving the original')
    parser.add_argument('output', type=Path, help='new output directory')
    args = parser.parse_args()
    if args.fetch:
        request = Request(SOURCE['url'], headers={'Accept-Encoding': 'identity'})
        with closing(urlopen(request, timeout=60)) as response:
            if response.status != 200 or int(response.headers['Content-Length']) != SOURCE['sourceBytes']:
                raise ValueError('The publisher did not serve the fixed capture size')
            build(response, args.output)
    else:
        with args.csv.open('rb') as file:
            build(file, args.output)
