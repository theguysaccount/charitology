"""Reproduce one bounded IATI activity comparison from pinned public captures."""
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
UK = "GB-CHC-299717"
UK_ACTIVITY = UK + "-KY0002"
KENYA = "KE-NCB-2180511703310709"
KENYA_ACTIVITY = KENYA + "-ImprovedNutrition"
GOVERNMENT = "GB-GOV-1"
SOURCES = {
    "manager": {
        "name": "manager.xml",
        "url": "https://d-portal.iatistandard.org/q.xml?aid=GB-COH-04105827-AIDMATCHII",
        "publisher": "Mannion Daniels",
        "delivery": "D-Portal XML export of the publisher’s activity",
        "sha256": "2bdb4d2036b6a19498151b5296ed8b5cae7896e1d7bf4ac9d964769b9c804e3e",
        "bytes": 968069, "activityId": MANAGER_ACTIVITY, "reportingOrg": MANAGER,
    },
    "uk": {
        "name": "uk.xml",
        "url": "https://aidstream.s3.us-west-2.amazonaws.com/xml/sendacow-ke.xml",
        "publisher": "Send a Cow UK",
        "delivery": "Publisher XML registered with IATI",
        "sha256": "9f75ad2cd984c53dfa55a24c380f72b61c1f8f98b03c333c964c9d6311759514",
        "bytes": 65050, "activityId": UK_ACTIVITY, "reportingOrg": UK,
    },
    "kenya": {
        "name": "kenya.xml",
        "url": "https://aidstream.s3.us-west-2.amazonaws.com/xml/sac_kenya-activities.xml",
        "publisher": "Send a Cow Kenya",
        "delivery": "Publisher XML registered with IATI",
        "sha256": "a2ec3ef78731c6b3fea6107e28f780cc0bf9eda8b18119119c166db595f74dbd",
        "bytes": 19322, "activityId": KENYA_ACTIVITY, "reportingOrg": KENYA,
    },
}
SURVEY = {
    "name": "survey.pdf",
    "url": "https://www.knbs.or.ke/wp-content/uploads/2023/09/2015-2016-Kenya-Integrated-Household-Budget-Survey-Basic-Report-On-Well-Being-In-Kenya.pdf",
    "publisher": "Kenya National Bureau of Statistics",
    "title": "2015/16 Kenya Integrated Household Budget Survey: Basic Report on Well-Being in Kenya",
    "sha256": "9c5d53a0e1db6bdf6d4e885287f1dfcca4099cf18933ca05627f6575e0274854",
    "bytes": 1481806, "pdfPage": 87, "printedPage": 85, "table": "Annex B1",
}
REGISTRATION = {
    "name": "FY24.pdf",
    "url": "https://d1l97138avwug7.cloudfront.net/Ripple-Effect-Financial-Statements-23-24-1.pdf",
    "publisher": "Ripple Effect International",
    "title": "Financial statements for the year ended 30 June 2024",
    "sha256": "39e398eb435c175a14d72b70256fd8fa19f878c211051b6e1ea88219ef0d6c78",
    "bytes": 5237396, "pdfPage": 35, "printedPage": 34, "note": "15",
    "legalName": "Ripple Effect Kenya", "registrationNumber": "218/051/17-033/10709",
}
PROJECT = {
    "name": "project-page.html",
    "url": "https://rippleeffect.org/blog/improving-nutrition-for-women-and-children/",
    "publisher": "Ripple Effect International",
    "sha256": "f101e67d0064083a01efb734a36bc58d823b89f67eeff27add447f1fa667a9e6",
    "bytes": 81938,
}
PERIOD = {"actualStart": "2018-05-01", "plannedEnd": "2021-04-30"}
QUARTER = re.compile(r"^Q([1-9][0-9]*)(?!\d)", re.IGNORECASE)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def pin(directory, source):
    path = directory / source["name"]
    require(path.stat().st_size == source["bytes"], f"Wrong source size for {path.name}")
    raw = path.read_bytes()
    require(sha256(raw).hexdigest() == source["sha256"], f"Wrong source fingerprint for {path.name}")
    return raw


def get_activity(directory, source):
    raw = pin(directory, source)
    require(b"<!DOCTYPE" not in raw and b"<!ENTITY" not in raw, "XML declarations outside the activity schema")
    root = ET.fromstring(raw)
    require(root.tag == "iati-activities" and root.get("version") == "2.03", "Unexpected XML version")
    matches = [a for a in root.findall("iati-activity") if a.findtext("iati-identifier") == source["activityId"]]
    require(len(matches) == 1, f"Expected one activity for {source['activityId']}")
    activity = matches[0]
    require(activity.find("reporting-org").get("ref") == source["reportingOrg"], "Reporting organization differs")
    return activity, root.get("generated-datetime")


