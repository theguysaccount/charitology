"""Project verified cross-archive filing evidence onto the first Schedule I edition."""
import argparse
import gzip
import json
from collections import defaultdict
from hashlib import sha256
from pathlib import Path


def build(index_path, xml_path, filings_path):
    indexes = json.loads(index_path.read_text(encoding='utf-8'))
    xml = json.loads(xml_path.read_text(encoding='utf-8'))
    compressed = filings_path.read_bytes()
    original = json.loads(gzip.decompress(compressed))
    by_object = {row[3]: row for row in original['filings']}
    assert indexes['selectedFilings'] == len(by_object)
    assert not indexes['selectedObjectsWithoutExactIndexMatch'] and not xml['errors']
    expected = {(row['selectedObject'], obj) for row in indexes['candidates'] for obj in row['otherObjects']}
    actual = {(row['selectedObject'], row['candidateObject']) for row in xml['records']}
    assert expected == actual and len(actual) == len(xml['records'])

    grouped = defaultdict(list)
    for row in xml['records']:
        if row['status'] == 'different-period':
            continue
        assert row['status'] == 'same-period'
        selected = by_object[row['selectedObject']]
        candidate = row['candidate']
        assert (candidate['ein'], candidate['taxPeriodStart'], candidate['taxPeriodEnd']) == tuple(selected[:3])
        assert candidate['archive'] in xml['sources']
        grouped[row['selectedObject']].append({
            'filingObjectId': row['candidateObject'], 'archive': candidate['archive'], 'member': candidate['member'],
            'filingSha256': candidate['xmlSha256'], 'amendedFlagPresent': candidate['amended'],
            'sameRecordedPartIIAmountsAndRecipientIdentifiers': row['samePartIIAmountsAndRecipientIdentifiers'],
        })
    filings = [{
        'filingObjectId': obj, 'filerEin': by_object[obj][0], 'taxPeriodStart': by_object[obj][1],
        'taxPeriodEnd': by_object[obj][2], 'rowsInInitialEdition': len(by_object[obj][4]),
        'alternatives': sorted(alternatives, key=lambda item: item['filingObjectId']),
    } for obj, alternatives in sorted(grouped.items())]
    return {
        'capturedOn': '2026-11-11', 'scope': 'Published full Form 990 objects indexed for 2022–2026 with the exact same EIN and tax-period dates as a filing in the January 2024 edition.',
        'initialEditionSha256': sha256(compressed).hexdigest(), 'indexes': indexes['indexes'], 'searchedArchives': xml['sources'],
        'counts': {
            'initialEditionFilings': len(by_object), 'filingsWithAnotherVersion': len(filings),
            'rowsFromFilingsWithAnotherVersion': sum(row['rowsInInitialEdition'] for row in filings),
            'alternateFilingObjects': sum(len(row['alternatives']) for row in filings),
            'alternateObjectsWithDifferentRecordedPartII': sum(not item['sameRecordedPartIIAmountsAndRecipientIdentifiers'] for row in filings for item in row['alternatives']),
        },
        'filings': filings,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('index_evidence', type=Path)
    parser.add_argument('xml_evidence', type=Path)
    parser.add_argument('initial_edition', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    snapshot = build(args.index_evidence, args.xml_evidence, args.initial_edition)
    args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
