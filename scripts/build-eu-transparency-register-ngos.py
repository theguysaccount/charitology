#!/usr/bin/env python3
"""
Build EU Transparency Register — Civil Society, NGOs & EU Grants dataset.

Reads the official European Commission / European Parliament / Council of the EU
Transparency Register open-data XML snapshot (18,169 total registrants as of 2026-11-25)
and extracts the 6,317 non-commercial civil-society, research, academic, and religious
organizations across 106 headquarters countries.

Outputs byte-reproducible gzip JSON, UTF-8 BOM CSV, verbatim anomalies.json, and
SHA-256 manifest.json under public/data/funding-flows/eu-transparency-register-ngos/.

Privacy & data-integrity rules:
  - Omits street addresses, postcodes, phone numbers, and personal names of officers.
  - Preserves negative amounts and grants > totalBudget self-reported outliers verbatim
    while disclosing exact counts and examples in anomalies.json.
  - Sanitizes XML 1.1 control-character entity references deterministically and records
    the exact count in anomalies.json.
"""
from __future__ import annotations

import collections
import csv
import gzip
import hashlib
import io
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

PUBLISHER = "Joint Transparency Register Secretariat (European Parliament, Council of the EU & European Commission)"
LICENSE = "European Commission Reuse Policy (Decision 2011/833/EU — CC BY 4.0 equivalent)"
CATALOGUE_URL = "https://transparency-register.europa.eu/open-data_en"
XML_FEED_URL = "https://transparency-register.europa.eu/odplastorganisationxml_en"
PROFILE_PREFIX = "https://transparency-register.europa.eu/searchregister-or-update/organisation-detail_en?id="

DEFAULT_XML = Path(
    "/Users/jack/.gemini/antigravity/brain/6348cb4f-91bf-4102-bc32-46a6b3cb1b39/scratch/wave20/eu-transparency-register-20261125.xml"
)
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = REPO_ROOT / "public" / "data" / "funding-flows" / "eu-transparency-register-ngos"

CATEGORIES = {
    "Non-governmental organisations, platforms and networks and similar": ("ngo", "NGOs, platforms & networks"),
    "Think tanks and research institutions": ("think_tank", "Think tanks & research institutions"),
    "Academic institutions": ("academic", "Academic institutions"),
    "Organisations representing churches and religious communities": ("religious", "Churches & religious communities"),
}

XML11_CTRL_RE = re.compile(r"&#(?:[0-8]|1[12]|1[4-9]|2\d|3[01]|x(?:0?[0-8bcefBCEF]|1[0-9a-fA-F]));")
DOMAIN_RE = re.compile(
    r"^(?:https?://)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)(/[^\s<>@,\"']*)?$",
    re.IGNORECASE,
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def csv_safe(val: Any) -> str:
    s = "" if val is None else str(val)
    if s and s.lstrip(" \t\r\n")[:1] in ("=", "+", "-", "@"):
        return "'" + s
    return s


def sanitize_website(raw: str | None) -> tuple[str | None, bool]:
    if not raw:
        return None, False
    s = raw.strip()
    if not s:
        return None, False
    if any(ch in s for ch in ("@", " ", ">", "<", ",", "\n", "\r")) or s.lower().startswith("javascript:"):
        return None, True
    m = DOMAIN_RE.match(s)
    if not m:
        return None, True
    host = m.group(1).lower()
    tld = host.rsplit(".", 1)[-1]
    if len(tld) < 2 or not tld.isalpha():
        return None, True
    path = m.group(2) or ""
    scheme = "http://" if s.lower().startswith("http://") else "https://"
    return f"{scheme}{host}{path}", False


def parse_eur(el: ET.Element | None) -> tuple[int | None, int | None, int | None]:
    if el is None:
        return None, None, None
    ac = el.find("absoluteCost")
    if ac is not None and ac.text and ac.text.strip():
        try:
            return int(round(float(ac.text.strip()))), None, None
        except ValueError:
            return None, None, None
    mn = el.find("min")
    mx = el.find("max")
    vmn = None
    vmx = None
    if mn is not None and mn.text and mn.text.strip():
        try:
            vmn = int(round(float(mn.text.strip())))
        except ValueError:
            pass
    if mx is not None and mx.text and mx.text.strip():
        try:
            vmx = int(round(float(mx.text.strip())))
        except ValueError:
            pass
    return None, vmn, vmx


def gzip_deterministic(data: bytes) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, compresslevel=9, mtime=0) as gz:
        gz.write(data)
    return buf.getvalue()


