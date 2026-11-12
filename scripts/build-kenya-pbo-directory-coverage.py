"""Compare public PBORA table counts without exporting directory names or identifiers."""
from collections import Counter, defaultdict
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import unicodedata


class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.tables = []
        self.rows = None
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.depth += 1
            if self.depth == 1:
                self.rows = []
        if self.depth != 1:
            return
        if tag == 'tr':
            self.row = []
        if tag in ('th', 'td'):
            self.cell = []
        if tag in ('br', 'p') and self.cell is not None:
            self.cell.append(' ')

    def handle_data(self, data):
        if self.depth == 1 and self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if self.depth == 1:
            if tag in ('th', 'td') and self.cell is not None:
                self.row.append(' '.join(''.join(self.cell).split()))
                self.cell = None
            if tag == 'tr' and self.row is not None:
                self.rows.append(self.row)
                self.row = None
            if tag == 'table':
                self.tables.append(self.rows)
                self.rows = None
        if tag == 'table':
            self.depth -= 1


def reference_shape(value):
    if not value:
        return 'blank'
    if re.fullmatch(r'NGO-[A-Z0-9]+', value, re.I):
        return 'ngoHyphenAlphanumeric'
    if re.match(r'^218\s*[/.-]\s*051\b', value, re.I):
        return 'numeric218051'
    return 'otherPrintedShape'


def measure(html):
    parser = Tables()
    parser.feed(html.decode('utf-8'))
    [rows] = [table for table in parser.tables if table and table[0] == ['REFERENCE NO.', 'NAME OF THE ORGANIZATION']]
    body = rows[1:]
    assert all(len(row) == 2 for row in body), 'Unexpected listing columns'
    shape_counts = Counter(reference_shape(reference) for reference, _ in body)
    references = Counter(reference for reference, _ in body if reference)
    by_reference = defaultdict(set)
    by_name = defaultdict(set)
    identical_pairs = Counter(map(tuple, body))
    for reference, name in body:
        if reference and name:
            normalized_name = unicodedata.normalize('NFKC', name).casefold()
            by_reference[reference].add(normalized_name)
            by_name[normalized_name].add(reference)
    return {
        'publicTableColumns': rows[0],
        'directoryRows': len(body),
        'printedReferenceShapes': dict(sorted(shape_counts.items())),
        'blankNames': sum(not name for _, name in body),
        'distinctNonblankReferenceStrings': len(references),
        'repeatedReferenceStrings': sum(count > 1 for count in references.values()),
        'rowsWithRepeatedReferenceStrings': sum(count for count in references.values() if count > 1),
        'referenceStringsWithMultipleNormalizedNames': sum(len(names) > 1 for names in by_reference.values()),
        'repeatedIdenticalReferenceNameRows': sum(count - 1 for count in identical_pairs.values()),
        'normalizedNameStringsWithMultipleReferences': sum(len(values) > 1 for values in by_name.values()),
        'normalizedNamesWithBothMajorReferenceShapes': sum(
            {reference_shape(value) for value in values} >= {'numeric218051', 'ngoHyphenAlphanumeric'}
            for values in by_name.values()
        ),
    }



def capture(path, url):
    raw = path.read_bytes()
    return measure(raw), {'url': url, 'bytes': len(raw), 'sha256': sha256(raw).hexdigest()}


if __name__ == '__main__':
    if len(sys.argv) != 5:
        raise SystemExit('Pass the capture date, both official HTML captures, and a new output path.')
    date, primary_path, second_path, destination = sys.argv[1:]
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
        raise SystemExit('Use a YYYY-MM-DD capture date.')
    primary, source = capture(Path(primary_path), 'https://pbora.go.ke/pbos')
    second, second_source = capture(Path(second_path), 'https://www.pbora.go.ke/pbos')
    if primary != second:
        raise SystemExit('The official responses disagree on directory counts.')
    edition = {
        'format': 'charitology-kenya-pbora-directory-coverage-v1',
        'capturedOn': date,
        'publisher': 'Public Benefit Organizations Regulatory Authority',
        'captures': [source, second_source],
        **primary,
    }
    with Path(destination).open('x', encoding='utf-8') as output:
        json.dump(edition, output, indent=2, ensure_ascii=False)
        output.write('\n')