def money(value, default_currency):
    amount = value.text
    explicit = value.get("currency")
    currency = explicit or default_currency
    require(currency == "GBP", "Unexpected currency in the selected activity")
    require(re.fullmatch(r"[0-9]+(?:\.[0-9]{1,2})?", amount), f"Invalid amount {amount!r}")
    return {
        "amount": amount, "currency": currency, "currencyAttribute": explicit,
        "valueDate": date.fromisoformat(value.get("value-date")).isoformat(),
    }


def party(node, role):
    element = node.find(role + "-org")
    if element is None:
        return None
    return {"organizationRef": element.get("ref"), "activityRef": element.get(role + "-activity-id")}


def project_records(activity, manager=False):
    records = []
    for row, node in enumerate(activity.findall("transaction"), 1):
        receiver = party(node, "receiver")
        if manager and (not receiver or receiver["activityRef"] != UK_ACTIVITY):
            continue
        transaction_type = node.find("transaction-type").get("code")
        provider = party(node, "provider")
        item = {
            "row": row, "ref": node.get("ref"), "type": transaction_type,
            "date": date.fromisoformat(node.find("transaction-date").get("iso-date")).isoformat(),
            **money(node.find("value"), activity.get("default-currency")),
            "provider": provider, "receiver": receiver,
        }
        if manager:
            require(receiver["organizationRef"] == UK and provider == {
                "organizationRef": MANAGER, "activityRef": MANAGER_ACTIVITY,
            } and transaction_type == "3" and node.find("recipient-country").get("code") == "KE",
                "Manager row has an unexpected party, type or destination")
            grant = re.match(r"^([0-9]{6}-[0-9]{3})\b", node.findtext("description/narrative"))
            require(grant is not None, "Missing manager grant reference")
            item["grantRef"] = grant[1]
        records.append(item)
    require(all(r["ref"] and re.fullmatch(r"[A-Za-z0-9 &.()/_–-]+", r["ref"]) for r in records),
            "Missing or unexpected transaction reference")
    return records


def unique_index(records, key):
    index = {key(r): r for r in records}
    require(len(index) == len(records), "Ambiguous counterpart key")
    return index


def quarter(record):
    match = QUARTER.match(record["ref"])
    require(match is not None, f"No reported quarter in {record['ref']!r}")
    return int(match[1])


def total(records):
    return format(sum((Decimal(r["amount"]) for r in records), Decimal("0")), ".2f")


