#!/usr/bin/env python3
"""Project pinned Presupuesto Abierto records for Chile's residential-care program."""

import argparse
from collections import Counter, defaultdict
import csv
from datetime import date
from hashlib import sha256
from html import unescape
import json
from pathlib import Path
import re
from urllib.parse import urlencode


ROOT = Path(__file__).resolve().parents[1]
AWARD_FILE = ROOT / "src/data/chile-residential-awards-2025.csv"
REGION_FILE = ROOT / "src/data/chile-residential-regions.csv"
CASE_FILE = ROOT / "public/data/funding-flows/chile-residential-care/edition.json"
CASE_SHA256 = "afe75540fb54f6d9c178dcdbfde66ff3415524181eaf77ddecd581798a0b4548"
PORTAL = "https://presupuestoabierto.gob.cl/"
API = "https://api.presupuestoabierto.gob.cl/api/v1/data/pagos"
AWARD_PDF = "https://www.senadis.gob.cl/descarga/i/7820"
BIPS_URL = "https://bips.ministeriodesarrollosocial.gob.cl/docs/informes/2026/70148%20-%20Modelos%20residenciales%20para%20adultos%20en%20situaci%C3%B3n%20de%20discapacidad.html"
MONITORING_GUIDE = "https://bips.ministeriodesarrollosocial.gob.cl/docs/informes/instructivos/2025/Instructivo_Proceso_de_Monitoreo_de_Programas_P%C3%BAblicos_2025.pdf"
ENDIDE_URL = "https://observatorio.ministeriodesarrollosocial.gob.cl/storage/docs/endide/Documento_Metodologico_ENDIDE_Diseno_Muestral_y_Medicion_Discapacidad.pdf"
RUT = "53226150-3"
CAPTURES = (
    ("rostros-2023", "senadis-payment-2023.json", 2023, RUT, "a3fa22faefdf6f6b386c489b7eb8855dfb6e0987f47d99ad07f7834c70ceda67"),
    ("rostros-2024", "senadis-payment-2024.json", 2024, RUT, "a5f2495dfad9e773603338157dc6309a80ad36ae6762e891a8f9533bc4eda44d"),
    ("program-2025", "program-2025.json", 2025, None, "3588a1eb6dd2e6f9bd2b8bd9e3818ea296372b01b63688fafed53c6113e949f9"),
    ("program-2026", "program-2026.json", 2026, None, "7a31cff16a6c2aca66d3a1277279026a950592b7514cec138e031139b82cb5f6"),
)
TARGET_CHECKS = {
    2025: "94ea89cfd1f3e63ab748e50b0a591d4cef0fd4f38cf4d3371730086cc2fa6be4",
    2026: "d079c109e60615f9270c170db12173bfc4357f9066ed7789706444dae0676b47",
}
GROUPED_PINS = {
    2023: "ca7f35493b93c20f67efeac20edd1bb9e73745cb2c96f97202ba6d50bb9eb61c",
    2024: "b7c5e8a957f5bd6186d3caa5cf1bad0c7aef8d79bf2faf80d95249945a58c065",
    2025: "04f87d41c59a1283603a9aeeb1fd908e6eda082f320e3dbe23e8b241e1477dd2",
    2026: "9a4b03a3ec7e469a989ec639984d62d9e3a876605ddb8c1dfd6d29bd0c3986e2",
}
CITATIONS = {
    "portal": PORTAL,
    "license": "https://creativecommons.org/licenses/by-sa/4.0/",
    "dataTerms": "https://api.presupuestoabierto.gob.cl/about-data",
    "dictionary": "https://api.presupuestoabierto.gob.cl/files/Integracion_Portal_Ciudadano_2.5.pdf#page=5",
    "publisher": "Dirección de Presupuestos (2019). Presupuesto Abierto. Santiago de Chile Dirección de Presupuestos.",
    "awards": AWARD_PDF,
    "rules2024": "https://www.senadis.gob.cl/descarga/i/7453#page=21",
    "regionCodes": "https://www.bcn.cl/leychile/navegar?i=1123248",
    "communityLivingReview": "https://doi.org/10.1136/bmjopen-2018-025735",
}
FIELDS = (
    "source", "sourceRow", "rut", "period", "bookMonth", "assignment", "document",
    "documentDate", "reportedPaymentDate", "accruedClp", "paidClp", "budgetRegion", "budgetLocation",
)


