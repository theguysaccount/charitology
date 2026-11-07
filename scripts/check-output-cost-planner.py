"""Check the committed XLSX/specification boundary without private authoring deps.

This reads cached baseline values; it does not claim native recalculation.
The separately retained native cases supply that source-specific evidence.
"""
from pathlib import Path
import hashlib
import json
import math
import re
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
FILES = ROOT / 'public/downloads'
SPEC = json.loads((FILES / 'output-cost-planner-v1.formulas.json').read_text())
PROOF = json.loads((FILES / 'output-cost-planner-v1.verification.json').read_text())
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def check():
    raw = (FILES / 'output-cost-planner-v1.xlsx').read_bytes()
    assert SPEC['format'] == 'charitology-output-cost-planner' and SPEC['version'] == 1
    assert PROOF['format'] == 'charitology-output-cost-verification' and PROOF['version'] == 1
    assert PROOF['method'] == SPEC['method'] == 'planned-cash-cost-per-defined-output-v1'
    assert SPEC['classification'] == 'illustrative' and SPEC['currency'] == 'USD'
    assert SPEC['cells']['B31'] == 'Defined output count'
    assert len(raw) == PROOF['artifact']['bytes']
    assert hashlib.sha256(raw).hexdigest() == PROOF['artifact']['sha256']
    assert hashlib.sha256((FILES / 'output-cost-planner-v1.formulas.json').read_bytes()).hexdigest() == PROOF['formulaSpecification']['sha256']
    assert PROOF['originalArtifactUnchanged'] is True
    assert len(PROOF['cases']) == 20 and len({c['name'] for c in PROOF['cases']}) == 20
    assert all(c['passed'] is True and c['exitCode'] == 0 and c['cacheValuesRemoved'] == 14 and c['ownedProfileRemoved'] is True for c in PROOF['cases'])
    assert 'Not a native Excel' in PROOF['scope']
    unit = next(c for c in PROOF['cases'] if c['name'] == 'changed-output-unit')
    assert unit['changedInputs'] == {'C11': 'delivered package'}
    assert unit['observed'] == {'E5': 100, 'H5': 'USD per delivered package', 'B31': 'Defined output count'}
    literal = next(c for c in PROOF['cases'] if c['name'] == 'literal-writer')
    detail = literal['literalTextObservation']
    assert detail['outputSha256'] == literal['outputSha256'] and detail['formulaCells'] == 14
    assert all(c['formula'] is None and c['cellType'] in ['s', 'inlineStr', 'str'] for c in detail['cells'].values())
    assert detail['cells']['C10']['text'].startswith('=HYPERLINK(')
    assert '+1+1' in detail['cells']['H24']['text']
    with zipfile.ZipFile(FILES / 'output-cost-planner-v1.xlsx') as archive:
        entries = archive.infolist()
        assert len(entries) <= 32 and len(entries) == len({e.filename for e in entries})
        assert sum(e.file_size for e in entries) <= 8 * 1024 * 1024
        assert all(e.file_size <= 2 * 1024 * 1024 and not e.filename.startswith('/') and '..' not in e.filename.split('/') for e in entries)
        assert not any('externallinks/' in e.filename.lower() or 'vbaproject' in e.filename.lower() or e.filename.lower().endswith('connections.xml') for e in entries)
        for entry in entries:
            if entry.filename.endswith('.rels'):
                assert all(r.attrib.get('TargetMode') != 'External' for r in ET.fromstring(archive.read(entry)))
            assert b'/Users/' not in archive.read(entry), 'Private authoring path in public workbook'
        book = ET.fromstring(archive.read('xl/workbook.xml'))
        sheets = book.find(NS + 'sheets')
        assert len(sheets) == 1 and sheets[0].attrib['name'] == SPEC['sheet']
        assert sheets[0].attrib.get('state', 'visible') == 'visible'
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(t.text or '' for t in item.iter(NS + 't')) for item in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        xml = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        assert xml.find(NS + 'sheetProtection') is None, 'Formulas must remain inspectable/editable'
        assert xml.find(NS + 'mergeCells') is None
        cells = {}
        formulas = {}
        for cell in xml.iter(NS + 'c'):
            ref, typ = cell.attrib['r'], cell.attrib.get('t')
            assert typ != 'e', 'Unexpected saved formula error'
            formula = cell.find(NS + 'f')
            if formula is not None:
                formulas[ref] = '=' + (formula.text or '')
            value = cell.findtext(NS + 'v')
            if typ == 's':
                value = shared[int(value)]
            elif typ == 'inlineStr':
                value = ''.join(t.text or '' for t in cell.iter(NS + 't'))
            elif value is not None and typ not in ['str', 'd']:
                value = float(value)
            cells[ref] = (value, typ)
        assert formulas == SPEC['formulas'], 'Saved formula differs from public source'
        allowed = {'IF', 'COUNTBLANK', 'COUNT', 'OR', 'INT', 'DATE', 'MIN', 'MAX', 'COUNTIFS', 'SUM', 'AND', 'NOT', 'ISNUMBER'}
        assert all(set(re.findall(r'([A-Z]+)\(', f)) <= allowed for f in formulas.values())
        for ref, value in SPEC['cells'].items():
            actual, typ = cells[ref]
            assert ref not in formulas, 'Authored input became a formula'
            if isinstance(value, dict):
                assert value['type'] == 'date' and typ == 'd' and actual.startswith(value['iso'] + 'T')
            else:
                assert actual == value, (ref, actual, value)
        for cell, expected in {'E5': 100, 'E6': 800 / 14, 'E7': 200, 'C27': 800, 'D27': 1000, 'E27': 1200}.items():
            assert math.isclose(cells[cell][0], expected, rel_tol=1e-12, abs_tol=1e-9)
        assert cells['E21'][0] == 'Complete'
        assert all(cells[f'F{row}'][0] == 'Usable' for row in [24, 25, 26, 31])
    print('Output-cost planner: exact artifact/specification, typed inputs, baseline and active-content boundaries pass; native evidence remains separately scoped.')


if __name__ == '__main__':
    check()
