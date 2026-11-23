#!/usr/bin/env python3
"""Deterministic builder for Sweden's Svensk Insamlingskontroll 90-konto registry
and 2025 audited fundraising statistics explorer.

Reads captured primary files from an input directory outside Git and emits
byte-reproducible JSON/gzip/CSV artifacts under:
  - public/data/charity-registry/sweden/
  - public/data/funding-flows/sweden-90-konto/

Privacy boundary: phone numbers, personal email addresses, and street addresses
are intentionally stripped and never written to published outputs.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import html
import io
import json
import pathlib
import re
import subprocess
import unicodedata
from collections import Counter


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
    s = name.lower()
    s = s.replace("å", "a").replace("ä", "a").replace("ö", "o").replace("é", "e")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def extract_pdf_text(pdf_path: pathlib.Path) -> str:
    txt_sibling = pdf_path.with_suffix(".txt")
    if txt_sibling.exists():
        return txt_sibling.read_text(encoding="utf-8")
    swift_code = (
        "import Foundation; import PDFKit; "
        "let url = URL(fileURLWithPath: CommandLine.arguments[1]); "
        "guard let doc = PDFDocument(url: url) else { exit(2) }; "
        "for i in 0..<doc.pageCount { "
        "  print(\"=== PAGE \\(i+1) ===\"); "
        "  print(doc.page(at: i)?.string ?? \"\"); "
        "}"
    )
    out = subprocess.check_output(["swift", "-e", swift_code, str(pdf_path)], text=True)
    return out


def parse_int_or_none(raw: str) -> int | None:
    cleaned = re.sub(r"[\s\u00a0]+", "", raw).strip()
    if re.fullmatch(r"-?\d+", cleaned):
        return int(cleaned)
    return None


def parse_pct_or_none(raw: str) -> int | None:
    m = re.search(r"(-?\d+)\s*%", raw)
    return int(m.group(1)) if m else None


def parse_key_figures(card_html: str) -> tuple[dict | None, bool]:
    """Return (financials_dict_or_none, had_duplicate_year_columns)."""
    m_kf = re.search(r'<div class="key-figures[^>]*>(.*?)</div>', card_html, re.S)
    if not m_kf:
        return None, False
    kf = m_kf.group(1)
    trs = re.findall(r"<tr>(.*?)</tr>", kf, re.S)
    if len(trs) < 3:
        return None, False

    raw_years = [
        re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", x)).strip()
        for x in re.findall(r"<th[^>]*>(.*?)</th>", trs[0], re.S)
    ][1:]
    had_dup_year = len(raw_years) != len(set(raw_years))

    revs = [
        re.sub(r"<[^>]+>", "", x).strip()
        for x in re.findall(r"<td[^>]*>(.*?)</td>", trs[1], re.S)
    ]
    eqs = [
        re.sub(r"<[^>]+>", "", x).strip()
        for x in re.findall(r"<td[^>]*>(.*?)</td>", trs[2], re.S)
    ]

    # When Svensk Insamlingskontroll CMS emits repeated year columns (e.g. 5x '2025'
    # with truncated prefix numbers on the left), the rightmost column holds the full value.
    by_year: dict[str, dict[str, int | None]] = {}
    for idx, yr in enumerate(raw_years):
        if not re.fullmatch(r"20\d\d", yr):
            continue
        rev_val = parse_int_or_none(revs[idx]) if idx < len(revs) else None
        eq_val = parse_int_or_none(eqs[idx]) if idx < len(eqs) else None
        by_year[yr] = {"revenueTkr": rev_val, "equityTkr": eq_val}

    admin_pct: int | None = None
    purpose_pct: int | None = None
    for tr in trs[3:]:
        th_m = re.search(r"<th[^>]*>(.*?)</th>", tr, re.S)
        td_m = re.search(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if not th_m or not td_m:
            continue
        lbl = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", th_m.group(1))).strip().lower()
        val = parse_pct_or_none(re.sub(r"<[^>]+>", "", td_m.group(1)))
        if "administrationskostnader" in lbl:
            admin_pct = val
        elif "ändamålskostnader" in lbl or "andamalskostnader" in lbl:
            purpose_pct = val

    ordered_years = sorted(by_year.keys())
    if not ordered_years and admin_pct is None and purpose_pct is None:
        return None, had_dup_year

    latest_yr = ordered_years[-1] if ordered_years else None
    return (
        {
            "years": [
                {
                    "year": int(yr),
                    "revenueTkr": by_year[yr]["revenueTkr"],
                    "equityTkr": by_year[yr]["equityTkr"],
                }
                for yr in ordered_years
            ],
            "latestYear": int(latest_yr) if latest_yr else None,
            "latestRevenueTkr": by_year[latest_yr]["revenueTkr"] if latest_yr else None,
            "latestEquityTkr": by_year[latest_yr]["equityTkr"] if latest_yr else None,
            "adminPct3y": admin_pct,
            "purposePct3y": purpose_pct,
        },
        had_dup_year,
    )


def parse_gift_block(card_html: str) -> dict:
    m_gift = re.search(r'<div class="gift[^>]*>(.*?)</div>', card_html, re.S)
    if not m_gift:
        return {"orgNr": None, "since": None, "bg": [], "pg": [], "swish": []}
    g = m_gift.group(1)

    def extract_field(label: str) -> str | None:
        m = re.search(
            rf"<strong>{re.escape(label)}</strong>(.*?)</span>",
            g,
            re.S | re.I,
        )
        if not m:
            return None
        txt = html.unescape(re.sub(r"<br\s*/?>", ",", m.group(1)))
        txt = re.sub(r"<[^>]+>", " ", txt)
        txt = re.sub(r"\s+", " ", txt).strip()
        return txt or None

    def extract_accounts(label: str) -> list[str]:
        val = extract_field(label)
        if not val:
            return []
        parts = [re.sub(r"\s+", "", p) for p in val.split(",")]
        return [p for p in parts if p]

    org_nr_raw = extract_field("Org nr:")
    org_nr = re.sub(r"\s+", "", org_nr_raw) if org_nr_raw else None
    since_raw = extract_field("90-konto sedan:")
    since = int(since_raw) if since_raw and re.fullmatch(r"\d{4}", since_raw) else None

    return {
        "orgNr": org_nr,
        "since": since,
        "bg": extract_accounts("BG:"),
        "pg": extract_accounts("PG:"),
        "swish": extract_accounts("Swish:"),
    }


def parse_top_pdf(pdf_path: pathlib.Path) -> list[dict]:
    txt = extract_pdf_text(pdf_path)
    rows: list[dict] = []
    for line in txt.splitlines():
        m = re.match(r"^\s*(\d+)\)\s+(.+?)\s+(\d[\d\s]*)\s*$", line)
        if m:
            rows.append(
                {
                    "rank": int(m.group(1)),
                    "reportName": m.group(2).strip(),
                    "norm": normalize_name(m.group(2).strip()),
                    "amountMkr": int(m.group(3).replace(" ", "")),
                }
            )
    rows.sort(key=lambda r: r["rank"])
    return rows


def parse_yearbook_summary(pdf_path: pathlib.Path) -> list[dict]:
    """Parse exact 2023-2025 audited tabular totals from pages 2-3 of insamlingsaret-2025.pdf."""
    txt = extract_pdf_text(pdf_path)

    def grab_three_ints(pattern: str) -> tuple[int, int, int]:
        m = re.search(pattern, txt, re.S)
        assert m, f"Could not find yearbook metric matching: {pattern}"
        nums = [int(x.replace(" ", "")) for x in (m.group(1), m.group(2), m.group(3))]
        return nums[0], nums[1], nums[2]  # (2025, 2024, 2023)

    def grab_three_pcts(pattern: str) -> tuple[float, float, float]:
        m = re.search(pattern, txt, re.S | re.M)
        assert m, f"Could not find yearbook pct matching: {pattern}"
        vals = [float(x.replace(",", ".")) for x in (m.group(1), m.group(2), m.group(3))]
        return vals[0], vals[1], vals[2]  # (2025, 2024, 2023)

    num_rx = r"(\d{1,2}\s\d{3}|\d{3,4})"
    pct_rx = r"(\d{1,2},\d)%"

    priv = grab_three_ints(rf"Privatpersoner\s*\([^)]+\)\s+{num_rx}\s+{num_rx}\s+{num_rx}")
    gov = grab_three_ints(rf"Myndigheter\s*\([^)]+\)\s+{num_rx}\s+{num_rx}\s+{num_rx}")
    orgs = grab_three_ints(rf"Stiftelser/föreningar\s*\([^)]+\)\s+{num_rx}\s+{num_rx}\s+{num_rx}")
    corp = grab_three_ints(rf"Företag/Näringsliv\s*\([^)]+\)\s+{num_rx}\s+{num_rx}\s+{num_rx}")
    gifts = grab_three_ints(rf"Insamlade Gåvor/bidrag\s*\([^)]+\)\s+{num_rx}\s+{num_rx}\s+{num_rx}")
    other = grab_three_ints(rf"Övriga intäkter,\s*inkl\.\s*finansnetto\s+{num_rx}\s+{num_rx}\s+{num_rx}")
    total_rev = grab_three_ints(rf"Totala intäkter\s*\([^)]+\)\s+{num_rx}\s+{num_rx}\s+{num_rx}")

    purpose_mkr = grab_three_ints(rf"Ändamålskostnader\s+{num_rx}\s+{num_rx}\s+{num_rx}")
    purpose_pct = grab_three_pcts(rf"Ändamålsuppfyllelsen? i %\s+{pct_rx}\s+{pct_rx}\s+{pct_rx}")
    fundraising_mkr = grab_three_ints(rf"Insamlingskostnader\s+{num_rx}\s+{num_rx}\s+{num_rx}")
    fundraising_pct = grab_three_pcts(rf"\(i %\)\s+\({pct_rx}\)\s+\({pct_rx}\)\s+\({pct_rx}\)")
    admin_mkr = grab_three_ints(rf"Övriga administrationskostnader\s+{num_rx}\s+{num_rx}\s+{num_rx}")
    admin_pct = grab_three_pcts(rf"Övriga administrationskostnader.*?^\(i %\)\s+\({pct_rx}\)\s+\({pct_rx}\)\s+\({pct_rx}\)")
    combined_pct = grab_three_pcts(rf"administrationskostnader i %\s+{pct_rx}\s+{pct_rx}\s+{pct_rx}")
    equity_mkr = grab_three_ints(rf"S:a Eget kapital\s+{num_rx}\s+{num_rx}\s+{num_rx}")

    # Active org count 2023/2024/2025 from page 4 chart labels (449, 462, 481) verified against page 22 text
    assert "462 för år 2024 till 481 stycken för år 2025" in txt, "Expected 2024/2025 org counts in yearbook"
    org_counts = (481, 462, 449)

    years = [2025, 2024, 2023]
    out = []
    for i, yr in enumerate(years):
        assert priv[i] + gov[i] + orgs[i] + corp[i] == gifts[i], f"Gift sum mismatch in {yr}"
        assert gifts[i] + other[i] == total_rev[i], f"Revenue sum mismatch in {yr}"
        out.append(
            {
                "year": yr,
                "auditedOrganizations": org_counts[i],
                "privateIndividualsMkr": priv[i],
                "publicAuthoritiesMkr": gov[i],
                "foundationsAndOrgsMkr": orgs[i],
                "corporationsMkr": corp[i],
                "collectedGiftsAndGrantsMkr": gifts[i],
                "otherIncomeInclFinancialMkr": other[i],
                "totalRevenueMkr": total_rev[i],
                "purposeCostsMkr": purpose_mkr[i],
                "purposeSharePct": purpose_pct[i],
                "fundraisingCostsMkr": fundraising_mkr[i],
                "fundraisingSharePct": fundraising_pct[i],
                "otherAdminCostsMkr": admin_mkr[i],
                "otherAdminSharePct": admin_pct[i],
                "combinedFundraisingAdminPct": combined_pct[i],
                "totalEquityMkr": equity_mkr[i],
            }
        )
    out.sort(key=lambda r: r["year"])
    return out


# Explicit, verified name-normalization aliases linking Svensk Insamlingskontroll's
# abbreviated Topp-110 / Topp-100 PDF display labels to exact active 90-konto registry slugs.
REPORT_TO_SLUG_ALIASES: dict[str, str] = {
    "radda barnen": "radda-barnens-riksforbund",
    "cancerfonden": "cancerfonden-riksforeningen-mot-cancer",
    "roda korset": "svenska-roda-korset",
    "unicef": "unicef-sverige",
    "svenska kyrkan act": "trossamfundet-svenska-kyrkan",
    "lakare utan granser": "lakare-utan-granser",
    "hjart lungfonden": "hjart-lungfonden-svenska-nationalforeningen-mot-hjart-och-lungsjukdomar",
    "fryshuset": "stiftelsen-fryshuset",
    "lakarmission": "lakarmissionen-stiftelse-for-filantropisk-verksamhet",
    "varldsnaturfonden wwf": "stiftelsen-varldsnaturfonden-wwf",
    "barncancerfonden": "barncancerfonden",
    "stockholm stadsmission": "stockholms-stadsmission",
    "hjarnfonden": "hjarnfonden",
    "fralsningsarmen": "fralsningsarmen",
    "sos barnbyar": "sos-barnbyar-sverige",
    "plan sverige": "plan-international-sverige-insamlingsstiftelse",
    "plan international": "plan-international-sverige-insamlingsstiftelse",
    "unhcr": "sverige-for-unhcr-insamlingsstiftelse",
    "sverige for unhcr": "sverige-for-unhcr-insamlingsstiftelse",
    "naturskyddsforeningen": "svenska-naturskyddsforeningen",
    "diakonia": "diakonia",
    "we effekt": "we-effect",
    "we effect": "we-effect",
    "raddningsmissionen": "foreningen-goteborgs-raddningsmission",
    "greenpeace": "foreningen-greenpeace-norden",
    "islamic relief": "islamic-relief-sverige",
    "operation smile": "insamlingsstiftelsen-operation-smile-sverige-ii",
    "goteborgs stadsmission": "stiftelsen-goteborgs-kyrkliga-stadsmission",
    "goteborgs kyrkliga stadsmission": "stiftelsen-goteborgs-kyrkliga-stadsmission",
    "pingst": "pingst-fria-forsamlingar-i-samverkan-pmu",
    "amnesty international": "amnesty-international-svenska-sektionen",
    "amnesty": "amnesty-international-svenska-sektionen",
    "bris": "riksforbundet-bris-barnens-ratt-i-samhallet",
    "rfsu": "rfsu-riksforbundet-for-sexuell-upplysning",
    "erikshjalpen": "insamlingsstiftelsen-erikshjalpen-farbror-eriks-barn-och-hjalpverksamhet",
    "majblomman": "majblommans-riksforbund",
    "im individuell manniskohjalp": "im-individuell-manniskohjalp-swedish-development-partner",
    "sok": "sveriges-olympiska-kommitte",
    "sipri": "sipri-stiftelsen-stockholms-internationella-fredsforskningsinstitut",
    "hand in hand": "foreningen-hand-in-hand-sweden",
    "sallskapet for medicinsk forskning": "svenska-sallskapet-for-medicinsk-forskning",
    "sportfiskarna": "sveriges-sportfiske-och-fiskevardsforbund-sportfiskarna",
    "hundstallet": "hundstallet-svenska-hundskyddsforeningen",
    "berta kamprads stiftelse": "fru-berta-kamprads-stiftelse-for-utforskning-och-bekampning-av-cancersjukdomar",
    "barnfonden": "barnfondens-insamlingsstiftelse",
    "rescue": "international-rescue-committee-sverige",
    "water aid": "insamlingsstiftelsen-wateraid-sverige",
    "wateraid": "insamlingsstiftelsen-wateraid-sverige",
    "sveriges stadsmissioner": "riksforeningen-sveriges-stadsmissioner",
    "evangeliska fosterlands stiftelsen": "efs-evangeliska-fosterlandsstiftelsen",
    "baltic waters": "insamlingsstiftelsen-baltic-waters-2030",
    "human bridge": "human-bridge-stiftelse",
    "vi skogen": "insamlingsstiftelsen-vi-planterar-trad-vi-skogen",
    "right livelihood award": "right-livelihood-award-stiftelsen",
    "parasportforbundet": "svenska-parasportforbundet-och-sveriges-paralympiska-kommitte",
    "oxfam": "insamlingsstiftelsen-oxfam-sverige",
    "artikel": "emmaus-stockholm",
    "ersta diakonisallskapet": "ersta-diakonisallskap",
    "mercy ships": "mercy-ships-sverige-insamlingsstiftelse",
    "diabetes wellness": "insamlingsstiftelsen-diabetes-wellness-network-sverige",
    "human rights watch": "human-rights-watch-scandinavia-insamlingsstiftelsen",
    "world animal protection": "world-animal-protection-sverige",
    "hjartlung": "riksforbundet-hjartlung",
    "childhood": "stiftelsen-world-childhood-foundation",
    "afghanistankommitten": "svenska-afghanistankommitten",
    "svenska afghanistankommitten": "svenska-afghanistankommitten",
    "jubileumsklinikens cancerfond": "stiftelsen-jubileumsklinikens-forskningsfond-mot-cancer",
    "peace parks foundation": "peace-parks-foundation-sweden",
    "romerska katolska kyrkan": "trossamfundet-romersk-katolska-kyrkan",
    "hoppets stjarna": "hoppets-stjarna-insamlingsstiftelse",
    "nyckelfonden": "stiftelsen-for-medicinsk-forskning-vid-universitetssjukhuset-orebro-nyckelfonden",
    "star for life": "star-for-life-insamlingsstiftelse",
    "compassion": "compassion-sverige",
    "mentor sverige": "mentor-sverige-insamlingsstiftelse",
    "actionaid": "action-aid-international-sweden",
    "kvinna till kvinna": "stiftelsen-kvinna-till-kvinna",
    "stadsmissionen i skane": "skane-stadsmission",
    "alzheimerfonden": "alzheimerfonden",
    "suicide zero": "suicide-zero",
    "maskrosbarn": "maskrosbarn",
    "mind": "mind",
    "min stora dag": "min-stora-dag",
    "musikhjalpen": "stiftelsen-radiohjalpen",
    "radiohjalpen": "stiftelsen-radiohjalpen",
    "amref": "amref-health-africa-norden",
    "reach for change": "stiftelsen-reach-for-change",
    "prostatacancerforbundet": "prostatacancerforbundet",
    "brostcancerforbundet": "brostcancerforbundet",
    "cancerrehabfonden": "cancerrehabfonden",
    "diabetesfonden": "svenska-diabetesforbundets-forskningsfond",
    "barnens raddningsark": "barnens-raddningsark",
    "svenska sjoraddningssallskapet": "svenska-sjoraddningssallskapet",
    "sjoraddningssallskapet": "svenska-sjoraddningssallskapet",
    "djurens ratt": "djurens-ratt",
    "vasteras stadsmission": "vasteras-stadsmission",
    "kalmar stadsmission": "kalmar-stadsmission",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True, type=pathlib.Path)
    parser.add_argument("--reg-out-dir", required=True, type=pathlib.Path)
    parser.add_argument("--flow-out-dir", required=True, type=pathlib.Path)
    parser.add_argument("--captured-on", default="2026-11-23")
    args = parser.parse_args()

    in_dir = args.input_dir

    # Load WP taxonomies
    def load_tax(fname: str) -> dict[int, str]:
        arr = json.loads((in_dir / fname).read_text(encoding="utf-8"))
        return {int(x["id"]): html.unescape(x["name"]).strip() for x in arr}

    tax_purpose = load_tax("organization_purpose.json")
    tax_area = load_tax("organization_business_area.json")
    tax_region = load_tax("organization_region.json")
    tax_region_se = load_tax("organization_region_sweden.json")

    wp_orgs = json.loads((in_dir / "organizations.json").read_text(encoding="utf-8"))
    wp_by_slug = {o["slug"]: o for o in wp_orgs}

    status_map = [
        ("90-account", "active", "directory-90-account.json"),
        ("withdrawn", "withdrawn", "directory-withdrawn.json"),
        ("finished", "finished", "directory-finished.json"),
    ]

    records: list[dict] = []
    seen_slugs: set[str] = set()
    dup_year_orgs: list[dict] = []
    status_counts = Counter()
    form_counts = Counter()
    purpose_counts = Counter()
    region_counts = Counter()
    active_rev_2025_tkr = 0
    active_eq_2025_tkr = 0
    active_with_2025_rev = 0
    active_with_kf = 0

    for raw_status, norm_status, fname in status_map:
        payload = json.loads((in_dir / fname).read_text(encoding="utf-8"))
        parts = re.split(r"<article\b", payload["content"])[1:]
        for card in parts:
            m_link = re.search(
                r'<h4><a href="(https://www\.insamlingskontroll\.se/organisationer/([^/]+)/)"[^>]*>(.*?)</a></h4>',
                card,
                re.S,
            )
            assert m_link, "Failed to parse organization link/title in Sweden card"
            profile_url, slug, raw_title = m_link.group(1), m_link.group(2), m_link.group(3)
            name = html.unescape(re.sub(r"<[^>]+>", "", raw_title)).strip()
            assert slug not in seen_slugs, f"Duplicate slug {slug}"
            seen_slugs.add(slug)

            m_type = re.search(r'<h5 class="org-type">(.*?)</h5>', card, re.S)
            legal_form = html.unescape(m_type.group(1)).strip() if m_type else "Unknown"

            gift = parse_gift_block(card)
            kf, had_dup_yr = parse_key_figures(card)
            if had_dup_yr:
                dup_year_orgs.append(
                    {
                        "slug": slug,
                        "name": name,
                        "orgNr": gift["orgNr"],
                        "status": norm_status,
                        "latestRevenueTkr": kf["latestRevenueTkr"] if kf else None,
                    }
                )

            wp = wp_by_slug.get(slug, {})
            purposes = sorted(
                tax_purpose[i] for i in (wp.get("organization_purpose") or []) if i in tax_purpose
            )
            areas = sorted(
                tax_area[i] for i in (wp.get("organization_business_area") or []) if i in tax_area
            )
            regions = sorted(
                tax_region[i] for i in (wp.get("organization_region") or []) if i in tax_region
            )
            se_counties = sorted(
                tax_region_se[i] for i in (wp.get("organization_region_sweden") or []) if i in tax_region_se
            )

            status_counts[norm_status] += 1
            form_counts[legal_form] += 1
            if norm_status == "active":
                for p in purposes:
                    purpose_counts[p] += 1
                for rg in regions:
                    region_counts[rg] += 1
                if kf:
                    active_with_kf += 1
                    y25 = next((y for y in kf["years"] if y["year"] == 2025), None)
                    if y25 and y25["revenueTkr"] is not None:
                        active_rev_2025_tkr += y25["revenueTkr"]
                        active_with_2025_rev += 1
                    if y25 and y25["equityTkr"] is not None:
                        active_eq_2025_tkr += y25["equityTkr"]

            records.append(
                {
                    "slug": slug,
                    "profileUrl": profile_url,
                    "name": name,
                    "norm": normalize_name(name),
                    "status": norm_status,
                    "legalForm": legal_form,
                    "orgNr": gift["orgNr"],
                    "since": gift["since"],
                    "bg": gift["bg"],
                    "pg": gift["pg"],
                    "swish": gift["swish"],
                    "purposes": purposes,
                    "areas": areas,
                    "regions": regions,
                    "swedenCounties": se_counties,
                    "financials": kf,
                }
            )

    assert len(records) == len(wp_orgs) == 741, f"Count mismatch: {len(records)} vs {len(wp_orgs)}"
    records.sort(key=lambda r: (0 if r["status"] == "active" else (1 if r["status"] == "withdrawn" else 2), r["norm"], r["slug"]))

    # Index active orgs for matching Topp-110 / Topp-100 PDFs
    active_by_slug = {r["slug"]: r for r in records if r["status"] == "active"}
    active_by_norm = {r["norm"]: r for r in records if r["status"] == "active"}
    # Also allow stripping leading "Stiftelsen " / "Föreningen " / "Insamlingsstiftelsen "
    active_by_stripped: dict[str, dict] = {}
    for r in records:
        if r["status"] != "active":
            continue
        stripped = re.sub(r"^(?:stiftelsen|foreningen|insamlingsstiftelsen|ideella foreningen)\s+", "", r["norm"]).strip()
        if stripped and stripped not in active_by_stripped:
            active_by_stripped[stripped] = r

    def match_report_org(report_name: str) -> dict | None:
        n = normalize_name(report_name)
        if n in REPORT_TO_SLUG_ALIASES and REPORT_TO_SLUG_ALIASES[n] in active_by_slug:
            return active_by_slug[REPORT_TO_SLUG_ALIASES[n]]
        if n in active_by_norm:
            return active_by_norm[n]
        if n in active_by_stripped:
            return active_by_stripped[n]
        return None

    top110 = parse_top_pdf(in_dir / "topp-110-storsta-2025.pdf")
    top100 = parse_top_pdf(in_dir / "topp-100-privatpersoner-2025.pdf")
    assert len(top110) == 110, f"Expected 110 rows in Topp-110, got {len(top110)}"
    assert len(top100) == 100, f"Expected 100 rows in Topp-100, got {len(top100)}"

    # Merge Top-110 Total Gifts & Grants with Top-100 Private Individual Gifts
    priv_by_norm = {r["norm"]: r for r in top100}
    priv_by_slug: dict[str, dict] = {}
    for r in top100:
        m = match_report_org(r["reportName"])
        r["matchedSlug"] = m["slug"] if m else None
        r["orgNr"] = m["orgNr"] if m else None
        if m:
            priv_by_slug[m["slug"]] = r

    merged_top: list[dict] = []
    matched_110 = 0
    matched_both = 0
    for r in top110:
        m = match_report_org(r["reportName"])
        if m:
            matched_110 += 1
        priv_row = None
        if m and m["slug"] in priv_by_slug:
            priv_row = priv_by_slug[m["slug"]]
        elif r["norm"] in priv_by_norm:
            priv_row = priv_by_norm[r["norm"]]
        if priv_row:
            matched_both += 1

        priv_mkr = priv_row["amountMkr"] if priv_row else None
        priv_share = (
            round((priv_mkr / r["amountMkr"]) * 100.0, 1)
            if priv_mkr is not None and r["amountMkr"] > 0
            else None
        )
        merged_top.append(
            {
                "rankTotal": r["rank"],
                "rankPrivate": priv_row["rank"] if priv_row else None,
                "reportName": r["reportName"],
                "matchedSlug": m["slug"] if m else None,
                "matchedName": m["name"] if m else None,
                "orgNr": m["orgNr"] if m else None,
                "legalForm": m["legalForm"] if m else None,
                "giftsAndGrants2025Mkr": r["amountMkr"],
                "privateGifts2025Mkr": priv_mkr,
                "privateSharePct": priv_share,
                "totalRevenue2025Tkr": (
                    next((y["revenueTkr"] for y in m["financials"]["years"] if y["year"] == 2025), None)
                    if m and m["financials"]
                    else None
                ),
                "purposePct3y": m["financials"]["purposePct3y"] if m and m["financials"] else None,
                "adminPct3y": m["financials"]["adminPct3y"] if m and m["financials"] else None,
            }
        )

    yearbook_series = parse_yearbook_summary(in_dir / "insamlingsaret-2025.pdf")
    y2025 = next(y for y in yearbook_series if y["year"] == 2025)

    # Emit registry artifacts
    reg_out = args.reg_out_dir
    reg_out.mkdir(parents=True, exist_ok=True)
    reg_payload = json.dumps(records, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    reg_gz = write_deterministic_gzip(reg_out / "organizations.json.gz", reg_payload)
    reg_gz["rows"] = len(records)

    csv_buf = io.StringIO()
    w = csv.writer(csv_buf, lineterminator="\n")
    w.writerow(
        [
            "slug",
            "name",
            "status",
            "legal_form",
            "org_nr",
            "since_year",
            "bg_accounts",
            "pg_accounts",
            "swish_accounts",
            "purposes",
            "regions",
            "latest_year",
            "latest_revenue_tkr",
            "latest_equity_tkr",
            "purpose_pct_3y",
            "admin_pct_3y",
            "profile_url",
        ]
    )
    for r in records:
        kf = r["financials"] or {}
        w.writerow(
            [
                r["slug"],
                r["name"],
                r["status"],
                r["legalForm"],
                r["orgNr"] or "",
                r["since"] if r["since"] is not None else "",
                "; ".join(r["bg"]),
                "; ".join(r["pg"]),
                "; ".join(r["swish"]),
                "; ".join(r["purposes"]),
                "; ".join(r["regions"]),
                kf.get("latestYear") if kf.get("latestYear") is not None else "",
                kf.get("latestRevenueTkr") if kf.get("latestRevenueTkr") is not None else "",
                kf.get("latestEquityTkr") if kf.get("latestEquityTkr") is not None else "",
                kf.get("purposePct3y") if kf.get("purposePct3y") is not None else "",
                kf.get("adminPct3y") if kf.get("adminPct3y") is not None else "",
                r["profileUrl"],
            ]
        )
    reg_csv_bytes = csv_buf.getvalue().encode("utf-8")
    (reg_out / "sweden-90-konto-organizations.csv").write_bytes(reg_csv_bytes)

    top_active_by_rev = sorted(
        [
            r
            for r in records
            if r["status"] == "active"
            and r["financials"]
            and any(y["year"] == 2025 and y["revenueTkr"] is not None for y in r["financials"]["years"])
        ],
        key=lambda r: -(
            next(y["revenueTkr"] for y in r["financials"]["years"] if y["year"] == 2025) or 0
        ),
    )[:20]

    reg_manifest = {
        "format": "charitology-sweden-registry-v1",
        "jurisdiction": "Sweden",
        "publisher": "Svensk Insamlingskontroll",
        "asOf": "2026-11-23",
        "financialReportingYear": 2025,
        "capturedOn": args.captured_on,
        "catalogues": {
            "directory": "https://www.insamlingskontroll.se/90-konto-organisationer/",
            "statistics": "https://www.insamlingskontroll.se/statistik/",
            "wpApi": "https://www.insamlingskontroll.se/wp-json/wp/v2/organizations",
        },
        "counts": {
            "includedOrganizations": len(records),
            "byStatus": {
                "active": status_counts["active"],
                "withdrawn": status_counts["withdrawn"],
                "finished": status_counts["finished"],
            },
            "byLegalForm": dict(sorted(form_counts.items())),
            "activeWithOrgNr": sum(1 for r in records if r["status"] == "active" and r["orgNr"]),
            "activeWithKeyFigures": active_with_kf,
            "activeWith2025Revenue": active_with_2025_rev,
            "activeSumRevenue2025Tkr": active_rev_2025_tkr,
            "activeSumEquity2025Tkr": active_eq_2025_tkr,
            "duplicateYearHeaderCards": len(dup_year_orgs),
            "topPurposesActive": [
                {"name": k, "count": v} for k, v in purpose_counts.most_common(12)
            ],
            "regionsActive": [
                {"name": k, "count": v} for k, v in region_counts.most_common()
            ],
        },
        "artifacts": {
            "organizations": reg_gz,
            "csv": {
                "path": "sweden-90-konto-organizations.csv",
                "bytes": len(reg_csv_bytes),
                "sha256": sha256_bytes(reg_csv_bytes),
                "rows": len(records),
            },
        },
        "topActiveBy2025Revenue": [
            {
                "slug": r["slug"],
                "name": r["name"],
                "orgNr": r["orgNr"],
                "legalForm": r["legalForm"],
                "since": r["since"],
                "revenue2025Tkr": next(
                    y["revenueTkr"] for y in r["financials"]["years"] if y["year"] == 2025
                ),
                "equity2025Tkr": next(
                    y["equityTkr"] for y in r["financials"]["years"] if y["year"] == 2025
                ),
                "purposePct3y": r["financials"]["purposePct3y"],
                "adminPct3y": r["financials"]["adminPct3y"],
            }
            for r in top_active_by_rev
        ],
    }
    (reg_out / "manifest.json").write_text(
        json.dumps(reg_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Emit paired funding-flows artifacts
    flow_out = args.flow_out_dir
    flow_out.mkdir(parents=True, exist_ok=True)

    top_payload = json.dumps(
        {
            "top110Total": merged_top,
            "top100PrivateOnly": [
                {
                    "rankPrivate": r["rank"],
                    "reportName": r["reportName"],
                    "privateGifts2025Mkr": r["amountMkr"],
                    "matchedSlug": r["matchedSlug"],
                    "orgNr": r["orgNr"],
                }
                for r in top100
            ],
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    top_gz = write_deterministic_gzip(flow_out / "top-organizations-2025.json.gz", top_payload)

    # Sector 2023-2025 CSV
    scsv = io.StringIO()
    sw = csv.writer(scsv, lineterminator="\n")
    sw.writerow(
        [
            "year",
            "audited_organizations",
            "private_individuals_mkr",
            "public_authorities_mkr",
            "foundations_and_orgs_mkr",
            "corporations_mkr",
            "collected_gifts_and_grants_mkr",
            "other_income_incl_financial_mkr",
            "total_revenue_mkr",
            "purpose_costs_mkr",
            "purpose_share_pct",
            "fundraising_costs_mkr",
            "fundraising_share_pct",
            "other_admin_costs_mkr",
            "other_admin_share_pct",
            "combined_fundraising_admin_pct",
            "total_equity_mkr",
        ]
    )
    for row in yearbook_series:
        sw.writerow(
            [
                row["year"],
                row["auditedOrganizations"],
                row["privateIndividualsMkr"],
                row["publicAuthoritiesMkr"],
                row["foundationsAndOrgsMkr"],
                row["corporationsMkr"],
                row["collectedGiftsAndGrantsMkr"],
                row["otherIncomeInclFinancialMkr"],
                row["totalRevenueMkr"],
                row["purposeCostsMkr"],
                row["purposeSharePct"],
                row["fundraisingCostsMkr"],
                row["fundraisingSharePct"],
                row["otherAdminCostsMkr"],
                row["otherAdminSharePct"],
                row["combinedFundraisingAdminPct"],
                row["totalEquityMkr"],
            ]
        )
    scsv_bytes = scsv.getvalue().encode("utf-8")
    (flow_out / "sector-series-2023-2025.csv").write_bytes(scsv_bytes)

    anomalies = {
        "duplicateYearColumns": {
            "count": len(dup_year_orgs),
            "note": (
                f"Svensk Insamlingskontroll's live directory emits repeated year header columns "
                f"with space-truncated left values on {len(dup_year_orgs)} directory cards; Charitology retains the "
                "rightmost complete figure per year."
            ),
            "organizations": sorted(dup_year_orgs, key=lambda x: x["slug"]),
        },
        "duplicateTitleAcrossStatuses": [
            {
                "title": "Stiftelsen Trygga Barnen",
                "entries": [
                    {"slug": r["slug"], "status": r["status"], "orgNr": r["orgNr"]}
                    for r in records
                    if r["name"] == "Stiftelsen Trygga Barnen"
                ],
            }
        ],
        "nonStandardOrgNr": [
            {
                "slug": r["slug"],
                "name": r["name"],
                "publishedOrgNr": r["orgNr"],
                "note": "Preserved verbatim from Svensk Insamlingskontroll's directory without silently inserting digits.",
            }
            for r in records
            if r["status"] == "active" and not re.fullmatch(r"\d{6}-\d{4}", r["orgNr"] or "")
        ],
        "cardSumVsYearbookReconciliation2025": {
            "activeCardsWith2025Revenue": active_with_2025_rev,
            "auditedOrganizationsInYearbook": y2025["auditedOrganizations"],
            "activeCardsRevenue2025Mkr": round(active_rev_2025_tkr / 1000.0, 1),
            "yearbookTotalRevenue2025Mkr": y2025["totalRevenueMkr"],
            "revenueCoveragePct": round((active_rev_2025_tkr / 1000.0) / y2025["totalRevenueMkr"] * 100.0, 2),
            "activeCardsEquity2025Mkr": round(active_eq_2025_tkr / 1000.0, 1),
            "yearbookTotalEquity2025Mkr": y2025["totalEquityMkr"],
            "equityCoveragePct": round((active_eq_2025_tkr / 1000.0) / y2025["totalEquityMkr"] * 100.0, 2),
        },
    }
    (flow_out / "anomalies.json").write_text(
        json.dumps(anomalies, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    flow_manifest = {
        "format": "charitology-sweden-90-konto-flows-v1",
        "jurisdiction": "Sweden",
        "publisher": "Svensk Insamlingskontroll",
        "asOf": "2026-10",
        "reportingYears": [2023, 2024, 2025],
        "capturedOn": args.captured_on,
        "catalogues": {
            "statistics": "https://www.insamlingskontroll.se/statistik/",
            "yearbook2025": "https://www.insamlingskontroll.se/wp-content/uploads/2026/10/Insamlingsaret-2025-i-text-siffror-med-flerarsoversikter.pdf",
            "top110Pdf": "https://www.insamlingskontroll.se/wp-content/uploads/2026/08/Topp-110-De-storsta-organisationerna-2025.pdf",
            "top100PrivatePdf": "https://www.insamlingskontroll.se/wp-content/uploads/2026/09/Topp-100-Gavor-fran-Privatpersoner-2025.pdf",
        },
        "counts": {
            "auditedOrganizations2025": y2025["auditedOrganizations"],
            "totalRevenue2025Mkr": y2025["totalRevenueMkr"],
            "collectedGiftsAndGrants2025Mkr": y2025["collectedGiftsAndGrantsMkr"],
            "privateIndividuals2025Mkr": y2025["privateIndividualsMkr"],
            "publicAuthorities2025Mkr": y2025["publicAuthoritiesMkr"],
            "foundationsAndOrgs2025Mkr": y2025["foundationsAndOrgsMkr"],
            "corporations2025Mkr": y2025["corporationsMkr"],
            "purposeCosts2025Mkr": y2025["purposeCostsMkr"],
            "purposeShare2025Pct": y2025["purposeSharePct"],
            "combinedFundraisingAdmin2025Pct": y2025["combinedFundraisingAdminPct"],
            "totalEquity2025Mkr": y2025["totalEquityMkr"],
            "top110Rows": len(top110),
            "top110SumMkr": sum(r["amountMkr"] for r in top110),
            "top110ShareOfSectorGiftsPct": round(
                sum(r["amountMkr"] for r in top110) / y2025["collectedGiftsAndGrantsMkr"] * 100.0, 1
            ),
            "top100PrivateRows": len(top100),
            "top100PrivateSumMkr": sum(r["amountMkr"] for r in top100),
            "top100ShareOfSectorPrivatePct": round(
                sum(r["amountMkr"] for r in top100) / y2025["privateIndividualsMkr"] * 100.0, 1
            ),
            "top110MatchedToActiveDirectory": matched_110,
            "top110WithPrivateRankMatch": matched_both,
        },
        "yearly": yearbook_series,
        "top20Merged": merged_top[:20],
        "artifacts": {
            "topOrganizations2025": top_gz,
            "sectorSeriesCsv": {
                "path": "sector-series-2023-2025.csv",
                "bytes": len(scsv_bytes),
                "sha256": sha256_bytes(scsv_bytes),
                "rows": len(yearbook_series),
            },
            "anomalies": {"path": "anomalies.json"},
        },
    }
    (flow_out / "manifest.json").write_text(
        json.dumps(flow_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(
        f"Built Sweden index: {len(records)} orgs (active={status_counts['active']}, "
        f"withdrawn={status_counts['withdrawn']}, finished={status_counts['finished']}; "
        f"active 2025 rev={active_rev_2025_tkr:,} tkr) + 2025 flows "
        f"(Top-110={sum(r['amountMkr'] for r in top110)} Mkr, matched={matched_110}/110, "
        f"paired private={matched_both}/110)."
    )


if __name__ == "__main__":
    main()
