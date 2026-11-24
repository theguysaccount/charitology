#!/usr/bin/env python3
"""Deterministic builder for the Austria BMF tax-deductible charities index.

Reads the captured official Bundesministerium für Finanzen (BMF) quarterly PDF
`ListebeguenstigterEinrichtungen.pdf` (Stand: 01.10.2026 09:14:28) from an input
directory outside Git using a pure-stdlib PDF content-stream tokenizer (zlib +
WinAnsiEncoding, tracking string literals so tokens such as 'ET' inside names
like 'SAVE TIBET' are never truncated) and writes byte-reproducible JSON/gzip/CSV
artifacts under public/data/charity-registry/austria/.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import pathlib
import re
import unicodedata
import zlib
from collections import Counter, defaultdict

# Official BMF statutory prefix definitions from
# https://service.bmf.gv.at/service/allg/spenden/_start.asp
BMF_PREFIX_CATALOG: dict[str, dict[str, str]] = {
    "FF": {
        "de": "Freiwillige Feuerwehren und Landesfeuerwehrverbände",
        "en": "Volunteer fire brigades and regional fire associations",
        "statute": "§ 4a Abs. 6 Z 12 EStG 1988",
    },
    "SO": {
        "de": "Karitative Einrichtungen",
        "en": "Charitable, humanitarian and social-welfare organizations",
        "statute": "§ 4a Abs. 2 Z 3 EStG 1988",
    },
    "FW": {
        "de": "Wissenschaftseinrichtungen",
        "en": "Research and scientific institutions",
        "statute": "§ 4a Abs. 2 Z 1 EStG 1988",
    },
    "KK": {
        "de": "Einrichtungen Kunst und Kultur; Bundesdenkmalamt, Denkmalfonds und Filminstitut",
        "en": "Arts, culture, heritage and film institutions",
        "statute": "§ 4a Abs. 2 Z 5 / Abs. 6 Z 5 & Z 7 EStG 1988",
    },
    "SP": {
        "de": "Sporteinrichtungen",
        "en": "Nonprofit sports clubs and federations",
        "statute": "§ 4a Abs. 2 Z 6 EStG 1988 (2024 reform)",
    },
    "GM": {
        "de": "Andere gemeinnützige Einrichtungen",
        "en": "Other public-benefit organizations",
        "statute": "§ 4a Abs. 2 Z 7 EStG 1988 (2024 reform)",
    },
    "BI": {
        "de": "Sonstige Bildungseinrichtungen",
        "en": "Other nonprofit educational institutions",
        "statute": "§ 4a Abs. 2 Z 2 EStG 1988 (2024 reform)",
    },
    "NT": {
        "de": "Naturschutzeinrichtungen und Tierheime",
        "en": "Nature conservation bodies and animal shelters",
        "statute": "§ 4a Abs. 2 Z 3 lit. d–e EStG 1988",
    },
    "MP": {
        "de": "Privatmuseen mit überregionaler Bedeutung",
        "en": "Private museums of supraregional significance",
        "statute": "§ 4a Abs. 6 Z 6 lit. b EStG 1988",
    },
    "PA": {
        "de": "Pensionsversicherungsanstalten und Versorgungseinrichtungen",
        "en": "Pension insurance and provident institutions",
        "statute": "§ 18 Abs. 1 Z 1a EStG 1988",
    },
    "UN": {
        "de": "Universitäten, Fachhochschulen, Privathochschulen, Pädagogische Hochschulen, ISTA, IDSA, ÖAW",
        "en": "Universities, applied sciences universities and academies",
        "statute": "§ 4a Abs. 6 Z 1 EStG 1988",
    },
    "ÖK": {
        "de": "Öffentliche Kindergärten",
        "en": "Public kindergartens",
        "statute": "§ 4a Abs. 6 Z 2 lit. a EStG 1988",
    },
    "ÖS": {
        "de": "Öffentliche Schulen",
        "en": "Public schools",
        "statute": "§ 4a Abs. 6 Z 2 lit. a EStG 1988",
    },
    "KR": {
        "de": "Kirchen und Religionsgesellschaften mit verpflichtenden Beiträgen",
        "en": "Churches and recognized religious communities (mandatory contributions)",
        "statute": "§ 18 Abs. 1 Z 5 EStG 1988",
    },
    "PK": {
        "de": "Privatkindergärten von Körperschaften öffentlichen Rechts",
        "en": "Private kindergartens operated by public-law bodies",
        "statute": "§ 4a Abs. 6 Z 2 lit. b EStG 1988",
    },
    "MÖ": {
        "de": "Museen von Körperschaften öffentlichen Rechts",
        "en": "Museums of public-law bodies",
        "statute": "§ 4a Abs. 6 Z 6 lit. a EStG 1988",
    },
    "SV": {
        "de": "Spendensammeleinrichtungen karitativ",
        "en": "Charitable umbrella collection bodies (historic statutory track)",
        "statute": "§ 4a Abs. 2 Z 3 lit. a–c EStG 1988",
    },
    "ZG": {
        "de": "Gemeinnützige Stiftungen (Vermögensausstattung und ggf. Spenden)",
        "en": "Public-benefit foundations (endowment & gift deductions)",
        "statute": "§ 4b EStG 1988",
    },
    "PS": {
        "de": "Privatschulen von Körperschaften öffentlichen Rechts",
        "en": "Private schools operated by public-law bodies",
        "statute": "§ 4a Abs. 6 Z 2 lit. b EStG 1988",
    },
    "ZI": {
        "de": "Innovationsstiftung für Bildung und Substiftungen",
        "en": "Innovation Foundation for Education and sub-foundations",
        "statute": "§ 4c EStG 1988",
    },
    "SE": {
        "de": "Internationale Anti-Korruptions-Akademie; Diplomatische Akademie; UNHCR; Anerkennungsfonds",
        "en": "Statutory international & diplomatic institutions (IACA, Diplomatic Academy, UNHCR)",
        "statute": "§ 4a Abs. 6 EStG 1988",
    },
    "SN": {
        "de": "Sammeleinrichtungen Naturschutz",
        "en": "Nature-conservation collection bodies (historic statutory track)",
        "statute": "§ 4a Abs. 2 Z 3 lit. d–e EStG 1988",
    },
    "AS": {
        "de": "Auslandsschulen",
        "en": "Austrian schools abroad",
        "statute": "§ 4a Abs. 6 Z 2 lit. a EStG 1988",
    },
    "SG": {
        "de": "Gemeinnützige Stiftungen (hinsichtlich Spenden)",
        "en": "Public-benefit foundations (donations track)",
        "statute": "§ 4b EStG 1988",
    },
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_deterministic_gzip(path: pathlib.Path, payload: bytes) -> dict:
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, compresslevel=9, mtime=0) as gz:
        gz.write(payload)
    gz_bytes = buf.getvalue()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gz_bytes)
    return {
        "path": path.name,
        "bytes": len(gz_bytes),
        "sha256": sha256_bytes(gz_bytes),
        "decodedBytes": len(payload),
        "decodedSha256": sha256_bytes(payload),
    }


def normalize_name(name: str) -> str:
    s = name.lower().replace("ß", "ss")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def to_iso_date(ddmmyyyy: str | None) -> str | None:
    if not ddmmyyyy:
        return None
    m = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{4})", ddmmyyyy.strip())
    assert m, f"Invalid German date: {ddmmyyyy!r}"
    dd, mm, yyyy = m.groups()
    return f"{yyyy}-{mm}-{dd}"


def tokenize_pdf_stream(buf: bytes) -> list[tuple[str, str]]:
    """Tokenize a decompressed PDF content stream while honoring (...) literals."""
    n = len(buf)
    i = 0
    tokens: list[tuple[str, str]] = []
    while i < n:
        b = buf[i]
        if b in b" \t\r\n\x0c\x00":
            i += 1
            continue
        if b == 37:  # % comment
            while i < n and buf[i] not in b"\r\n":
                i += 1
            continue
        if b == 40:  # ( literal string
            i += 1
            out = bytearray()
            depth = 1
            while i < n and depth > 0:
                c = buf[i]
                if c == 92:  # backslash escape
                    i += 1
                    if i >= n:
                        break
                    esc = buf[i]
                    if esc in b"01234567":
                        octs = bytes([esc])
                        for _ in range(2):
                            if i + 1 < n and buf[i + 1] in b"01234567":
                                i += 1
                                octs += bytes([buf[i]])
                            else:
                                break
                        out.append(int(octs, 8) & 0xFF)
                    elif esc == ord("n"):
                        out.append(10)
                    elif esc == ord("r"):
                        out.append(13)
                    elif esc == ord("t"):
                        out.append(9)
                    elif esc == ord("b"):
                        out.append(8)
                    elif esc == ord("f"):
                        out.append(12)
                    elif esc == 13:
                        if i + 1 < n and buf[i + 1] == 10:
                            i += 1
                    elif esc == 10:
                        pass
                    else:
                        out.append(esc)
                elif c == 40:
                    depth += 1
                    out.append(c)
                elif c == 41:
                    depth -= 1
                    if depth > 0:
                        out.append(c)
                else:
                    out.append(c)
                i += 1
            tokens.append(("STR", out.decode("cp1252")))
            continue
        if b == 91:
            tokens.append(("ARR_START", "["))
            i += 1
            continue
        if b == 93:
            tokens.append(("ARR_END", "]"))
            i += 1
            continue
        if b == 60:
            if i + 1 < n and buf[i + 1] == 60:
                tokens.append(("DICT_START", "<<"))
                i += 2
            else:
                j = buf.find(b">", i + 1)
                tokens.append(("HEX", buf[i + 1 : j].decode("ascii", "replace")))
                i = j + 1 if j != -1 else n
            continue
        if b == 62:
            i += 2 if (i + 1 < n and buf[i + 1] == 62) else 1
            continue
        if b == 47:
            j = i + 1
            while j < n and buf[j] not in b" \t\r\n\x0c\x00()<>[]{}/%":
                j += 1
            tokens.append(("NAME", buf[i:j].decode("latin1")))
            i = j
            continue
        j = i
        while j < n and buf[j] not in b" \t\r\n\x0c\x00()<>[]{}/%":
            j += 1
        tokens.append(("WORD", buf[i:j].decode("latin1")))
        i = j
    return tokens


def extract_page_items(dec: bytes) -> list[tuple[float, float, str]]:
    toks = tokenize_pdf_stream(dec)
    items: list[tuple[float, float, str]] = []
    in_text = False
    cur_x = 0.0
    cur_y = 0.0
    stack: list[tuple[str, object]] = []
    in_arr = False
    arr_buf: list[tuple[str, str]] = []
    for kind, val in toks:
        if in_arr:
            if kind == "ARR_END":
                stack.append(("ARR", arr_buf))
                in_arr = False
                arr_buf = []
            else:
                arr_buf.append((kind, val))
            continue
        if kind == "ARR_START":
            in_arr = True
            arr_buf = []
            continue
        if kind != "WORD":
            stack.append((kind, val))
            continue
        if val == "BT":
            in_text = True
            cur_x = 0.0
            cur_y = 0.0
            stack.clear()
        elif val == "ET":
            in_text = False
            stack.clear()
        elif in_text and val == "Tm" and len(stack) >= 6:
            cur_x = float(str(stack[-2][1]))
            cur_y = float(str(stack[-1][1]))
            stack.clear()
        elif in_text and val in ("Td", "TD") and len(stack) >= 2:
            cur_x += float(str(stack[-2][1]))
            cur_y += float(str(stack[-1][1]))
            stack.clear()
        elif in_text and val == "TJ" and stack and stack[-1][0] == "ARR":
            arr_items = stack[-1][1]
            assert isinstance(arr_items, list)
            txt = "".join(v for k, v in arr_items if k == "STR")
            if txt:
                items.append((round(cur_y, 2), round(cur_x, 2), txt))
            stack.clear()
        elif in_text and val == "Tj" and stack and stack[-1][0] == "STR":
            txt = str(stack[-1][1])
            if txt:
                items.append((round(cur_y, 2), round(cur_x, 2), txt))
            stack.clear()
        elif val in (
            "Tf", "re", "W*", "n", "gs", "g", "G", "f*", "q", "Q",
            "BMC", "BDC", "EMC", "cm", "rg", "RG", "w", "m", "l", "S", "f",
        ):
            stack.clear()
        else:
            stack.append((kind, val))
    return items


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True, type=pathlib.Path)
    parser.add_argument("--out-dir", required=True, type=pathlib.Path)
    parser.add_argument("--captured-on", default="2026-11-24")
    args = parser.parse_args()

    pdf_path = args.input_dir / "ListebeguenstigterEinrichtungen.pdf"
    raw_bytes = pdf_path.read_bytes()
    raw_sha = sha256_bytes(raw_bytes)

    streams = re.findall(rb"stream\r?\n(.*?)\r?\nendstream", raw_bytes, re.S)
    text_streams: list[bytes] = []
    for s in streams:
        try:
            dec = zlib.decompress(s)
        except Exception:
            continue
        if b"BT" in dec and b"Tm" in dec:
            text_streams.append(dec)

    assert len(text_streams) == 185, f"Expected 185 text pages, found {len(text_streams)}"

    stand_line: str | None = None
    records: list[dict] = []
    seen_codes: set[str] = set()

    for page_no, dec in enumerate(text_streams, 1):
        page_items = extract_page_items(dec)
        data_items: list[tuple[float, float, str]] = []
        for y, x, txt in page_items:
            if page_no == 1 and (txt.startswith("Stand:") or y > 700):
                if txt.startswith("Stand:"):
                    stand_line = txt.strip()
                continue
            if not txt.strip():
                continue
            data_items.append((y, x, txt))

        codes = sorted([it for it in data_items if 270 <= it[1] <= 310], key=lambda t: -t[0])
        froms = {round(it[0], 1): it[2].strip() for it in data_items if 380 <= it[1] <= 410}
        tos = {round(it[0], 1): it[2].strip() for it in data_items if 430 <= it[1] <= 470}
        names = sorted([it for it in data_items if it[1] < 270], key=lambda t: (-t[0], t[1]))
        others = [
            it
            for it in data_items
            if not (it[1] < 270 or 270 <= it[1] <= 310 or 380 <= it[1] <= 410 or 430 <= it[1] <= 470)
        ]
        assert not others, f"Unexpected coordinates on page {page_no}: {others}"

        top_code_y = codes[0][0] if codes else -999
        for ny, nx, ntxt in names:
            assert ny <= top_code_y + 0.6, f"Orphan top name line on page {page_no}: {(ny, nx, ntxt)}"

        for ci, (cy, _cx, ctxt) in enumerate(codes):
            next_cy = codes[ci + 1][0] if ci + 1 < len(codes) else -999
            row_parts = sorted(
                [it for it in names if next_cy + 0.6 < it[0] <= cy + 0.6],
                key=lambda t: (-t[0], t[1]),
            )
            full_name = re.sub(r"\s+", " ", "".join(t[2] for t in row_parts).strip())
            code = ctxt.strip()
            assert full_name, f"Empty organization name for code {code} on page {page_no}"
            assert not any(ord(ch) < 32 or ch == "\ufffd" for ch in full_name), f"Control/replacement char in {code}"
            m_code = re.fullmatch(r"([A-ZÄÖÜ]{2,3})-(\d+)", code)
            assert m_code, f"Unexpected BMF code format: {code!r}"
            prefix = m_code.group(1)
            assert prefix in BMF_PREFIX_CATALOG, f"Unknown BMF prefix {prefix!r} in {code!r}"
            assert code not in seen_codes, f"Duplicate BMF code: {code}"
            seen_codes.add(code)

            valid_from = to_iso_date(froms.pop(round(cy, 1), None))
            valid_to = to_iso_date(tos.pop(round(cy, 1), None))
            if valid_from and valid_to:
                assert valid_from <= valid_to, f"Inverted dates for {code}: {valid_from} > {valid_to}"

            records.append(
                {
                    "code": code,
                    "prefix": prefix,
                    "name": full_name,
                    "norm": normalize_name(full_name),
                    "validFrom": valid_from,
                    "validTo": valid_to,
                    "active": valid_to is None,
                }
            )

        assert not froms, f"Unmatched validFrom dates on page {page_no}: {froms}"
        assert not tos, f"Unmatched validTo dates on page {page_no}: {tos}"

    assert stand_line == "Stand: 01.10.2026 09:14:28", f"Unexpected Stand header: {stand_line!r}"
    as_of = "2026-10-01"
    # Verify all validTo rows expired strictly prior to snapshot date
    future_end = [r for r in records if r["validTo"] is not None and r["validTo"] >= as_of]
    assert not future_end, f"Unexpected non-expired validTo rows: {future_end[:5]}"

    records.sort(key=lambda r: (r["norm"], r["code"]))

    # Compute deterministic counts and statutory breakdowns
    by_prefix_total = Counter(r["prefix"] for r in records)
    by_prefix_active = Counter(r["prefix"] for r in records if r["active"])
    by_prefix_expired = Counter(r["prefix"] for r in records if not r["active"])
    by_prefix_dated = Counter(r["prefix"] for r in records if r["validFrom"] is not None)

    categories = []
    for prefix, total in sorted(by_prefix_total.items(), key=lambda kv: (-kv[1], kv[0])):
        meta = BMF_PREFIX_CATALOG[prefix]
        categories.append(
            {
                "prefix": prefix,
                "labelDe": meta["de"],
                "labelEn": meta["en"],
                "statute": meta["statute"],
                "total": total,
                "active": by_prefix_active[prefix],
                "expired": by_prefix_expired[prefix],
                "withValidFrom": by_prefix_dated[prefix],
            }
        )

    unused_official_prefixes = sorted(set(BMF_PREFIX_CATALOG.keys()) - set(by_prefix_total.keys()))

    by_valid_from_year = Counter(r["validFrom"][:4] for r in records if r["validFrom"] is not None)
    recent_years = {str(y): by_valid_from_year.get(str(y), 0) for y in range(2019, 2027)}
    reform_2024_2026 = sum(
        1 for r in records if r["validFrom"] is not None and r["validFrom"] >= "2024-01-01"
    )

    valid_to_without_from = [
        {"code": r["code"], "name": r["name"], "validFrom": r["validFrom"], "validTo": r["validTo"]}
        for r in records
        if r["validFrom"] is None and r["validTo"] is not None
    ]

    by_name: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        by_name[r["name"]].append(r)
    repeated_names = {k: v for k, v in by_name.items() if len(v) > 1}
    repeated_name_rows = sum(len(v) for v in repeated_names.values())
    renewed_orgs = [
        {
            "name": name,
            "codes": [
                {"code": x["code"], "validFrom": x["validFrom"], "validTo": x["validTo"], "active": x["active"]}
                for x in sorted(items, key=lambda it: (it["validFrom"] or "", it["code"]))
            ],
        }
        for name, items in sorted(repeated_names.items())
        if any(x["active"] for x in items) and any(not x["active"] for x in items)
    ]

    anomalies = {
        "format": "charitology-austria-bmf-anomalies-v1",
        "asOf": as_of,
        "standLine": stand_line,
        "summary": {
            "validToWithoutValidFromCount": len(valid_to_without_from),
            "undatedValidFromCount": sum(1 for r in records if r["validFrom"] is None),
            "phasedOutCollectionCategories": {
                "SV": {"total": by_prefix_total["SV"], "active": by_prefix_active["SV"], "expired": by_prefix_expired["SV"]},
                "SN": {"total": by_prefix_total["SN"], "active": by_prefix_active["SN"], "expired": by_prefix_expired["SN"]},
            },
            "repeatedExactNamesCount": len(repeated_names),
            "repeatedExactNameRows": repeated_name_rows,
            "namesWithExpiredAndActiveCodes": len(renewed_orgs),
            "unusedOfficialDropdownPrefixes": unused_official_prefixes,
        },
        "notes": [
            "BMF omits Gültig-Ab (validFrom) on 5,597 of 8,577 registrations (65.3%), predominantly ex-lege statutory entities (volunteer fire brigades FF, universities UN, public schools/kindergartens ÖS/ÖK, churches KR) and select post-2024 reform entries. These remain explicit null rather than estimated dates.",
            "31 registrations carry a Gültig-Bis expiry date with Gültig-Ab omitted (validFrom = null). All 31 are preserved verbatim.",
            "All 26 SV (charitable umbrella collection bodies) and 1 SN (nature collection body) registrations carry historical Gültig-Bis expiry dates (0 currently open-ended).",
            "419 exact organization names appear under multiple distinct BMF registration codes (907 rows total), combining distinct municipal volunteer fire brigades sharing a village name (e.g. 5 distinct Freiwillige Feuerwehr Aigen) and organizations whose historical code expired before a renewed active registration was issued.",
            "Two official BMF web-search dropdown categories (AS Auslandsschulen and SG gemeinnützige Stiftungen Spenden) have zero rows in the 2026-10-01 quarterly PDF snapshot.",
        ],
        "validToWithoutValidFrom": valid_to_without_from,
        "sampleNamesWithExpiredAndActiveCodes": renewed_orgs[:20],
    }

    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    payload_bytes = json.dumps(records, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    org_artifact = write_deterministic_gzip(out_dir / "organizations.json.gz", payload_bytes)
    org_artifact["rows"] = len(records)

    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf, lineterminator="\n")
    writer.writerow(["bmf_code", "prefix", "category_en", "name", "valid_from", "valid_to", "status"])
    for r in records:
        writer.writerow(
            [
                r["code"],
                r["prefix"],
                BMF_PREFIX_CATALOG[r["prefix"]]["en"],
                r["name"],
                r["validFrom"] or "",
                r["validTo"] or "",
                "active" if r["active"] else "expired",
            ]
        )
    csv_bytes = csv_buf.getvalue().encode("utf-8")
    csv_path = out_dir / "austria-bmf-charities.csv"
    csv_path.write_bytes(csv_bytes)

    anomalies_bytes = (json.dumps(anomalies, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    anomalies_path = out_dir / "anomalies.json"
    anomalies_path.write_bytes(anomalies_bytes)

    manifest = {
        "format": "charitology-austria-registry-v1",
        "jurisdiction": "Austria",
        "publisher": "Bundesministerium für Finanzen (Austrian Federal Ministry of Finance — BMF)",
        "editionTitle": "Liste begünstigter Einrichtungen (Spenden, Kirchenbeiträge u.a.) — Stand 01.10.2026",
        "asOf": as_of,
        "standLine": stand_line,
        "capturedOn": args.captured_on,
        "catalogues": {
            "bmfSearchPortal": "https://service.bmf.gv.at/service/allg/spenden/_start.asp",
            "bmfQuarterlyPdf": "https://service.bmf.gv.at/service/allg/spenden/ListebeguenstigterEinrichtungen.pdf",
            "bmfReformGuide": "https://www.bmf.gv.at/themen/steuern/spenden-gemeinnuetzigkeit/spendenbeguenstigung-neu.html",
            "zvrPortal": "https://citizen.bmi.gv.at/at.gv.bmi.fnsweb-p/zvr/public/Registerauszug",
        },
        "sourceCapture": {
            "filename": pdf_path.name,
            "bytes": len(raw_bytes),
            "sha256": raw_sha,
            "pages": len(text_streams),
            "lastModified": "2026-10-01T07:24:55Z",
            "url": "https://service.bmf.gv.at/service/allg/spenden/ListebeguenstigterEinrichtungen.pdf",
        },
        "counts": {
            "includedOrganizations": len(records),
            "uniqueBmfCodes": len(seen_codes),
            "distinctExactNames": len(by_name),
            "activeOpenEnded": sum(1 for r in records if r["active"]),
            "expiredWithValidTo": sum(1 for r in records if not r["active"]),
            "withValidFrom": sum(1 for r in records if r["validFrom"] is not None),
            "withoutValidFrom": sum(1 for r in records if r["validFrom"] is None),
            "validToWithoutValidFrom": len(valid_to_without_from),
            "reformCohort2024To2026Dated": reform_2024_2026,
            "populatedCategories": len(categories),
            "earliestValidFrom": min(r["validFrom"] for r in records if r["validFrom"] is not None),
            "latestValidFrom": max(r["validFrom"] for r in records if r["validFrom"] is not None),
            "earliestValidTo": min(r["validTo"] for r in records if r["validTo"] is not None),
            "latestValidTo": max(r["validTo"] for r in records if r["validTo"] is not None),
            "recentValidFromByYear": recent_years,
        },
        "categories": categories,
        "artifacts": {
            "organizations": org_artifact,
            "csv": {
                "path": csv_path.name,
                "bytes": len(csv_bytes),
                "sha256": sha256_bytes(csv_bytes),
                "rows": len(records),
            },
            "anomalies": {
                "path": anomalies_path.name,
                "bytes": len(anomalies_bytes),
                "sha256": sha256_bytes(anomalies_bytes),
            },
        },
    }

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Built Austria BMF index: {len(records)} unique BMF codes "
        f"({manifest['counts']['activeOpenEnded']} active, {manifest['counts']['expiredWithValidTo']} expired, "
        f"{len(categories)} categories, gzip={org_artifact['bytes']:,} bytes)"
    )


if __name__ == "__main__":
    main()
