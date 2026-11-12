#!/usr/bin/env python3
"""Project the frozen Taiwan municipal-assistance edition from official CSVs."""

import argparse
import csv
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
import io
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
OLD_HEADER = ["受補助對象", "受補助對象所在縣市別", "計畫名稱", "核准金額_元", "核准日期"]
HEADER = [
    "補捐助機關", "受補（捐）助對象所歸屬之直轄市或縣（市）", "受補助對象",
    "補（捐）助事項或用途", "核准日期", "補（捐）助金額（含累積金額）_元",
]
NO_ID = {("2020q4.csv", 2), ("2026q2.csv", 52)}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_pinned(path, pin):
    body = path.read_bytes()
    require(len(body) == int(pin["bytes"]) and sha256(body).hexdigest() == pin["sha256"],
            f"Source size or fingerprint differs: {path}")
    return body


def approval_date(value):
    literal = unicodedata.normalize("NFKC", value)
    fields = re.fullmatch(r"(\d{3})[年/.](\d{1,2})[月/.](\d{1,2})日?", literal)
    require(fields is not None, f"Unknown approval date format: {value}")
    roc_year, month, day = map(int, fields.groups())
    return date(roc_year + 1911, month, day).isoformat()


def award_rows(source_path, pin, names):
    filename = pin["filename"]
    year, quarter = int(filename[:4]), int(filename[5])
    old = year == 2020
    data = read_pinned(source_path / filename, pin).decode(pin["encoding"])
    table = csv.reader(io.StringIO(data, newline=""), strict=True)
    require(next(table) == (OLD_HEADER if old else HEADER), f"Unexpected header: {filename}")
    rows = []
    records = 0
    for record, raw in enumerate(table, 1):
        records = record
        require(len(raw) == (5 if old else 6), f"Unexpected fields in {filename} record {record}")
        if old:
            recipient, municipality, title, amount, approval = map(str.strip, raw)
            publisher = None
        else:
            publisher, municipality, recipient, title, approval, amount = map(str.strip, raw)
        title_key = "".join(unicodedata.normalize("NFKC", title).split())
        if "設籍前" not in title_key or "特殊境遇" not in title_key:
            continue
        require(old or publisher in {"新住民發展基金", "內政部(新住民發展基金)"}, f"Unexpected fund in {filename} record {record}")
        require(municipality in names and ("政府" in recipient or recipient.endswith("社會局")),
                f"Unexpected municipal recipient in {filename} record {record}")
        require(re.fullmatch(r"(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)", amount) is not None,
                f"Unexpected grant amount in {filename} record {record}")
        codes = re.findall(r"(?<![0-9])[0-9]{3}[0-9A-Z]C[0-9]{3}(?![0-9])", title_key)
        require(len(codes) == (0 if (filename, record) in NO_ID else 1),
                f"Unexpected project identifiers in {filename} record {record}")
        project = codes[0] if codes else None
        if project is not None:
            require(int(project[:3]) + 1911 == year, f"Project and edition years disagree: {project}")
        calendar = approval_date(approval)
        require(int(calendar[:4]) in (year - 1, year), f"Approval outside the expected period: {filename} {record}")
        rows.append({
            "key": project or f"{filename[:-4]}-{record}", "projectId": project,
            "year": year, "quarter": quarter, "municipality": names[municipality],
            "municipalityLiteral": municipality, "grantorLiteral": publisher, "recipient": recipient, "title": title,
            "approvalDateLiteral": approval, "approvalDate": calendar, "grantTwd": int(amount.replace(",", "")),
            "sourceFile": filename, "sourceRecord": record, "sourceUrl": pin["url"],
            "amountField": OLD_HEADER[3] if old else HEADER[5],
        })
    require(records == int(pin["records"]) and len(rows) == int(pin["selected"]), f"Record coverage differs: {filename}")
    return rows


