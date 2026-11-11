"""Find candidate competing full Form 990 objects across official IRS index years."""
import argparse
import csv
import gzip
import json
import re
from collections import Counter, defaultdict
from hashlib import sha256
from pathlib import Path


BASE = 'https://apps.irs.gov/pub/epostcard/990/xml/'


def qualification(captures, edition):
    with gzip.open(edition, 'rt', encoding='utf-8') as file:
        filings = json.load(file)['filings']
    def tax_month(date):
        return date[:4] + date[5:7]

    cohort = defaultdict(list)
    selected_objects = {}
    for ein, start, end, object_id, grants in filings:
        cohort[(ein, tax_month(end))].append(object_id)
        selected_objects[object_id] = (ein, start, end, len(grants))

    candidates = defaultdict(dict)
    counts = {}
    for year in range(2022, 2027):
        path = captures / f'index_{year}.csv'
        digest = sha256()
        with path.open('rb') as source:
            for chunk in iter(lambda: source.read(1_048_576), b''):
                digest.update(chunk)
        tallies = Counter()
        with path.open(encoding='utf-8-sig', newline='') as source:
            for row in csv.DictReader(source):
                tallies['sourceRows'] += 1
                if row['RETURN_TYPE'] != '990':
                    continue
                tallies['fullForm990Rows'] += 1
                key = (row['EIN'].strip(), row['TAX_PERIOD'].strip())
                if key not in cohort:
                    continue
                object_id = row['OBJECT_ID'].strip()
                if not re.fullmatch(r'[0-9]{18}', object_id):
                    tallies['matchingRowsWithInvalidObjectId'] += 1
                    continue
                tallies['matchingRows'] += 1
                object_refs = candidates[key].setdefault(object_id, [])
                batch = (row.get('XML_BATCH_ID') or '').strip() or None
                object_refs.append({'indexYear': year, 'batchId': batch})
        counts[str(year)] = {'url': f'{BASE}{year}/index_{year}.csv', 'sha256': digest.hexdigest(), **tallies}

    matches = []
    not_indexed = 0
    exposed_rows = 0
    for key, cohort_ids in cohort.items():
        for selected in cohort_ids:
            alternate = {obj: records for obj, records in candidates[key].items() if obj != selected}
            not_indexed += selected not in candidates[key]
            if alternate:
                ein, start, end, rows = selected_objects[selected]
                exposed_rows += rows
                matches.append({'ein': ein, 'taxPeriodStart': start, 'taxPeriodEnd': end,
                                'selectedObject': selected, 'selectedGrantRows': rows, 'otherObjects': alternate})
    return {
        'indexes': counts, 'selectedFilings': len(filings), 'selectedFilerMonthKeys': len(cohort),
        'selectedObjectsWithoutExactIndexMatch': not_indexed, 'filingsWithSameFilerMonthCandidate': len(matches),
        'distinctCandidateObjects': len({obj for match in matches for obj in match['otherObjects']}),
        'publishedRowsInFilingsWithCandidates': exposed_rows, 'candidates': matches,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('captures', type=Path)
    parser.add_argument('edition', type=Path)
    args = parser.parse_args()
    print(json.dumps(qualification(args.captures, args.edition), indent=2))
