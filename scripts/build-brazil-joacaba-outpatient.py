from collections import Counter
import csv
from hashlib import sha256
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
FACILITY = '2964511'
MUNICIPALITY = '420900'
MENDELEY = 'https://data.mendeley.com/public-files/datasets/3frvgfn47t/files/'
HEARING_SOURCES = {
    'counts': ('producao_auditiva_sia_2025-08_2026-07.csv', '6c3d4f76-d299-455b-ae58-e7d7f6e5a83c', 15407950,
               '0a5b608b21f498cb21ae6373c85e83fb4c0f30f01998f8fde369dac25dcd4263'),
    'facility': ('unidades.csv', 'd2638962-f102-428d-921c-7af51c5512cd', 38281,
                 'e8743b91bf29c1c44ef629dfa3f07759864b73b97b867b7be5b4f078d7595894'),
    'codes': ('procedimentos_sigtap.csv', '15d7c4da-a35d-4bf0-8bd0-0a88bbaa8735', 3099,
              'bff3d78c4f2d7bc6ddc2e49badc799a3569a6b05d7bd8daed3516bcda8d88347'),
    'method': ('README.md', 'ab489984-4d82-4c76-9c1e-bb654999819c', 5712,
               '95da3598214c78ee3565439e465b4799d88950ddd20d17935d3db3830133e9d2'),
}
GROUPS = {
    'aasi': 'aasi_12m',
    'reposicao_aasi': 'reposicoes_12m',
    'diagnostico_auditivo': 'diagnosticos_12m',
    'audiometria': 'audiometrias_12m',
    'selecao_adaptacao_aasi': 'selecao_adaptacao_12m',
    'molde_auricular': 'moldes_12m',
    'manutencao_aasi': 'manutencoes_12m',
    'sistema_fm': 'sistemas_fm_12m',
}
# Transcribed from the approved-positive codes in the signed annex table, PDF page 2.
ANNEX_OBSERVED_CODES = {
    '0211070041', '0211070092', '0211070106', '0211070319',
    '0701030089', '0701030135', '0701030143', '0701030283',
}
ANNEX_FOLLOW_UP = ['0301070032', '0301070253']


def verify(path, size, digest):
    data = path.read_bytes()
    if len(data) != size or sha256(data).hexdigest() != digest:
        raise ValueError(f'Capture changed for {path.name}')
    return data


def csv_rows(path):
    with path.open(encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source)
        for row in reader:
            yield reader.line_num, row