def audit_rows(audit, awards):
    output = []
    for row in audit["rows"]:
        eligible = [
            award for award in awards
            if award["year"] == row["year"]
            and (row["municipality"] == "Total" or row["municipality"] == award["municipality"])
            and award["sourceFile"] != "2020q4.csv"
        ]
        approved = row["approvedTwd"]
        require(sum(award["grantTwd"] for award in eligible) == (approved if approved is not None else 0)
                and (approved is not None or not eligible),
                f"Audit approval does not reconcile: {row['municipality']}, {row['year']}")
        if row["executionTwd"] is None:
            require(row["executionPercent"] is None, "Missing execution has a percentage")
        else:
            rate = (Decimal(row["executionTwd"]) * 100 / approved).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
            require(rate == Decimal(row["executionPercent"]), "Audit execution percentage differs")
        output.append({**row, "matchingAwardKeys": [award["key"] for award in eligible],
                       "sourceUrl": audit["url"], "printedPage": audit["printedPage"], "table": audit["table"]})
    for total in (row for row in output if row["municipality"] == "Total"):
        detail = [row for row in output if row["year"] == total["year"] and row["municipality"] != "Total"]
        for field in ("approvedTwd", "executionTwd"):
            values = [row[field] for row in detail if row[field] is not None]
            require(sum(values) == total[field], f"Published audit total differs: {total['year']}, {field}")
    return output


def write_csv(path, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: "|".join(value) if isinstance(value, list) else value
                             for field, value in row.items()})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    args = parser.parse_args()
    with (ROOT / "src/data/taiwan-assistance-inputs.tsv").open(encoding="utf-8", newline="") as handle:
        pins = list(csv.DictReader(handle, delimiter="\t"))
    evidence = json.loads((ROOT / "src/data/taiwan-assistance-evidence.json").read_text(encoding="utf-8"))
    audit, survey, government = (evidence[name] for name in ("audit", "survey", "governmentDraft"))
    for source in (survey, government):
        require(read_pinned(args.input_dir / source["filename"], source).startswith(b"%PDF-"), "Source is not a PDF")
    names = {row["municipalityLiteral"]: row["municipality"] for row in audit["rows"] if row["tableRow"] > 1}
    awards = [row for pin in pins for row in award_rows(args.input_dir, pin, names)]
    require(len({row["key"] for row in awards}) == len(awards), "Duplicate project or source key")
    records = audit_rows(audit, awards)
    comparison = []
    for year in range(2020, 2027):
        selected = [row for row in awards if row["year"] == year]
        draft = next((row for row in government["rows"] if row["year"] == year), None)
        amount = sum(row["grantTwd"] for row in selected)
        if draft:
            require(len(selected) == draft["reportedRecords"], f"Government draft count differs in {year}")
        comparison.append({
            "year": year, "throughQuarter": max(row["quarter"] for row in selected),
            "disclosedGrantRecords": len(selected), "disclosedGrantTwd": amount,
            "draftSubsidyTwd": draft["subsidyTwd"] if draft else None,
            "differenceTwd": amount - draft["subsidyTwd"] if draft else None,
        })
    require([row["differenceTwd"] for row in comparison] == [0, 0, 0, 0, 0, 874684, None],
            "Published source reconciliation has changed")
    survey_rows = [{**row, "year": survey["year"], "sourceUrl": survey["url"],
                    "pdfPage": survey["pdfPage"], "printedPage": survey["printedPage"], "table": survey["table"]}
                   for row in survey["rows"]]
    government_rows = [{**row, "sourceUrl": government["url"], "pdfPage": government["pdfPage"],
                        "printedPage": government["printedPage"], "table": government["table"], "draft": government["draft"]}
                       for row in government["rows"]]
    output = {
        "format": "charitology-taiwan-municipal-assistance-v1", "capturedOn": evidence["capturedOn"],
        "currency": "TWD", "catalogue": "https://data.gov.tw/dataset/86171",
        "license": "https://data.gov.tw/license", "grantPublisher": "Taiwan National Immigration Agency",
        "grantSources": [{**pin, **{field: int(pin[field]) for field in ("bytes", "records", "selected")}} for pin in pins],
        "comparison": comparison, "awards": awards, "audit": {**audit, "rows": records},
        "survey": {**survey, "rows": survey_rows}, "governmentDraft": {**government, "rows": government_rows},
    }
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "edition.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for filename, rows in (("awards.csv", awards), ("municipal-audit.csv", records),
                           ("survey.csv", survey_rows), ("government-draft.csv", government_rows)):
        write_csv(args.out_dir / filename, rows)


if __name__ == "__main__":
    main()
