#!/usr/bin/env python3
"""Rebuild the scoped Chile funding edition from pinned original files."""

import argparse
from collections import Counter
import csv
from datetime import date, datetime, timedelta
from decimal import Decimal
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile

SPREADSHEET = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
EPOCH = date(1899, 12, 30)
PINNED = {
    2022: "def647bf735a2c0da1be89dc027d8e78c61936aab613f7364fcb90084d3d472b",
    2023: "216553f7d09de315642211c9fbc12e6eafc18a83dfea43fca0c737d4e139d590",
    2024: "07529e3b35bbf2a13c6740b59d5cb5fe11abadea2123b007f079326aa5d857fe",
    2025: "b73edabc361fa39b605410247ff9361d1aa38bc5a6d5533ec653716bcdf0cf4c",
}


def check_rut(value):
    cleaned = re.sub(r"[.\s]", "", value).upper()
    match = re.fullmatch(r"(\d{7,8})-([0-9K])", cleaned)
    if not match:
        return None
    digits, last = match.groups()
    remainder = 11 - sum(int(c) * (2 + i % 6) for i, c in enumerate(reversed(digits))) % 11
    expected = "0" if remainder == 11 else "K" if remainder == 10 else str(remainder)
    return cleaned if last == expected else None


def rows(book):
    with ZipFile(book) as archive:
        strings = ["".join(element.itertext()) for element in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        with archive.open("xl/worksheets/sheet1.xml") as sheet:
            for event, element in ET.iterparse(sheet, events=("start", "end")):
                if event == "start" and element.tag == SPREADSHEET + "sheetData":
                    row_parent = element
                if event != "end" or element.tag != SPREADSHEET + "row":
                    continue
                values = {}
                for cell in element.findall(SPREADSHEET + "c"):
                    value = cell.findtext(SPREADSHEET + "v")
                    if value is not None:
                        column = cell.attrib["r"].rstrip("0123456789")
                        values[column] = strings[int(value)] if cell.attrib.get("t") == "s" else value
                yield int(element.attrib["r"]), values
                row_parent.clear()


RUT = "53226150-3"
REGISTER_URL = "https://registros19862.gob.cl/institucion/53226150/transferencias"
TRANSFER_SOURCES = {
    2021: ("9ac6f2f30d43e931bcd91977041c078f8a88092c46bb84c8c34af021e21afd51", "3666880", 3_000_000),
    2022: ("68b85fc7bb6491e794ffb1014faf1b16cc401427c1879400596f278beb247c0b", "3743603", 1_000_000),
    2023: ("47e0990a06769991ab5b860e214defd54f7f2c65485a49b4dca5ef79d2d65a87", "3929287", 900_000),
}
RECEIPT_TOTALS = {2022: (1, 3_234_830), 2023: (3, 3_420_454), 2024: (1, 702_000), 2025: (0, None)}


def pinned(path, digest):
    assert sha256(path.read_bytes()).hexdigest() == digest, path
    return path


def registered_transfers(captures):
    for year, (digest, folio, amount) in TRANSFER_SOURCES.items():
        path = pinned(captures / f"rostros-transfers-{year}.csv", digest)
        with path.open(encoding="utf-8-sig", newline="") as data:
            header = data.readline()
            data.seek(0)
            rows = list(csv.DictReader(data, delimiter=";" if ";" in header else ","))
        assert len(rows) == 1, path
        row = rows[0]
        assert row["FOLIO"] == folio and int(row["MONTO"]) == amount and int(row["PERIODO"]) == year, path
        assert row["RECEPTORA_RUT"].replace(".", "") == RUT and row["CLASIFICACION"] == "Subvenciones", path
        yield {
            "period": year, "folio": folio, "nominalClp": amount, "issuerName": row["EMISORA_NOMBRE"],
            "issuerRut": row["EMISORA_RUT"].replace(".", ""), "recipientRut": RUT, "reportedCommune": row["COMUNA"],
            "decreeDate": datetime.strptime(row["FECHA_DECRETO"], "%d-%m-%Y").date().isoformat(),
            "entryDate": datetime.strptime(row["FECHA_INGRESO"], "%d-%m-%Y").date().isoformat(),
            "classification": row["CLASIFICACION"],
            "csv": f"{REGISTER_URL}?trans_recibidas%5Bperiodos%5D={year}&csv=recibidas",
            "csvSha256": digest, "sourceRow": 2, "record": f"https://registros19862.gob.cl/transferencia/{folio}",
        }


WORKBOOK_COVERAGE = {
    2022: (414, 78, 8_073_239_854),
    2023: (14_291, 283, 44_245_732_763),
    2024: (428_151, 396, 66_629_506_401),
    2025: (533_650, 515, 91_560_892_461),
}


def donation_disclosures(captures):
    recipients = set()
    coverage = []
    selected = []
    for year, digest in PINNED.items():
        book = pinned(captures / f"receipts-{year}.xlsx", digest)
        amount_col, date_col = ("C", "D") if year < 2024 else ("D", "E")
        header = ["RUT Donataria", "Donataria", "Valor", "Fecha"]
        if year >= 2024:
            header.insert(2, "Nac/Ext.")
        count = 0
        published_sum = 0
        workbook_recipients = set()
        selected_rows = []
        for ordinal, values in rows(book):
            if ordinal == 1:
                sheet_total = Decimal(values[amount_col])
                continue
            if ordinal == 2:
                assert list(values.values()) == header, year
                continue
            if not values:
                continue
            rut = check_rut(values.get("A", ""))
            day = EPOCH + timedelta(days=int(values[date_col]))
            amount = Decimal(values[amount_col])
            assert rut and day.year == year and amount == amount.to_integral_value() and amount >= 0, (year, ordinal)
            published_sum += int(amount)
            count += 1
            workbook_recipients.add(rut)
            if rut == RUT:
                origin = values.get("C") if year >= 2024 else None
                selected_rows.append({
                    "sourceRow": ordinal, "nominalClp": int(amount), "reportedDate": day.isoformat(),
                    "reportedOrigin": origin or None,
                })
        total = sum(row["nominalClp"] for row in selected_rows) if selected_rows else None
        assert (len(selected_rows), total) == RECEIPT_TOTALS[year], year
        assert (count, len(workbook_recipients), published_sum) == WORKBOOK_COVERAGE[year], year
        assert published_sum == sheet_total, year
        coverage.append({
            "workbookYear": year, "rowCount": count, "recipientCount": len(workbook_recipients),
            "publishedValueNominalClp": published_sum,
            "workbook": f"https://donacionesley21440.gob.cl/donaciones/donaciones-{year}",
            "sha256": digest,
        })
        recipients.update(workbook_recipients)
        selected.append({"workbookYear": year, "totalNominalClp": total, "rows": selected_rows})
    assert len(recipients) == 659
    return {"workbooks": coverage, "distinctRecipients": len(recipients), "institution": selected,
            "sheetPath": "xl/worksheets/sheet1.xml"}


class RegisterRows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.cells = None
        self.cell = None
        self.statuses = {}

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.cells = []
        if tag == "td" and self.cells is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.cells.append("".join(self.cell).strip())
            self.cell = None
        if tag == "tr" and self.cells is not None:
            if len(self.cells) == 4 and self.cells[1].isdigit():
                registration, status = self.cells[1], self.cells[3]
                assert registration not in self.statuses and status in {"Inscrita", "Eliminada"}, registration
                self.statuses[registration] = status
            self.cells = None


def write_csv(path, fields, records):
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows({key: record.get(key) for key in fields} for record in records)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captures", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    evidence = json.loads((Path(__file__).resolve().parents[1] / "src/data/chile-residential-evidence.json").read_text(encoding="utf-8"))
    for source in evidence["sources"].values():
        if "file" in source:
            pinned(args.captures / source["file"], source["sha256"])
    register = RegisterRows()
    register.feed((args.captures / evidence["sources"]["doneeRegister"]["file"]).read_text(encoding="utf-8"))
    statuses = Counter(register.statuses.values())
    assert dict(statuses) == {"Inscrita": evidence["register"]["registered"], "Eliminada": evidence["register"]["removed"]}
    assert len(register.statuses) == evidence["register"]["snapshotEntries"]
    assert register.statuses[evidence["institution"]["rpd"]] == "Inscrita"
    assert evidence["institution"]["rut"] == RUT

    disclosures = donation_disclosures(args.captures)
    transfers = list(registered_transfers(args.captures))
    edition = {**evidence, "donationDisclosures": disclosures, "governmentRegisterTransfers": transfers}
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "edition.json").write_text(json.dumps(edition, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(args.output / "donation-disclosures.csv",
              ("workbookYear", "sourceRow", "reportedDate", "nominalClp", "reportedOrigin", "source"),
              ({**row, "workbookYear": entry["workbookYear"], "source": workbook["workbook"]}
               for entry, workbook in zip(disclosures["institution"], disclosures["workbooks"]) for row in entry["rows"]))
    write_csv(args.output / "government-register-transfers.csv",
              ("period", "folio", "decreeDate", "entryDate", "issuerRut", "issuerName", "recipientRut",
               "nominalClp", "reportedCommune", "classification", "record", "csv", "sourceRow"), transfers)
    write_csv(args.output / "residence-awards.csv",
              ("year", "record", "name", "region", "amount", "regularCare", "correspondingAward", "source"),
              ({**award, "source": evidence["sources"][f'awards{award["year"]}']["url"] + f'#page={award["sourcePage"]}'}
               for award in evidence["awards"]))
    write_csv(args.output / "consolidated-accounts.csv",
              ("year", "donationsIncome", "governmentAgreementIncome", "socialCareExpenses", "unit", "source"),
              ({**row, "unit": "CLP thousands", "source": evidence["sources"][f'accounts{row["report"]}']["url"] + f'#page={row["page"]}'}
               for row in evidence["accounts"]))


if __name__ == "__main__":
    main()
