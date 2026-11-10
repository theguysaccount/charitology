# Yes I Do Alliance funding trace

This case compares reports along five routes from six IATI activities. Each activity comes directly from the source URL recorded in the IATI Bulk Data Service index. The published file contains a bounded selection of amounts, dates, identifiers, positions and matching decisions. It does not redistribute source files, contact details, beneficiary information or narrative reports.

Use the exact IATI dataset index created on November 10, 2026 and the six publisher XML files listed in the [case data](../src/data/funding-flows/yes-i-do.json). The script requires a filename of `datasets-full.json` for the index and `<source-key>-publisher.xml` for each source, such as `amref-publisher.xml`. All hashes must match. The public publisher URLs may now serve newer editions.

```sh
python3 scripts/capture-yes-i-do-flows.py /path/to/captures /path/to/case.json
cmp /path/to/case.json src/data/funding-flows/yes-i-do.json
```

Outgoing records are disbursements. Incoming records are incoming funds with an exact provider organization and activity identifier. The Dutch Ministry's rows do not identify the recipient, so its route uses the ministry's implementing organization link and Plan's explicit reference to the ministry activity. The outgoing Plan rows name the receiving organization. Amref Netherlands supplies both the receiving organization and activity on the country disbursements. Separate source record coordinates refer to the order of transaction elements in each publisher's exact activity.

Pair one-to-one only when both records have one unique counterpart at the current matching step. First use the same reported transaction date, currency and signed amount. Then use the same currency and signed amount within 45 days. These are hypotheses about counterpart records. The method does not assign amounts to the next leg or resolve spelling, adjustment, exchange rate or reporting-date differences. Report unmatched rows and missingness explicitly. Keep commitments and spending out of this comparison.
