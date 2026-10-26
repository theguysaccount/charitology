IRS EO BMF public identity snapshot
Data posting date: 2026-10-13
Records: 1975975
Source: https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf
Codes: https://www.irs.gov/pub/foia/ig/tege/eo-info.pdf
IRS EO BMF snapshot, including all four regional files. This is a US federal tax-exemption registry, including some non-domestic addresses, not a worldwide charity census. Filing addresses do not show service geography. Some self-declared organizations and churches are absent. A missing match does not establish ineligibility. No impact, quality or depth rating is inferred.

Refresh explicitly: node scripts/update-irs-registry.mjs --download --input-dir ../irs-registry/raw
Generated JSON gzip name shards and compact EIN directories are described in manifest.json. Preserve EINs as text. Null means not supplied; no missing value is converted to zero. Search normalization changes matching only, not source spelling. Financials and contact/street details are omitted.

Public IRS records / US Government compilation; 17 USC 105(a), https://www.copyright.gov/title17/92chap1.html#105 . No IRS endorsement. The site's CC BY notice does not relicense the underlying government records.
