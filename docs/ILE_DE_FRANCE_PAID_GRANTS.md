# Île-de-France paid grants

The [regional payment lookup](https://charitology.org/record/funding-flows/ile-de-france-paid-grants/) uses the Région Île-de-France's September 8, 2026 publication for its 2024 and 2025 budget years. It includes 9,203 payment rows with usable SIRET and payment dates. The original records are available under France's Open Licence 2.0. Source URLs, exact checksums, fields and exclusions are in the [manifest](../public/data/funding-flows/ile-de-france/manifest.json).

The region identifies the beneficiary establishment by SIRET. The first nine digits identify the SIREN legal unit. Displayed names come from the payment extract. The importer excludes delegated rows before checking identifiers and payment dates. It omits narrative purposes. Five records show a 2026 payment against a 2025 budget year. Distinct publication rows with the same date, amount, decision, dossier and SIRET are kept and flagged when the source does not establish whether they represent different payments. This edition does not total the rows.

Rebuild from the pinned original CSV into a new output directory.

```sh
python3 scripts/build-ile-de-france-paid-grants.py /path/to/original.csv /path/to/new-rebuild
diff -qr public/data/funding-flows/ile-de-france /path/to/new-rebuild
```