def pin(path, digest):
    body = path.read_bytes()
    assert sha256(body).hexdigest() == digest, path
    return body


def valid_rut(rut):
    assert re.fullmatch(r"[0-9]{7,8}-[0-9K]", rut), rut
    digits, check = rut.split("-")
    total = sum(int(digit) * (2 + index % 6) for index, digit in enumerate(reversed(digits)))
    expected = "0123456789K"[(11 - total % 11) % 11]
    return check == expected


def source_url(year, target=None):
    where = {"periodo": year, "partida": "21", "capitulo": "07", "area": "001"}
    if target:
        where = {"beneficiario": target, **where}
    else:
        where.update(subtitulo="24", item="03", asignacion="004")
    return API + "?" + urlencode({"where": json.dumps(where, separators=(",", ":"))})


def grouped_check(captures, year, rows):
    file = f"provider-summary-{year}.json"
    data = load_records(captures, file, GROUPED_PINS[year])
    groups = [row for row in data if (row["partida"], row["capitulo"], row["area"]) == ("21", "07", "001")]
    assert len(groups) == 1 and groups[0]["count"] == len(rows), year
    assert groups[0]["sum"] == sum(row["accruedClp"] for row in rows), year
    query = urlencode({"group-by": '["partida","capitulo","area"]', "where": json.dumps(
        {"beneficiario": RUT, "periodo": year}, separators=(",", ":"))})
    return {
        "period": year, "file": file, "sha256": GROUPED_PINS[year], "url": API + "?" + query,
        "rows": len(rows), "sourceGroupedSumClp": groups[0]["sum"],
        "sumOfPaidFieldsClp": sum(row["paidClp"] for row in rows),
    }


def load_awards(captures):
    pin(captures / "senadis-763-2025.pdf", "e07f94f90da008bff8024c6cec54094e048e3496ca0b28fe88ee497930a9918e")
    with AWARD_FILE.open(encoding="utf-8", newline="") as stream:
        awards = list(csv.DictReader(stream))
    for index, award in enumerate(awards, 1):
        for field in ("row", "pdfPage", "awardClp"):
            award[field] = int(award[field])
        page = 2 if index <= 18 else 3 if index <= 35 else 4
        assert award["row"] == index and award["pdfPage"] == page and valid_rut(award["rut"]), award["folio"]
        assert re.fullmatch(r"[0-9]{6}", award["folio"]) and award["awardClp"] > 0, award["folio"]
    assert len(awards) == len({a["folio"] for a in awards}) == 37
    assert sum(a["awardClp"] for a in awards) == 15_762_384_000
    return awards


def load_records(captures, file, digest):
    rows = json.loads(pin(captures / file, digest))
    assert isinstance(rows, list) and rows, file
    # No duplicate raw rows occur in these editions. A future capture must
    # resolve duplicate semantics before accepting a new pin.
    assert len(rows) == len({json.dumps(row, sort_keys=True) for row in rows}), file
    return rows


def normalize(rows, source, year, target):
    item, assignment = ("01", "592") if year <= 2024 else ("03", "004")
    for source_row, row in enumerate(rows, 1):
        where = (source, source_row)
        assert (row["partida"], row["capitulo"], row["area"], row["codigo_programa_presupuestario"]) == ("21", "07", "001", "01"), where
        assert (row["subtitulo"], row["item"], row["asignacion"]) == ("24", item, assignment), where
        assert row["periodo"] == year and 1 <= row["mes"] <= 12 and row["persona"] == 0, where
        assert row["moneda"] == "PESOS" and row["tipo_documento"] == "CONVENIO", where
        assert row["nombre_asignacion"] == "ADULTOS CON DISCAPACIDAD EN RESIDENCIAS", where
        assert valid_rut(row["beneficiario"]) and (target is None or row["beneficiario"] == target), where
        paid, accrued = row["monto"], row["devengo"]
        assert type(paid) is int and type(accrued) is int and 0 <= paid <= accrued, where
        assert paid == row["monto_original"] and accrued == row["devengo_original"], where
        paid_date = row["fecha_pago"]
        assert paid == 0 or paid_date, where
        assert not paid_date or date.fromisoformat(paid_date).year in (year, year + 1), where
        date.fromisoformat(row["fecha_documento"])
        assert re.fullmatch(r"[0-9-]+", row["numero_documento"]), where
        location = row["nombre_ubicacion_geografica"]
        region = row["codigo_ubicacion_geografica"]
        assert re.fullmatch(r"[0-9]{2}", region), where
        assert location == "Sin Aplicación" or re.fullmatch(r"(?:[0-9]{6}-)?[^\W\d_][\w .()/-]*", location), where
        yield {
            "source": source, "sourceRow": source_row, "rut": row["beneficiario"], "period": year,
            "bookMonth": row["mes"], "assignment": f"24.{item}.{assignment}",
            "document": row["numero_documento"], "documentDate": row["fecha_documento"],
            "reportedPaymentDate": paid_date, "accruedClp": accrued, "paidClp": paid,
            "budgetRegion": None if region == "00" else region,
            "budgetLocation": None if location == "Sin Aplicación" else location,
        }


