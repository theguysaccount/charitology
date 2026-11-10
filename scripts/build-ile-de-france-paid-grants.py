"""Produce a scoped French regional paid-grant edition from the exact publisher CSV."""
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


CAPTURE_SHA = '8be996a61f4b92d12a244f3c56767a8997e4e52770f607b4762900e9ce3e19fc'
DATASET = 'https://data.iledefrance.fr/explore/dataset/subventions-versees-par-la-region-ile-de-france-aux-associations/'
CSV = 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/subventions-versees-par-la-region-ile-de-france-aux-associations/exports/csv?use_labels=true'


def valid_id(number, length):
    if not re.fullmatch(f'[0-9]{{{length}}}', number):
        return False
    digits = [int(char) * (1 + i % 2) for i, char in enumerate(reversed(number))]
    return any(digits) and sum(value - 9 if value > 9 else value for value in digits) % 10 == 0


def build(source, output):
    raw = source.read_bytes()
    if sha256(raw).hexdigest() != CAPTURE_SHA:
        raise ValueError('The publisher CSV differs from the pinned capture.')
    counts = defaultdict(Counter)
    projections = []
    duplicates = defaultdict(list)
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig'), newline=''), delimiter=';')
    assert len(reader.fieldnames) == 15
    for record, row in enumerate(reader, 1):
        assert None not in row and row['Année'] in ('2024', '2025') and row['ID attribuant'] == '23750007900312'
        year, establishment, paid = row['Année'], row['ID bénéficiaire'], row['Date versement']
        count = counts[year]
        count['input'] += 1
        if row['Délégation'] == 'True':
            count['delegated'] += 1
            continue
        assert row['Délégation'] == 'False'
        if not valid_id(establishment, 14) or not valid_id(establishment[:9], 9):
            count['missingOrUnusableSiret'] += 1
            continue
        if not paid:
            count['missingPaymentDate'] += 1
            continue
        date.fromisoformat(paid)
        name, program = row['Nom bénéficiaire'].strip(), row["Dispositif d'aide"].strip()
        decision, dossier, amount = row['Référence décision'], row['ID dossier'], row['Montant']
        assert name and decision and dossier and re.fullmatch(r'[0-9]{1,10}(?:\.[0-9]{1,2})?', amount)
        count['included'] += 1
        if paid[:4] != year:
            count['otherPaymentCalendarYear'] += 1
        key = (year, establishment, paid, decision, dossier, amount)
        duplicates[key].append(record)
        projections.append([record, establishment, name, year, paid, amount, decision, dossier, program or None])
    for count in counts.values():
        assert count['input'] == sum(count[key] for key in ('delegated','missingOrUnusableSiret','missingPaymentDate','included'))
    groups = sorted(sorted(group) for group in duplicates.values() if len(group) > 1)
    assert len(projections) == 9203 and groups == [[500,3839],[6840,6886]]
    raw = (json.dumps(projections, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, filename='', mode='wb', mtime=0, compresslevel=9) as file:
        file.write(raw)
    packed = buffer.getvalue()
    output.mkdir(parents=True)
    (output / 'payments.json.gz').write_bytes(packed)
    manifest = {
        'format': 'charitology-idf-paid-grants-v1', 'capturedOn': '2026-11-10', 'currency': 'EUR',
        'source': {'publisher': 'Région Île-de-France', 'dataset': DATASET, 'csv': CSV, 'sha256': CAPTURE_SHA,
                   'lastPublishedUpdate': '2026-09-08', 'license': 'https://www.data.gouv.fr/pages/legal/licences/etalab-2-0'},
        'counts': {year: {key: counts[year][key] for key in ('input','delegated','missingOrUnusableSiret',
                    'missingPaymentDate','included','otherPaymentCalendarYear')} for year in sorted(counts)},
        'establishments': len({row[1] for row in projections}),
        'legalUnits': len({row[1][:9] for row in projections}),
        'duplicateCandidates': groups,
        'fields': ['sourceRecord','siret','publishedName','budgetYear','paymentDate','amountEUR','decision','dossier','aidProgram'],
        'asset': {'path': 'payments.json.gz', 'rows': len(projections), 'bytes': len(packed), 'decodedBytes': len(raw),
                  'sha256': sha256(packed).hexdigest(), 'decodedSha256': sha256(raw).hexdigest()},
    }
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
    print(f"{manifest['asset']['rows']} regional payments, {manifest['establishments']} establishments.")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 scripts/build-ile-de-france-paid-grants.py <input-csv> <new-output-directory>')
    build(*map(Path, sys.argv[1:]))