def main() -> None:
    xml_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XML
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    out_dir.mkdir(parents=True, exist_ok=True)

    raw_bytes = xml_path.read_bytes()
    raw_sha = sha256_bytes(raw_bytes)
    raw_txt = raw_bytes.decode("utf-8")
    ctrl_stripped = len(XML11_CTRL_RE.findall(raw_txt))
    clean_txt = XML11_CTRL_RE.sub("", raw_txt).replace("version='1.1'", "version='1.0'", 1)

    export_date = ""
    declared_total = 0
    observed_total = 0
    all_categories_count = collections.Counter()

    records: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    by_cat = collections.defaultdict(lambda: {
        "organizations": 0,
        "withBudget": 0,
        "totalBudgetEur": 0,
        "withEuGrants": 0,
        "totalEuGrantsEur": 0,
        "grantItemCount": 0,
    })
    by_country = collections.defaultdict(lambda: {
        "organizations": 0,
        "withEuGrants": 0,
        "totalEuGrantsEur": 0,
    })
    funding_source_counts = collections.Counter()

    exceeds_budget_anomalies: list[dict[str, Any]] = []
    negative_value_anomalies: list[dict[str, Any]] = []
    stripped_website_ids: list[str] = []
    new_org_count = 0

    for _ev, elem in ET.iterparse(io.StringIO(clean_txt), events=("end",)):
        tag = strip_ns(elem.tag)
        if tag == "metaData":
            for c in elem:
                ct = strip_ns(c.tag)
                if ct == "exportDate" and c.text:
                    export_date = c.text.strip()
                elif ct == "numberOfIR" and c.text:
                    declared_total = int(c.text.strip())
            elem.clear()
            continue

        if tag != "interestRepresentative":
            continue

        observed_total += 1
        ic = ""
        name = ""
        acronym = None
        cat_raw = ""
        country = None
        city = None
        reg_date = None
        upd_date = None
        web_raw = None
        fin = None

        for ch in elem:
            ct = strip_ns(ch.tag)
            if ct == "identificationCode" and ch.text:
                ic = ch.text.strip()
            elif ct == "name":
                for sub in ch:
                    if strip_ns(sub.tag) == "originalName" and sub.text:
                        name = sub.text.strip()
            elif ct == "acronym" and ch.text and ch.text.strip():
                acronym = ch.text.strip()
            elif ct == "registrationCategory" and ch.text:
                cat_raw = ch.text.strip()
            elif ct == "registrationDate" and ch.text:
                reg_date = ch.text.strip()[:10]
            elif ct == "lastUpdateDate" and ch.text:
                upd_date = ch.text.strip()[:10]
            elif ct == "webSiteURL" and ch.text:
                web_raw = ch.text.strip()
            elif ct == "headOffice":
                for sub in ch:
                    st = strip_ns(sub.tag)
                    if st == "country" and sub.text and sub.text.strip():
                        country = sub.text.strip().upper()
                    elif st == "city" and sub.text and sub.text.strip():
                        city = sub.text.strip()
            elif ct == "financialData":
                fin = ch

        all_categories_count[cat_raw] += 1
        if cat_raw not in CATEGORIES:
            elem.clear()
            continue

        if ic in seen_ids:
            raise ValueError(f"Duplicate EU Transparency Register ID: {ic}")
        seen_ids.add(ic)

        cat_key, cat_label = CATEGORIES[cat_raw]
        website, was_stripped = sanitize_website(web_raw)
        if was_stripped:
            stripped_website_ids.append(ic)

        new_org = False
        fy_start = None
        fy_end = None
        budget_eur: int | None = None
        eu_grants_eur: int | None = None
        grant_count = 0
        top_grant_sources: list[str] = []
        funding_sources: list[str] = []

        if fin is not None:
            no = fin.find("newOrganisation")
            if no is not None and (no.text or "").strip().lower() == "true":
                new_org = True
                new_org_count += 1
            cy = fin.find("closedYear")
            if cy is not None:
                sd = cy.find("startDate")
                ed = cy.find("endDate")
                if sd is not None and sd.text:
                    fy_start = sd.text.strip()[:10]
                if ed is not None and ed.text:
                    fy_end = ed.text.strip()[:10]

                fs_node = cy.find("fundingSources")
                if fs_node is not None:
                    seen_fs = set()
                    for fs_el in fs_node:
                        src_el = fs_el.find("source")
                        if src_el is not None and src_el.text and src_el.text.strip():
                            val = src_el.text.strip()
                            if val not in seen_fs:
                                seen_fs.add(val)
                                funding_sources.append(val)
                                funding_source_counts[val] += 1

                b_abs, _, _ = parse_eur(cy.find("totalBudget"))
                if b_abs is not None:
                    budget_eur = b_abs
                    if b_abs < 0:
                        negative_value_anomalies.append({
                            "id": ic,
                            "name": name,
                            "field": "totalBudget",
                            "amountEur": b_abs,
                        })

                grs = cy.find("grants")
                if grs is not None:
                    g_total = 0
                    g_items: list[tuple[int, str]] = []
                    for g in grs:
                        g_src = ""
                        s_el = g.find("source")
                        if s_el is not None and s_el.text:
                            g_src = s_el.text.strip()
                        a_abs, _, _ = parse_eur(g.find("amount"))
                        if a_abs is not None:
                            if a_abs < 0:
                                negative_value_anomalies.append({
                                    "id": ic,
                                    "name": name,
                                    "field": "grantAmount",
                                    "amountEur": a_abs,
                                    "source": g_src,
                                })
                            g_total += a_abs
                            grant_count += 1
                            if g_src:
                                g_items.append((a_abs, g_src))
                    eu_grants_eur = g_total
                    g_items.sort(key=lambda x: (-x[0], x[1]))
                    seen_gs = set()
                    for _, gs in g_items:
                        if gs not in seen_gs:
                            seen_gs.add(gs)
                            top_grant_sources.append(gs)
                        if len(top_grant_sources) >= 3:
                            break
                else:
                    eu_grants_eur = 0

        exceeds_budget = bool(
            budget_eur is not None
            and budget_eur > 0
            and eu_grants_eur is not None
            and eu_grants_eur > budget_eur
        )
        eu_share_pct: float | None = None
        if budget_eur is not None and budget_eur > 0 and eu_grants_eur is not None and eu_grants_eur >= 0:
            eu_share_pct = round((eu_grants_eur / budget_eur) * 100.0, 2)

        if exceeds_budget:
            exceeds_budget_anomalies.append({
                "id": ic,
                "name": name,
                "category": cat_key,
                "country": country,
                "euGrantsEur": eu_grants_eur,
                "totalBudgetEur": budget_eur,
                "ratio": round(eu_grants_eur / budget_eur, 2),
            })

        cat_agg = by_cat[cat_key]
        cat_agg["organizations"] += 1
        if budget_eur is not None and budget_eur > 0:
            cat_agg["withBudget"] += 1
            cat_agg["totalBudgetEur"] += budget_eur
        if eu_grants_eur is not None and eu_grants_eur > 0:
            cat_agg["withEuGrants"] += 1
            cat_agg["totalEuGrantsEur"] += eu_grants_eur
            cat_agg["grantItemCount"] += grant_count

        ck_country = country or "UNKNOWN"
        c_agg = by_country[ck_country]
        c_agg["organizations"] += 1
        if eu_grants_eur is not None and eu_grants_eur > 0:
            c_agg["withEuGrants"] += 1
            c_agg["totalEuGrantsEur"] += eu_grants_eur

        records.append({
            "id": ic,
            "name": name,
            "acr": acronym,
            "cat": cat_key,
            "country": country,
            "city": city,
            "reg": reg_date,
            "upd": upd_date,
            "newOrg": new_org,
            "fyEnd": fy_end,
            "budget": budget_eur,
            "grants": eu_grants_eur,
            "gCount": grant_count,
            "gShare": eu_share_pct,
            "gSrc": top_grant_sources,
            "fSrc": funding_sources,
            "anom": exceeds_budget,
            "web": website,
        })
        elem.clear()

    # Deterministic sort: highest EU grants first, then highest budget, then name, then ID
    records.sort(
        key=lambda x: (
            -(x["grants"] if x["grants"] is not None else -1),
            -(x["budget"] if x["budget"] is not None else -1),
            x["name"].casefold(),
            x["id"],
        )
    )

    json_bytes = (json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    gz_bytes = gzip_deterministic(json_bytes)
    (out_dir / "organizations.json.gz").write_bytes(gz_bytes)

    csv_buf = io.StringIO(newline="")
    writer = csv.writer(csv_buf, lineterminator="\r\n")
    writer.writerow([
        "eu_register_id",
        "organization_name",
        "acronym",
        "category",
        "hq_country",
        "hq_city",
        "registered_date",
        "last_updated",
        "closed_year_end",
        "new_organisation",
        "total_budget_eur",
        "eu_grants_eur",
        "eu_grant_item_count",
        "eu_grant_share_pct",
        "grants_exceed_budget_flag",
        "funding_sources",
        "top_eu_grant_sources",
        "website",
        "eu_register_url",
    ])
    for x in records:
        writer.writerow([
            x["id"],
            csv_safe(x["name"]),
            csv_safe(x["acr"]),
            x["cat"],
            csv_safe(x["country"]),
            csv_safe(x["city"]),
            x["reg"] or "",
            x["upd"] or "",
            x["fyEnd"] or "",
            "true" if x["newOrg"] else "false",
            "" if x["budget"] is None else x["budget"],
            "" if x["grants"] is None else x["grants"],
            x["gCount"],
            "" if x["gShare"] is None else x["gShare"],
            "true" if x["anom"] else "false",
            csv_safe(" | ".join(x["fSrc"])),
            csv_safe(" | ".join(x["gSrc"])),
            csv_safe(x["web"]),
            f"{PROFILE_PREFIX}{x['id']}",
        ])
    csv_bytes = b"\xef\xbb\xbf" + csv_buf.getvalue().encode("utf-8")
    (out_dir / "eu-transparency-register-ngos.csv").write_bytes(csv_bytes)

    exceeds_budget_anomalies.sort(key=lambda x: (-x["euGrantsEur"], x["id"]))
    negative_value_anomalies.sort(key=lambda x: (x["amountEur"], x["id"]))

    anomalies = {
        "format": "charitology-eu-transparency-register-anomalies-v1",
        "exportDate": export_date,
        "summary": {
            "xml11ControlCharEntitiesStripped": ctrl_stripped,
            "grantsExceedTotalBudgetCount": len(exceeds_budget_anomalies),
            "negativeFinancialValuesCount": len(negative_value_anomalies),
            "newOrganizationsWithoutClosedYearCount": new_org_count,
            "strippedMalformedWebsitesCount": len(stripped_website_ids),
            "totalCivilSocietyOrganizations": len(records),
            "totalAllRegisterEntities": observed_total,
        },
        "disclosureNote": (
            "All financial figures in the EU Transparency Register are self-reported by registrants. "
            "Fifty-four civil-society organizations reported closed-year EU grants exceeding their reported total annual budget "
            "(often due to multi-year consortium grants entered in a single year or decimal/unit mistakes), and eighteen "
            "financial fields carry negative values. These figures are preserved verbatim and flagged rather than silently edited."
        ),
        "grantsExceedBudgetRecords": exceeds_budget_anomalies,
        "negativeFinancialRecords": negative_value_anomalies,
        "strippedWebsiteIds": sorted(stripped_website_ids),
    }
    anom_bytes = (json.dumps(anomalies, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    (out_dir / "anomalies.json").write_bytes(anom_bytes)

    top_countries = sorted(
        [{"country": k, **v} for k, v in by_country.items()],
        key=lambda x: (-x["totalEuGrantsEur"], -x["organizations"], x["country"]),
    )

    top20_ngos = [
        {
            "id": x["id"],
            "name": x["name"],
            "country": x["country"],
            "fyEnd": x["fyEnd"],
            "grantsEur": x["grants"],
            "budgetEur": x["budget"],
            "grantCount": x["gCount"],
            "exceedsBudget": x["anom"],
        }
        for x in records
        if x["cat"] == "ngo" and (x["grants"] or 0) > 0
    ][:20]

    top15_research_academic = [
        {
            "id": x["id"],
            "name": x["name"],
            "cat": x["cat"],
            "country": x["country"],
            "fyEnd": x["fyEnd"],
            "grantsEur": x["grants"],
            "budgetEur": x["budget"],
            "grantCount": x["gCount"],
            "exceedsBudget": x["anom"],
        }
        for x in records
        if x["cat"] in ("think_tank", "academic") and (x["grants"] or 0) > 0
    ][:15]

    total_grants_eur = sum(v["totalEuGrantsEur"] for v in by_cat.values())
    total_grant_recipients = sum(v["withEuGrants"] for v in by_cat.values())
    total_grant_items = sum(v["grantItemCount"] for v in by_cat.values())
    total_budget_eur = sum(v["totalBudgetEur"] for v in by_cat.values())
    total_with_budget = sum(v["withBudget"] for v in by_cat.values())

    manifest = {
        "format": "charitology-eu-transparency-register-ngos-v1",
        "asOf": export_date[:10],
        "exportDate": export_date,
        "capturedOn": "2026-11-25",
        "publisher": PUBLISHER,
        "license": LICENSE,
        "catalogues": {
            "openDataPortal": CATALOGUE_URL,
            "xmlFeed": XML_FEED_URL,
            "profilePrefix": PROFILE_PREFIX,
        },
        "source": {
            "filename": xml_path.name,
            "url": XML_FEED_URL,
            "bytes": len(raw_bytes),
            "sha256": raw_sha,
            "declaredTotalRegistrants": declared_total,
            "observedTotalRegistrants": observed_total,
        },
        "counts": {
            "allRegisterEntities": observed_total,
            "includedCivilSocietyOrganizations": len(records),
            "distinctHeadquartersCountries": len(by_country),
            "withReportedBudget": total_with_budget,
            "totalReportedBudgetEur": total_budget_eur,
            "withPositiveEuGrants": total_grant_recipients,
            "totalEuGrantsEur": total_grants_eur,
            "totalItemizedEuGrants": total_grant_items,
            "newOrganizations": new_org_count,
            "grantsExceedBudgetCount": len(exceeds_budget_anomalies),
            "negativeFinancialValuesCount": len(negative_value_anomalies),
            "byCategory": {
                k: {"label": CATEGORIES[raw_label][1], **by_cat[k]}
                for raw_label, (k, _) in CATEGORIES.items()
            },
            "fundingSources": dict(funding_source_counts.most_common()),
            "allRegisterCategories": dict(all_categories_count.most_common()),
        },
        "topCountries": top_countries[:25],
        "top20NgosByEuGrants": top20_ngos,
        "top15ResearchAcademicByEuGrants": top15_research_academic,
        "artifacts": {
            "organizations": {
                "path": "organizations.json.gz",
                "bytes": len(gz_bytes),
                "sha256": sha256_bytes(gz_bytes),
                "decodedBytes": len(json_bytes),
                "decodedSha256": sha256_bytes(json_bytes),
            },
            "csv": {
                "path": "eu-transparency-register-ngos.csv",
                "bytes": len(csv_bytes),
                "sha256": sha256_bytes(csv_bytes),
            },
            "anomalies": {
                "path": "anomalies.json",
                "bytes": len(anom_bytes),
                "sha256": sha256_bytes(anom_bytes),
            },
        },
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        f"Built EU Transparency Register civil-society dataset: {len(records):,} orgs across {len(by_country)} countries "
        f"({total_grant_recipients:,} with EUR {total_grants_eur:,} EU grants across {total_grant_items:,} items; "
        f"gz={len(gz_bytes):,} B, csv={len(csv_bytes):,} B)"
    )


if __name__ == "__main__":
    main()