def totals(rows):
    payment_years = Counter()
    for row in rows:
        if row["reportedPaymentDate"]:
            payment_years[row["reportedPaymentDate"][:4]] += row["paidClp"]
    return {
        "rows": len(rows),
        "recipientCount": len({row["rut"] for row in rows}),
        "accruedClp": sum(row["accruedClp"] for row in rows),
        "paidClp": sum(row["paidClp"] for row in rows),
        "rowsWithZeroPaid": sum(row["paidClp"] == 0 for row in rows),
        "rowsWithoutPaymentDate": sum(row["reportedPaymentDate"] is None for row in rows),
        "paidByLastRecordedPaymentYearClp": dict(sorted(payment_years.items())),
    }


def capture_source(captures, file, digest, url):
    return pin(captures / file, digest), {"file": file, "sha256": digest, "url": url}


def monitoring_context(captures, program_rows):
    raw, source = capture_source(captures, "bips-70148-monitoring-2025.html",
                                 "600569308b889f0f0a135f5f3a1b1a36faf383f7f35e655e43ac9497ac6aa7d6", BIPS_URL)
    _, guide = capture_source(captures, "bips-monitoring-guide-2025.pdf",
                              "b1022d64f6b42faac25e710d8d38cc496f0bae140c7f9782785ee75df5602885", MONITORING_GUIDE + "#page=61")
    _, need = capture_source(captures, "endide-2022-methodology.pdf",
                             "e7f9a73eb7207bc59730442c804a6ebadd64cd09a85b3b69144b59f8795d7392", ENDIDE_URL + "#page=26")
    report = raw.decode("utf-8")

    def field(name):
        values = re.findall(r'<p class="fl">' + name + r'</p>\s*<div class="fv">([0-9]+)</div>', report)
        assert len(values) == 1, name
        return int(values[0])

    def region_table(title):
        # These are fixed, checksum-verified publisher tables. Require each exact
        # label and a two-cell row before accepting a source position.
        bodies = re.findall(re.escape(title) + r'</p>\s*<table[^>]*>\s*<thead>.*?</thead>\s*<tbody>(.*?)</tbody>', report, re.S)
        assert len(bodies) == 1, title
        rows = {}
        for index, row in enumerate(re.findall(r'<tr[^>]*>(.*?)</tr>', bodies[0], re.S), 1):
            label, value = (unescape(re.sub(r'<[^>]*>', '', cell)).strip()
                            for cell in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S))
            assert label not in rows and value.isdecimal(), (title, label)
            rows[label] = (int(value), index)
        return rows

    assert field("ID_BIPS") == 70148
    components = field("TOTAL_EJEC_GASTOS_COMP")
    assert components == field("TOTAL_GASTO_COMP_2025") == field("GASTO_LEY_COMP_PROGRAMA")
    administration = field("TOTAL_EJEC_GASTOS_ADMIN")
    assert components + administration == field("TOTAL_EJECUTADO")
    people = field("POB_BENEF_TOTAL")
    served = region_table("Desagregación población beneficiada a nivel regional")
    spending = region_table("Gasto de componentes por región")
    assert served.pop("Total")[0] == people and sum(value for value, _ in served.values()) == people
    assert spending.pop("Total")[0] == components and sum(value for value, _ in spending.values()) == components
    unknown_residents, _ = served.pop("Sin información")
    central_components, _ = spending.pop("Nivel central")

    with REGION_FILE.open(encoding="utf-8", newline="") as stream:
        regions = list(csv.DictReader(stream))
    assert len(regions) == len({row["cut"] for row in regions}) == 16
    assert len({row["endideRegion"] for row in regions}) == 16
    assert {row["cut"] for row in regions} == {f"{code:02}" for code in range(1, 17)}
    assert {row["bipsRegion"] for row in regions} == served.keys() == spending.keys()
    by_region = defaultdict(list)
    for row in program_rows:
        by_region[row["budgetRegion"]].append(row)
    assert set(by_region) <= {None, *(row["cut"] for row in regions)}
    for index, region in enumerate(regions, 3):
        for key in ("prevalencePct", "absoluteErrorPp", "relativeErrorPct"):
            assert re.fullmatch(r"[0-9]+\.[0-9]", region[key]), region
            region[key] = float(region[key])
        assert 0 < region["absoluteErrorPp"] < region["prevalencePct"] < 100
        label = region["bipsRegion"]
        region["endideSourceRow"] = index
        region["servedPeople"], region["bipsPeopleSourceRow"] = served[label]
        region["componentsClpThousands"], region["bipsSpendingSourceRow"] = spending[label]
        scoped = totals(by_region[region["cut"]])
        region.update(ledgerRows=scoped["rows"], ledgerAccruedClp=scoped["accruedClp"],
                      ledgerPaidClp=scoped["paidClp"])
    national = totals(program_rows)
    assert sum(row["ledgerAccruedClp"] for row in regions) + totals(by_region[None])["accruedClp"] == national["accruedClp"]
    assert sum(row["ledgerPaidClp"] for row in regions) + totals(by_region[None])["paidClp"] == national["paidClp"]
    assert "38 residencias en convenio" in report.split('>12. Indicadores Complementarios<', 1)[1]
    outcomes = {
        "improvedQualityOfLifeScore": {"numerator": field("NUMERADOR_PROP_1"), "denominator": field("DENOMINADOR_PROP_1")},
        "individualizedCareReported": {"numerator": field("NUMERADOR_COMP_1"), "denominator": field("DENOMINADOR_COMP_1"),
                                       "residencesSubmittingTechnicalReport": 38},
    }
    assert 0 < outcomes["improvedQualityOfLifeScore"]["numerator"] <= outcomes["improvedQualityOfLifeScore"]["denominator"] <= people
    assert 0 < outcomes["individualizedCareReported"]["numerator"] <= outcomes["individualizedCareReported"]["denominator"] == people
    return {
        "year": 2025, "source": source, "unitGuide": guide, "componentsClpThousands": components,
        "administrationClpThousands": administration, "ledgerAccruedMinusComponentsClp": national["accruedClp"] - 1000 * components,
        "servedPeople": people, "servedPeopleRegionUnknown": unknown_residents, "centralComponentsClpThousands": central_components,
        "ledgerWithoutRegion": totals(by_region[None]), "outcomes": outcomes,
        "regionalNeed": {"surveyYear": 2022, "minimumAge": 18, "table": 13, "source": need},
        "regions": regions,
    }


