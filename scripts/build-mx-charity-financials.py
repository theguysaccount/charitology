"""Reproduce the Mexico SAT charity financial and directory snapshot."""
from argparse import ArgumentParser
from collections import Counter, defaultdict
from csv import DictReader
from decimal import Decimal
from gzip import GzipFile
from hashlib import sha256
from io import BytesIO, StringIO
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile
import json
import re

MANIFEST = Path(__file__).resolve().parents[1] / 'public/data/charity-financials/mx/manifest.json'
RFC = re.compile(r'[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_source(folder, source):
    raw = (folder / source['file']).read_bytes()
    require(len(raw) == source['bytes'] and sha256(raw).hexdigest() == source['sha256'],
            f"{source['file']} does not match the pinned edition")
    return raw


def cents(token):
    token = token.strip()
    if token.casefold() in ('', 'nulo', 'null'):
        return None
    result = Decimal(token) * 100
    require(result.is_finite() and result == result.to_integral_value() and abs(result) <= 9_007_199_254_740_991,
            'An amount cannot be represented as exact cents')
    return int(result)


def financial_periods(folder, year, source, fields, currency_label):
    raw = read_source(folder, source)
    lines = DictReader(StringIO(raw.decode(source['encoding']), newline=''))
    required = {'rfc', 'razon_social', 'entidad_federativa', 'tipo_donataria', 'ejercicio_fiscal', 'unidad_medida', *fields}
    require(len(set(lines.fieldnames)) == len(lines.fieldnames) and required <= set(lines.fieldnames),
            'Unexpected financial CSV columns')
    records = {}
    for coordinate, line in enumerate(lines, 1):
        require(None not in line and None not in line.values(), 'Unexpected financial CSV row width')
        rfc = line['rfc'].strip().upper()
        require(RFC.fullmatch(rfc) and rfc not in records, 'Invalid or repeated institutional RFC')
        require(line['ejercicio_fiscal'] == year and line['unidad_medida'].strip() == currency_label,
                'Unexpected financial period or currency')
        records[rfc] = [int(year), coordinate, line['razon_social'].strip(), line['entidad_federativa'].strip(),
                        line['tipo_donataria'].strip(), [cents(line[field]) for field in fields]]
    require(len(records) == source['sourceRows'] == source['includedRows'], 'Financial row coverage changed')
    return records


def directory_entries(folder, year, source, activity_codes):
    columns = source['columns']
    with ZipFile(BytesIO(read_source(folder, source))) as archive:
        workbook = ElementTree.fromstring(archive.read('xl/workbook.xml'))
        names = [sheet.get('name') for sheet in workbook.findall('.//{*}sheet')]
        require(names == [source['sheet']], 'Unexpected SAT workbook sheet')
        shared = [''.join(t.text or '' for t in item.iter() if t.tag.endswith('}t'))
                  for item in ElementTree.fromstring(archive.read('xl/sharedStrings.xml'))]
        with archive.open('xl/worksheets/sheet1.xml') as raw:
            groups = defaultdict(list)
            header_found = False
            definitions = {item['definitionCell']: code for code, item in activity_codes.items()}
            verified_codes = set()
            for _, row in ElementTree.iterparse(raw, events=('end',)):
                if not row.tag.endswith('}row'):
                    continue
                number = int(row.get('r'))
                if number < source['headerRow']:
                    for cell in row:
                        code = definitions.get(cell.get('r'))
                        if code:
                            value = cell.find('{*}v')
                            require(cell.get('t') == 's' and shared[int(value.text)].strip().startswith(code + '.'),
                                    'Unexpected directory activity legend')
                            verified_codes.add(code)
                    row.clear()
                    continue
                selected = {}
                for cell in row:
                    column = cell.get('r').rstrip('0123456789')
                    if column not in columns.values():
                        continue
                    value = cell.find('{*}v')
                    if value is not None:
                        selected[column] = shared[int(value.text)].strip() if cell.get('t') == 's' else value.text
                rfc = selected.get(columns['rfc'], '').upper()
                if number == source['headerRow']:
                    require(rfc == 'RFC' and 'RAZÓN SOCIAL' in selected[columns['name']], 'Unexpected SAT worksheet header')
                    header_found = True
                elif rfc:
                    require(header_found and RFC.fullmatch(rfc), 'Unexpected directory institutional RFC')
                    require(selected.get(columns['activity']) in activity_codes, 'Unrecognized directory activity')
                    groups[rfc].append((number, *(selected.get(columns[field], '') for field in
                                                  ('state', 'activity', 'name', 'taxRegistryState'))))
                row.clear()
    require(verified_codes == set(activity_codes), 'Incomplete directory activity legend')
    require(header_found and len(groups) == source['distinctInstitutionalIds'], 'Directory identity count changed')
    require(sum(len(rows) for rows in groups.values()) == source['institutionRows'], 'Directory worksheet row coverage changed')
    require(sum(len(rows) > 1 for rows in groups.values()) == source['repeatedActivityGroups'], 'Directory activity coverage changed')
    projected = {}
    for rfc, rows in groups.items():
        records, states, activities, names, tax_states = zip(*rows)
        require(len(set(names)) == len(set(states)) == len(set(tax_states)) == 1, 'Conflicting institutional directory rows')
        projected[rfc] = [int(year), names[0], states[0], tax_states[0], list(zip(records, activities))]
    return projected


def build(folder, manifest):
    fields = [item['field'] for item in manifest['financialFields']]
    read_source(folder, manifest['dictionary'])
    organizations = defaultdict(lambda: [[], []])
    for year, source in manifest['financial'].items():
        for rfc, period in financial_periods(folder, year, source, fields, manifest['sourceCurrencyLabel']).items():
            organizations[rfc][0].append(period)
    for year, source in manifest['directories'].items():
        for rfc, entry in directory_entries(folder, year, source, manifest['directoryActivityCodes']).items():
            organizations[rfc][1].append(entry)
    counts = manifest['coverage']
    require(len(organizations) == counts['identities'], 'Combined identity coverage changed')
    histories = Counter(str(len(periods)) for periods, _ in organizations.values() if periods)
    require(histories == counts['exactPeriodHistories'], 'Financial period coverage changed')
    data = [[rfc, *observations] for rfc, observations in sorted(organizations.items())]
    decoded = (json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    buffer = BytesIO()
    with GzipFile(fileobj=buffer, mode='wb', mtime=0, filename='') as compressed:
        compressed.write(decoded)
    return decoded, buffer.getvalue()


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('captures', type=Path, help='exact CSV, XLSX and dictionary inputs named in the manifest')
    parser.add_argument('output', type=Path, help='destination for the regenerated gzip')
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_bytes())
    decoded, compressed = build(args.captures, manifest)
    asset = manifest['asset']
    require(len(decoded) == asset['decodedBytes'] and sha256(decoded).hexdigest() == asset['decodedSha256'],
            'Rebuilt data differs from the edition')
    require(len(compressed) == asset['bytes'] and sha256(compressed).hexdigest() == asset['sha256'],
            'Rebuilt compressed asset differs from the edition')
    args.output.write_bytes(compressed)
    print('Mexico SAT: exact registry and financial data rebuilt.')


if __name__ == '__main__':
    main()
