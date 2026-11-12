"""Project three pinned IATI activities into one comparison of reported funding."""
import argparse
from collections import Counter
from datetime import date
from decimal import Decimal
from hashlib import sha256
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET


MANAGER = "GB-COH-04105827"
MANAGER_ACTIVITY = MANAGER + "-AIDMATCHII"
UK = "GB-CHC-1050327"
UK_ACTIVITY = UK + "-NP-HEAL-19"
NEPAL = "NP-SWC-17775"
NEPAL_ACTIVITY = NEPAL + "-NP-Heal-19"
START = "2019-10-22"
SOURCES = {
    "manager": {
        "file": "manager-bds.xml", "publisher": "Mannion Daniels",
        "url": "https://bulk-data.iatistandard.org/manniondaniels/manniondaniels-ukaid.xml",
        "delivery": "Publisher original cached by the IATI Bulk Data Service",
        "bytes": 2547410, "sha256": "4599756adc732672a2ce65efc37702185a39c743a68a84eb2e1673697da3ec85",
        "activityId": MANAGER_ACTIVITY, "reportingOrg": MANAGER,
    },
    "uk": {
        "file": "nepal-original.xml", "publisher": "The Leprosy Mission England and Wales",
        "url": "https://aidstream.s3.us-west-2.amazonaws.com/xml/tlmew-np.xml",
        "delivery": "Publisher original registered with IATI",
        "bytes": 39080, "sha256": "8e424e6cec096be7faa4602c05bbea5f7c762b140bd2aa63d4426d345e543334",
        "activityId": UK_ACTIVITY, "reportingOrg": UK,
    },
    "nepal": {
        "file": "nepal-local-original.xml", "publisher": "The Leprosy Mission Nepal",
        "url": "https://aidstream.s3.us-west-2.amazonaws.com/xml/tlmnepal-activities.xml",
        "delivery": "Publisher original registered with IATI",
        "bytes": 40274, "sha256": "4b679878524a51cd65481263b48808cb61b80d80cf0a9e3e8c1a4bb8ab60e28e",
        "activityId": NEPAL_ACTIVITY, "reportingOrg": NEPAL,
    },
}
NEED = {
    "source": {
        "file": "nepal-roadmap.pdf", "title": "Nepal’s country roadmap for zero leprosy",
        "publisher": "Nepal Ministry of Health and Population, hosted by WHO",
        "url": "https://www.who.int/docs/default-source/ntds/leprosy/global-consultation-on-global-leprosy-strategy-2021-2030/20-country-roadmaps-nepal.pdf",
        "bytes": 760290, "sha256": "3207354d4a5ddafcfb4177056db21743fec3fcff2f8dfbc8519c5b11f9de89b9",
        "pdfPage": 4,
    },
    "geography": "Nepal, national", "fiscalYear": "2018/19", "detectedCases": 3282,
    "detectionRatePer100000": "11.16",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_capture(folder, source):
    path = folder / source["file"]
    require(path.stat().st_size == source["bytes"], f"Wrong file size for {path.name}")
    raw = path.read_bytes()
    require(sha256(raw).hexdigest() == source["sha256"], f"Wrong fingerprint for {path.name}")
    return raw


def get_activity(folder, source):
    raw = read_capture(folder, source)
    require(b"<!DOCTYPE" not in raw and b"<!ENTITY" not in raw, "Unexpected XML declaration")
    root = ET.fromstring(raw)
    require(root.tag == "iati-activities" and root.get("version") == "2.03", "Expected IATI 2.03")
    matches = [a for a in root.findall("iati-activity") if a.findtext("iati-identifier") == source["activityId"]]
    require(len(matches) == 1, f"Expected one activity for {source['activityId']}")
    activity = matches[0]
    require(activity.find("reporting-org").get("ref") == source["reportingOrg"], "Wrong reporting organization")
    return activity, root.get("generated-datetime")


def party(node, role):
    element = node.find(f"{role}-org")
    return None if element is None else {
        "organizationRef": element.get("ref"), "activityRef": element.get(f"{role}-activity-id"),
    }


def money(node, currency):
    amount = node.text
    explicit = node.get("currency")
    require(re.fullmatch(r"[0-9]+(?:\.[0-9]{1,4})?", amount), f"Unexpected amount {amount!r}")
    require(explicit in (None, currency), f"Unexpected currency {explicit!r}")
    return {
        "amount": amount, "currency": currency, "currencyAttribute": explicit,
        "valueDate": date.fromisoformat(node.get("value-date")).isoformat(),
    }


def transactions(activity, manager):
    currency = activity.get("default-currency")
    require(currency == ("NPR" if activity.findtext("iati-identifier") == NEPAL_ACTIVITY else "GBP"),
            "Unexpected activity currency")
    rows = []
    for row, node in enumerate(activity.findall("transaction"), 1):
        receiver = party(node, "receiver")
        if manager and (not receiver or receiver["activityRef"] != UK_ACTIVITY):
            continue
        provider = party(node, "provider")
        kind = node.find("transaction-type").get("code")
        ref = node.get("ref")
        require(ref and re.fullmatch(r"[A-Za-z0-9 &.()/_–-]+", ref), f"Unexpected reference {ref!r}")
        if manager:
            require(kind == "3" and receiver["organizationRef"] == UK
                    and provider == {"organizationRef": MANAGER, "activityRef": MANAGER_ACTIVITY}
                    and node.find("recipient-country").get("code") == "NP",
                    "Unexpected manager transaction party, type or country")
        rows.append({
            "row": row, "ref": ref, "type": kind,
            "date": date.fromisoformat(node.find("transaction-date").get("iso-date")).isoformat(),
            **money(node.find("value"), currency), "provider": provider, "receiver": receiver,
        })
    return rows


def budgets(activity):
    rows = []
    currency = activity.get("default-currency")
    for row, node in enumerate(activity.findall("budget"), 1):
        rows.append({
            "row": row, "type": node.get("type"), "status": node.get("status"),
            "start": date.fromisoformat(node.find("period-start").get("iso-date")).isoformat(),
            "end": date.fromisoformat(node.find("period-end").get("iso-date")).isoformat(),
            **money(node.find("value"), currency),
        })
    return rows


def capture(folder, name, source):
    activity, generated = get_activity(folder, source)
    rows = transactions(activity, manager=name == "manager")
    by_type = Counter(row["type"] for row in rows)
    expected = {"manager": {"3": 13}, "uk": {"1": 13, "3": 7, "4": 8}, "nepal": {"1": 10, "4": 8}}
    require(by_type == expected[name], f"Unexpected transaction scope for {name}")
    result = {
        **source, "title": activity.findtext("title/narrative"), "fileGeneratedAt": generated,
        "activityUpdatedAt": activity.get("last-updated-datetime"),
        "activityTransactions": len(activity.findall("transaction")), "transactions": rows,
    }
    if name != "manager":
        require(result["title"] == "Heal Nepal", "Project title changed")
        require([(node.get("type"), node.get("iso-date")) for node in activity.findall("activity-date")]
                == [("2", START)], "Activity dates changed")
        parties = {(node.get("role"), node.get("ref"), node.get("activity-id"))
                   for node in activity.findall("participating-org")}
        required = ({("3", MANAGER, MANAGER_ACTIVITY), ("4", NEPAL, "NP-Heal-19")} if name == "uk"
                    else {("1", UK, None)})
        require(required <= parties, "Project party references changed")
        result["budgets"] = budgets(activity)
    return result


def unique(rows, key):
    index = {key(row): row for row in rows}
    require(len(index) == len(rows), "Ambiguous comparison key")
    return index


def total(rows):
    return format(sum((Decimal(row["amount"]) for row in rows), Decimal("0.00")), "f")


def upstream_pairs(manager_rows, uk_receipts):
    allowed_provider = {
        (MANAGER, MANAGER_ACTIVITY), (MANAGER, MANAGER + "- AIDMATCHII"),
    }
    for row in uk_receipts:
        provider = row["provider"]
        require((provider["organizationRef"], provider["activityRef"]) in allowed_provider
                and row["receiver"] == {"organizationRef": UK, "activityRef": UK_ACTIVITY},
                "Unexpected UK incoming reference")
    key = lambda row: (row["currency"], Decimal(row["amount"]))
    manager = unique(manager_rows, key)
    uk = unique(uk_receipts, key)
    require(len(manager.keys() & uk.keys()) == 12, "Expected 12 unique exact amount pairs")
    manager_ref = "UKAMDISB-1865"
    uk_ref = "DFID Y1Q3"
    pairs = []
    for row in sorted(manager_rows, key=lambda row: row["date"]):
        receipt = uk.get(key(row))
        if receipt is None:
            require(row["ref"] == manager_ref, "Unexpected unmatched fund manager record")
            receipt = next(item for item in uk_receipts if item["ref"] == uk_ref)
            require(row["amount"] == "49479.89" and receipt["amount"] == "49479.88",
                    "Expected one-penny difference for the same reported quarter")
        pairs.append({
            "managerRow": row["row"], "ukRow": receipt["row"],
            "sameDate": row["date"] == receipt["date"],
            "managerLessUk": format(Decimal(row["amount"]) - Decimal(receipt["amount"]), ".2f"),
        })
    require(len({pair["ukRow"] for pair in pairs}) == len(uk_receipts), "An incoming record was reused")
    return pairs


def onward_groups(uk_rows, nepal_rows):
    # These are source-based comparisons, not payment or exchange-rate matches.
    groups = [
        ("TLMN Y1Q3", ["Y1Q3-HEAL-TLMN-3", "Y1Q3-HEAL-TLMN-4"], "two-receipts",
         "Both dates agree. The UK description covers two advances. The Nepal file reports separate receipts for the two periods."),
        ("TLMN Y2Q2", ["Y2Q2-HEAL-TLMN-2"], "unresolved",
         "The periods overlap in September 2020. The Nepal description gives GBP 260,615.00, which is GBP 1.47 above the UK amount. The posting dates and stated periods differ."),
        ("TLMN Y2Q4", ["Y3Q1-HEAL-TLMN-1"], "candidate",
         "Both transaction dates are April 1, 2021 and both descriptions refer to January–March. The Nepal row uses organization names in the activity fields."),
        ("TLMN Y2Q3&4", ["Y3Q3-HEAL-TLMN-1"], "partial-period",
         "The value date and October–December 2021 period agree. The UK amount also includes part of the January–March 2022 advance."),
        ("TLMN -Y3Q2- April to June 2022", ["Y3Q4-HEAL-TLMN-1"], "candidate",
         "Both dates are March 25, 2022. Both descriptions cover funding from March through June 2022."),
        ("TLMN -Y4Q2- July to September  2022", ["Y4Q2-HEAL-TLMN-1"], "candidate",
         "The dates are one day apart and both descriptions cover July–September 2022."),
        (" TLMN -Y4Q3- Oct to Dec   2022", ["Y4Q3-HEAL-TLMN-1"], "candidate",
         "The dates are three days apart and both descriptions cover October–December 2022."),
    ]
    uk = unique(uk_rows, lambda row: row["ref"])
    nepal = unique(nepal_rows, lambda row: row["ref"])
    require({group[0] for group in groups} == uk.keys(), "Onward groups do not cover the UK disbursements")
    grouped_refs = [ref for _, refs, _, _ in groups for ref in refs]
    require(len(set(grouped_refs)) == len(grouped_refs), "A Nepal receipt was assigned to multiple groups")
    remaining = nepal.keys() - set(grouped_refs)
    require(remaining == {"Y1Q3-HEAL-TLMN-2", "Y1Q3-HEAL-TLMN"}, "Unexpected ungrouped Nepal receipts")
    return {
        "groups": [{"ukRow": uk[left]["row"], "nepalRows": [nepal[ref]["row"] for ref in right],
                    "comparison": comparison, "basis": basis} for left, right, comparison, basis in groups],
        "nepalTestReceipts": sorted(nepal[ref]["row"] for ref in remaining),
    }


def build(folder):
    read_capture(folder, NEED["source"])
    files = {name: capture(folder, name, source) for name, source in SOURCES.items()}
    manager, uk, nepal = (files[name]["transactions"] for name in SOURCES)
    uk_receipts = [row for row in uk if row["type"] == "1"]
    uk_out = [row for row in uk if row["type"] == "3"]
    uk_expenses = [row for row in uk if row["type"] == "4"]
    nepal_receipts = [row for row in nepal if row["type"] == "1"]
    nepal_expenses = [row for row in nepal if row["type"] == "4"]
    periods = lambda rows: [(row["start"], row["end"], row["type"], row["status"]) for row in rows]
    expected_periods = [
        (START, "2020-03-31", "2", "2"), ("2020-04-01", "2021-03-31", "2", "2"),
        ("2021-04-01", "2022-03-31", "2", "2"), ("2022-04-01", "2022-10-21", "2", "2"),
    ]
    require(periods(files["uk"]["budgets"]) == periods(files["nepal"]["budgets"]) == expected_periods,
            "Reported budget periods differ")
    return {
        "status": "draft", "actualStart": START, "charityRegistrationEnglandWales": "1050327",
        "captures": files, "upstreamPairs": upstream_pairs(manager, uk_receipts),
        "onward": onward_groups(uk_out, nepal_receipts), "need": NEED,
        "totals": {
            "managerDisbursedGbp": total(manager), "ukReceivedGbp": total(uk_receipts),
            "ukDisbursedGbp": total(uk_out), "nepalReceivedNpr": total(nepal_receipts),
            "ukExpensesGbp": total(uk_expenses), "nepalExpensesNpr": total(nepal_expenses),
        },
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = json.dumps(build(args.capture_dir), ensure_ascii=False, indent=2) + "\n"
    args.output.write_text(result, encoding="utf-8")