def reconciliation(ledger, awards, earlier):
    documents = {
        2024: ("1245", "12452", "12452024"),
        2025: ("19992025", "199920252", "199920253"),
    }
    for year, keys in documents.items():
        original = earlier if year == 2024 else awards
        award_total = sum(row["amount" if year == 2024 else "awardClp"] for row in original)
        groups = []
        for key in keys:
            rows = [row for row in ledger if row["rut"] == RUT and row["period"] == year and row["document"] == key]
            assert rows and len({row["reportedPaymentDate"] for row in rows}) == 1, (year, key)
            groups.append({"document": key, "reportedPaymentDate": rows[0]["reportedPaymentDate"], **totals(rows)})
        assert [group["paidClp"] for group in groups] == [award_total * percent // 100 for percent in (40, 30, 30)]
        yield {"period": year, "awardClp": award_total, "recordGroups": groups}


def write_csv(path, fields, records):
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captures", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    awards = load_awards(args.captures)
    awards_by_rut = defaultdict(list)
    for award in awards:
        awards_by_rut[award["rut"]].append(award)
    assert len(awards_by_rut) == 19
    case = json.loads(pin(CASE_FILE, CASE_SHA256))
    assert case["institution"]["rut"] == RUT
    assert {(a["folio"], a["awardClp"]) for a in awards_by_rut[RUT]} == {
        (a["record"], a["amount"]) for a in case["awards"] if a["year"] == 2025
    }
    ledger, sources, coverage = [], [], []
    monitoring = None
    for source, file, year, target, digest in CAPTURES:
        raw = load_records(args.captures, file, digest)
        rows = list(normalize(raw, source, year, target))
        assert [2, 27, 169, 119][year - 2023] == len(rows), source
        if year == 2025:
            monitoring = monitoring_context(args.captures, rows)
        included = [row for row in rows if row["rut"] in awards_by_rut]
        excluded = [row for row in rows if row["rut"] not in awards_by_rut]
        sources.append({"id": source, "file": file, "sha256": digest, "url": source_url(year, target), "lastBookMonthWithRows": max(row["bookMonth"] for row in rows)})
        coverage.append({"period": year, "source": source, "scope": "recipient" if target else "program-line",
                         "sourceTotals": totals(rows), "awardRecipientTotals": totals(included), "otherTotals": totals(excluded)})
        ledger.extend(included)
        if year in TARGET_CHECKS:
            check_file = f"senadis-payment-{year}.json"
            check = load_records(args.captures, check_file, TARGET_CHECKS[year])
            assert sorted(json.dumps(row, sort_keys=True) for row in check) == sorted(
                json.dumps(row, sort_keys=True) for row in raw if row["beneficiario"] == RUT
            ), source
            sources.append({"id": f"rostros-check-{year}", "file": check_file, "sha256": TARGET_CHECKS[year], "url": source_url(year, RUT)})
    groups = []
    for rut, items in sorted(awards_by_rut.items(), key=lambda pair: pair[1][0]["entity"].casefold()):
        assert len({row["entity"] for row in items}) == 1, rut
        period = [row for row in ledger if row["rut"] == rut and row["period"] == 2025]
        assert period, rut
        groups.append({"rut": rut, "entity": items[0]["entity"], "awardCount": len(items),
                       "awardClp": sum(row["awardClp"] for row in items), **totals(period)})
    assert len(ledger) == 285
    grouped = [grouped_check(args.captures, year, [
        row for row in ledger if row["period"] == year and row["rut"] == RUT
    ]) for year in GROUPED_PINS]
    example = list(reconciliation(ledger, awards_by_rut[RUT], [a for a in case["awards"] if a["year"] == 2024]))
    assert monitoring is not None
    edition = {
        "captureDate": "2026-11-12", "currency": "CLP", "sources": sources,
        "awardPdfSha256": "e07f94f90da008bff8024c6cec54094e048e3496ca0b28fe88ee497930a9918e",
        "priorCaseSha256": CASE_SHA256,
        "citations": CITATIONS, "coverage": coverage, "awards": awards, "recipients": groups,
        "ledger": ledger, "rostrosReconciliation": example, "rostrosGroupedApiCheck": grouped,
        "monitoring": monitoring,
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "edition.json").write_text(json.dumps(edition, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (args.output / "awards.csv").write_bytes(AWARD_FILE.read_bytes())
    write_csv(args.output / "ledger.csv", FIELDS, ledger)
    regional_csv = [{"monitoringYear": monitoring["year"], "surveyYear": monitoring["regionalNeed"]["surveyYear"], **region}
                    for region in monitoring["regions"]]
    write_csv(args.output / "regional-comparison.csv", tuple(regional_csv[0]), regional_csv)
    write_csv(args.output / "recipient-comparison.csv",
              ("rut", "entity", "awardCount", "awardClp", "ledgerRows", "accruedClp", "paidClp", "paidReportedIn2026Clp"),
              ({"rut": group["rut"], "entity": group["entity"], "awardCount": group["awardCount"],
                "awardClp": group["awardClp"], "ledgerRows": group["rows"], "accruedClp": group["accruedClp"],
                "paidClp": group["paidClp"], "paidReportedIn2026Clp": group["paidByLastRecordedPaymentYearClp"].get("2026", 0)}
               for group in groups))


if __name__ == "__main__":
    main()