def hearing_counts(captures, annex):
    receipts = {}
    for label, (filename, file_id, size, digest) in HEARING_SOURCES.items():
        verify(captures / filename, size, digest)
        receipts[label] = {
            'filename': filename, 'url': f'{MENDELEY}{file_id}/file_downloaded', 'bytes': size, 'sha256': digest,
        }

    month_keys = [f'2025{month:02d}' for month in range(8, 13)] + [f'2026{month:02d}' for month in range(1, 8)]
    code_rows = dict(
        (row['procedimento_sigtap'], (row['grupo'], row['tipo_tecnologia']))
        for _, row in csv_rows(captures / receipts['codes']['filename'])
    )
    facility_matches = [
        (line, row) for line, row in csv_rows(captures / receipts['facility']['filename']) if row['cnes'] == FACILITY
    ]
    [(facility_line, facility)] = facility_matches
    assert (facility['municipio'], facility['municipio_ibge'], facility['uf'], facility['cer']) == (
        MUNICIPALITY, '4209003', 'SC', 'CER III',
    )

    months = {month: Counter() for month in month_keys}
    technology = Counter()
    code_totals = Counter()
    seen = set()
    for _, row in csv_rows(captures / receipts['counts']['filename']):
        if row['cnes'] != FACILITY:
            continue
        assert (row['uf_unidade'], row['municipio_unidade']) == ('SC', MUNICIPALITY)
        month = row['mes_processamento']
        code = row['procedimento_sigtap']
        group, tech = code_rows[code]
        assert (row['grupo'], row['tipo_tecnologia']) == (group, tech)
        # The publisher groups by residence. Use this dimension for duplicate detection only.
        key = month, code, row['municipio_residencia']
        assert key not in seen, 'Repeated provider-month-procedure-residence record'
        seen.add(key)
        quantity = int(row['quantidade_aprovada'])
        assert quantity >= 0
        months[month][group] += quantity
        code_totals[code] += quantity
        if group == 'aasi':
            assert tech in {'A', 'B', 'C'}
            technology[tech] += quantity

    totals = {group: sum(month[group] for month in months.values()) for group in GROUPS}
    assert totals == {group: int(facility[column]) for group, column in GROUPS.items()}
    assert {tech: technology[tech] for tech in 'ABC'} == {
        tech: int(facility['aasi_tipo_' + tech.lower()]) for tech in 'ABC'
    }
    positive_codes = {code for code, count in code_totals.items() if count > 0}
    assert positive_codes == ANNEX_OBSERVED_CODES | {'0701030291'}
    assert set(ANNEX_FOLLOW_UP).isdisjoint(code_rows)
    return {
        'edition': 'https://data.mendeley.com/datasets/3frvgfn47t/1',
        'doi': '10.17632/3frvgfn47t.1',
        'license': 'https://creativecommons.org/licenses/by/4.0/',
        'author': 'Henrique Saraiva',
        'publishedOn': '2026-11-01',
        'facilitySummarySourceRow': facility_line,
        'reportingBasis': 'SIA processing month (PA_MVM)',
        'captures': receipts,
        'detailedRecordsForFacility': len(seen),
        'months': [{'month': month[:4] + '-' + month[4:], **{group: counts[group] for group in GROUPS}}
                   for month, counts in months.items()],
        'totals': totals,
        'hearingAidsByTechnology': {tech: technology[tech] for tech in 'ABC'},
        'annexComparison': {
            'source': annex,
            'positiveCodes': [{'code': code, 'group': code_rows[code][0], 'approvedUnits': code_totals[code],
                               'printedInAnnex': code in ANNEX_OBSERVED_CODES}
                              for code in sorted(positive_codes)],
            'followUpCodesOutsideResearchScope': ANNEX_FOLLOW_UP,
        },
    }


def outpatient_counts(captures):
    filename = 'outpatient-elasticnes.json'
    size = 7797
    digest = 'e0bc1e157b2fd9f23975a38086a69d3b23754a94880f78e0aaac2c118c4df993'
    snapshot = json.loads(verify(captures / filename, size, digest))
    assert snapshot['facility'] == FACILITY
    expected_months = [f'{year}-{month:02d}' for year in (2024, 2025, 2026)
                       for month in range(1, 9 if year == 2026 else 13)]
    assert [row['month'] for row in snapshot['months']] == expected_months
    assert [row['year'] for row in snapshot['years']] == [2024, 2025, 2026]
    for year in snapshot['years']:
        rows = [row for row in snapshot['months'] if row['month'].startswith(str(year['year']))]
        for field in ('institutionalRecords', 'observations'):
            assert sum(row[field] for row in rows) == year[field]
        assert sum(row['approvedProcedureUnits'] for row in rows if row['observations']) == year['approvedProcedureUnits']
    assert all(row['institutionalRecords'] == 1 and
               (row['approvedProcedureUnits'] is None) == (row['observations'] == 0) for row in snapshot['months'])
    return {
        'capturedOn': '2026-11-11',
        'snapshot': {'filename': filename, 'bytes': size, 'sha256': digest},
        **snapshot,
    }


def main(captures, output):
    case = json.loads((ROOT / 'src/data/funding-flows/brazil-joacaba-rehabilitation.json').read_bytes())
    assert case['facility']['cnes'] == FACILITY
    annex = case['documents']['hearingTargets']
    verify(captures / 'annex.pdf', annex['bytes'], annex['sha256'])
    edition = {
        'format': 'charitology-joacaba-outpatient-v1',
        'cnes': FACILITY,
        'municipalityCode': case['facility']['municipalityCode'],
        'infrastructureAgreement': case['agreement'],
        'outpatient': outpatient_counts(captures),
        'hearing': hearing_counts(captures, annex),
    }
    with output.open('x', encoding='utf-8') as destination:
        json.dump(edition, destination, indent=2, ensure_ascii=False)
        destination.write('\n')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Pass the capture directory and a new output JSON path.')
    main(Path(sys.argv[1]), Path(sys.argv[2]))