def build(directory):
    capture = {}
    for key, source in SOURCES.items():
        activity, generated = get_activity(directory, source)
        capture[key] = {
            **source, "fileGeneratedAt": generated, "activityUpdatedAt": activity.get("last-updated-datetime"),
            "activityTitle": activity.findtext("title/narrative"),
            "allActivityTransactions": len(activity.findall("transaction")),
            "transactions": project_records(activity, manager=key == "manager"),
        }
        organizations = {n.get("ref"): n.get("role") for n in activity.findall("participating-org")}
        if key == "manager":
            require(organizations.get(GOVERNMENT) == "1" and organizations.get(MANAGER) == "3",
                    "Unexpected funding and manager roles")
            continue
        dates = {n.get("type"): n.get("iso-date") for n in activity.findall("activity-date")}
        require(dates == {"2": PERIOD["actualStart"], "3": PERIOD["plannedEnd"]}, "Activity periods differ")
        require(organizations.get(KENYA) == "4" and organizations.get(UK) == ("4" if key == "uk" else "1")
                and not activity.findall("location")
                and [n.get("code") for n in activity.findall("recipient-country")] == ["KE"],
                "Shared parties or geography differ")

    manager, uk, kenya = [capture[key]["transactions"] for key in SOURCES]
    require(Counter(r["type"] for r in uk) == {"1": 12, "3": 13, "4": 31}
            and Counter(r["type"] for r in kenya) == {"1": 12, "3": 1, "4": 56},
            "The declared project transaction scope changed")
    uk_income = [r for r in uk if r["type"] == "1"]
    uk_out = [r for r in uk if r["type"] == "3"]
    kenya_counterpart = [r for r in kenya if r["type"] in ("1", "3")]
    amount_key = lambda r: (r["currency"], Decimal(r["amount"]))
    manager_by_amount = unique_index(manager, amount_key)
    uk_by_amount = unique_index(uk_income, amount_key)
    require(len(manager_by_amount) == 12 and manager_by_amount.keys() == uk_by_amount.keys(),
            "The manager-to-UK amounts no longer pair one to one")
    incoming = [
        {"managerRow": row["row"], "ukRow": uk_by_amount[amount_key(row)]["row"],
         "sameDate": row["date"] == uk_by_amount[amount_key(row)]["date"]}
        for row in sorted(manager, key=lambda row: row["date"])
    ]

    uk_by_quarter = unique_index(uk_out, quarter)
    kenya_by_quarter = unique_index(kenya_counterpart, quarter)
    require(set(uk_by_quarter) == set(kenya_by_quarter) == set(range(1, 14)),
            "The UK-to-Kenya quarters no longer pair one to one")
    transfers = []
    for q, left in sorted(uk_by_quarter.items()):
        right = kenya_by_quarter[q]
        require((left["currency"], left["date"]) == (right["currency"], right["date"]), f"Date or currency differs for Q{q}")
        transfers.append({"quarter": q, "ukRow": left["row"], "kenyaRow": right["row"],
                          "ukLessKenyaGbp": format(Decimal(left["amount"]) - Decimal(right["amount"]), ".2f")})

    uk_activity, _ = get_activity(directory, SOURCES["uk"])
    budgets = [{"row": i, "type": n.get("type"), "status": n.get("status"),
                "periodStart": n.find("period-start").get("iso-date"),
                "periodEnd": n.find("period-end").get("iso-date"),
                **money(n.find("value"), uk_activity.get("default-currency"))}
               for i, n in enumerate(uk_activity.findall("budget"), 1)]
    require(len(budgets) == 4, "The UK budget has an unexpected number of periods")
    pin(directory, REGISTRATION)
    # The full local number is printed in Note 15. Compare only its digits to the IATI organization ref.
    require(KENYA == "KE-NCB-" + re.sub(r"[^0-9]", "", REGISTRATION["registrationNumber"]),
            "The full legal registration does not agree with the IATI organization reference")
    pin(directory, SURVEY)
    geography = pin(directory, PROJECT).decode("utf-8")
    require("implemented in the counties of Busia and Bungoma between May 2018 and April 2021" in geography,
            "The project geography statement is absent")

    return {
        "schemaVersion": 1, "review": "draft", "retrievedOnUtc": "2026-11-12",
        "period": PERIOD, "country": "KE", "counties": ["Busia", "Bungoma"],
        "grantActivity": UK_ACTIVITY, "governmentFunderRef": GOVERNMENT,
        "charityRegistrationEnglandWales": "299717",
        "captures": capture, "managerToUkPairs": incoming, "ukToKenyaPairs": transfers,
        "ukBudgets": budgets, "kenyaRegistrationSource": REGISTRATION, "projectGeographySource": PROJECT, "survey": {
            "source": SURVEY, "period": "2015/16",
            "population": "Individuals covered by the 2015/16 household survey",
            "measure": "Individual food poverty headcount percentage",
            # Numeric facts transcribed from the displayed table. Verify against the pinned page.
            "estimates": [
                {"geography": "Busia", "percent": "59.5", "standardErrorPercentagePoints": "2.74"},
                {"geography": "Bungoma", "percent": "32.4", "standardErrorPercentagePoints": "3.09"},
                {"geography": "Kenya", "percent": "32.0", "standardErrorPercentagePoints": "0.49"},
            ],
        },
        "totalsGbp": {
            "ukBudget": total(budgets), "managerDisbursements": total(manager), "ukIncoming": total(uk_income),
            "ukOnward": total(uk_out), "kenyaCounterpart": total(kenya_counterpart),
            "ukExpenditure": total(r for r in uk if r["type"] == "4"),
            "kenyaExpenditure": total(r for r in kenya if r["type"] == "4"),
        },
        "limits": [
            "Publisher records do not establish bank settlement. Match within one project and one stage at a time.",
            "The manager and UK records describe one funding stage. The UK and Kenya records describe another. Never sum opposite sides of a pair.",
            "The Kenyan counterpart includes one row coded as a disbursement despite a reference that says income. Keep its original code.",
            "The county survey predates the activity. It measures population conditions, not project outcomes or the location of each pound.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captures", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = build(args.captures)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
