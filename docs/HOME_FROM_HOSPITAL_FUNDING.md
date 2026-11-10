# Greater Manchester funding and need case

The [case page](https://charitology.org/record/funding-flows/greater-manchester-home-from-hospital/) joins a reported funding chain to independent NHS context. The 10GM workbook contains nine distinct awards dated September 27, 2022, totaling GBP 178,689. 10GM dates project delivery from December 2022 through March 2023. The case keeps the award amounts separate from expenditure and from 10GM’s reported results. [10GM program and delivery account](https://10gm.org.uk/10gms-work/home-from-hospital-targeted-investment-fund/) · [Open dataset listing and license](https://registry.threesixtygiving.org/data.json)

The NHS workbook data come from Table 2, integrated care board code QOP, in the four revised monthly workbooks. The denominator for each average is the count of observed daily snapshots. All 121 dates are present. The counts describe patients remaining in hospital who no longer met the criteria to stay. The same patient may appear in more than one daily count. The NHS describes the figures as unvalidated management information. Its workbook states that ICB data exclude hospice discharges. This does not measure the size of the group the grants could serve. [NHS discharge series](https://www.england.nhs.uk/statistics/statistical-work-areas/discharge-delays-acute-data/) · [NHS reuse terms](https://www.england.nhs.uk/terms-and-conditions-2/)

Seven of eight supplied charity registration numbers resolve to a main charity in the captured England and Wales register. The case presents the regulator name next to the publisher's name so readers can inspect differences. It preserves the unresolved charity identifier and the remaining company identifier without guessing. The source dataset captures a regulator extract dated November 10, 2026, which is later than the grant delivery. [Charity Commission source and data definition](https://register-of-charities.charitycommission.gov.uk/en/register/full-register-download)

## Reproduce the capture

Use Python 3.9 or later with openpyxl 3.1.5. Download the six sources using the URLs, names and fingerprints in the capture script. The case site builds offline from the committed data.

    python3 scripts/capture-home-from-hospital.py /path/to/exact-inputs /path/to/rebuilt.json
    cmp /path/to/rebuilt.json src/data/home-from-hospital.json

The rebuild checks file hashes, unique award IDs, the published award total, date sequence, board identity and public registry matches. The JSON download retains the original award sheet row and NHS sheet, row and column. The workbook data are attributed to 10GM under CC BY 4.0. The Charity Commission and NHS England data use the Open Government Licence v3.0.
