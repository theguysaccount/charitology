# Astro 7 migration acceptance

November 6, 2026. This is an unmerged migration candidate based on `815f922f4e391b15797307e1286bbc8a31dac168`. It has not been published to the live site. The earlier Astro 5.18.2 receipts retain their original scope and versions.

## Requirements and changes

The candidate pins Astro **7.4.7** and requires Node **22.23.4 or newer**. `.nvmrc` and the existing workflows select Node 24. The [official release](https://github.com/withastro/astro/releases/tag/astro@7.4.7) and npm registry both identified 7.4.7 as the current stable candidate when checked. Guidance came from the official [Astro 6](https://docs.astro.build/en/guides/upgrade-to/v6/) and [Astro 7](https://docs.astro.build/en/guides/upgrade-to/v7/) migration documents.

Necessary compatibility changes:

- Keep the existing unified Markdown pipeline, link rewriting, SmartyPants and HTML whitespace handling explicitly configured.
- Import content-schema Zod from `astro/zod`; preserve the schema expressions and content.
- Declare the compiler and tools imported by checks: Rust compiler 0.5.2, esbuild 0.28.2 and TypeScript 5.9.3. Nineteen checker/fixture imports now use the same Rust compiler as Astro 7; their assertions remain unchanged.
- Set worker output to ES modules, matching the existing `type: 'module'` constructor. Keep the worker in one bundle using the documented [Vite worker options](https://vite.dev/config/worker-options) and [Rolldown option](https://rolldown.rs/reference/OutputOptions.codeSplitting).
- Give the standalone charity-start TypeScript check explicit Node ambient types while retaining strict mode and its DOM libraries. This prevents unrelated transitive MDX globals from requiring a JSX namespace; imported modules remain typed. See [TypeScript's `types` documentation](https://www.typescriptlang.org/tsconfig/types.html).
- Prefix the two directory source-download display links with the existing site URL helper. Subpath verification exposed 62 unprefixed links. The directory checker now verifies the configured prefix and capture link; source JSON, hashes and Charity OS fragments remain unchanged.

There are no dependency overrides, regenerated v1 interpretations, changed storage keys, service migrations or operating-program changes.

## Static verification

The tests used Node 24.22.1 and npm 11.19.1. Private operator receipts retain exact commands, times, source inventories, failed attempts and artifact manifests.

| Check | Result and scope |
|---|---|
| `npm ci` | Passed; 322 packages installed. |
| `npm audit --json` | Exited 0; zero reported findings for the candidate lock on November 6. This does not establish application security. |
| `npm run check:model-reference` | Passed all 19 frozen vectors and retained engine/golden hashes. |
| Root `npm run build` | Passed; 579 HTML pages and 39 API files. |
| Root `npm run check` | Passed; 51,177 links/assets, 172 model tests, 12 fundraising tests and six charity-start tests; strict checks passed. |
| Root rebuild after the display-link fix | All 3,670 files exactly matched the already fully checked Astro 7 root artifact. Fresh link, directory and social checks passed. The earlier full command is carried by that exact output equivalence; it is not relabeled as rerun. |
| GitHub Pages subpath build | Passed with `SITE_URL=https://theguysaccount.github.io` and `BASE_PATH=/charitology/`; 579 HTML pages. |
| Subpath checks | All twelve selected checks passed: links, social, research ledger, program graph, learning portfolio, publications, observations, directory, disasters, model desk/worker, fundraising and actual alternate extension packages. |

The alternate checks resolved all 51,177 links/assets and verified all three actual ZIPs against ten source files, the approved baked site, ZIP structure/CRC, complete metadata and the unchanged release baseline. They supply no installed-browser or store approval.

**The complete alternate-origin `npm run check` command did not pass.** Its extension package test expects canonical-origin package bytes, including the production freeze checks; the alternate build correctly bakes the approved GitHub subpath. Those assertions were preserved. The twelve alternate checks above establish their stated scopes and do not replace this failed full-command record.

The tested root artifact and canonical extension outputs were preserved before alternate builds and restored exactly afterward. The restored root `dist/` is available for native review. Output equivalence above compares two Astro 7 artifacts; it does not assert that all framework-generated files equal the older Astro 5 build.

### Integration with the main-branch test correction

The candidate subsequently integrated exact main `c702b73927f246c3835757dc0ff115156ce16d7c`, which contains the three-path PR #39 publication record and file-descriptor identity test correction. Both histories and the current run guidance were preserved without conflicts. Runtime sources, dependency manifests, the lock and Astro configuration did not change.

The integrated tree separately passed `check:model-reference` with **19 vectors**, `check:model-bundles` with **173 cases**, the 579-page build, all 51,177 links/assets and social/media checks. Its complete 3,670-file root artifact is byte-identical to the held Astro 7 artifact above. The earlier full root check's 172-case count remains evidence of its earlier version; it is not relabeled as a new 173-case full run. The unchanged dependency/input bytes retain the separately recorded audit and Learning generator proofs. Fresh exact-head CI remains a release gate.

## Frozen boundaries and pending Learning compatibility

The original brief, roadmap mappings, content/data, public source snapshots, all service files and runtime model files remain unchanged. A broad 653-file baseline inventory has 651 unchanged files and exactly two test-only compiler-import changes. Engine, registry, golden and codec bytes were preserved separately; no v1 replacement was generated to obtain a pass.

A separate read-only probe bound the candidate esbuild 0.28.2 to the actual generator and fourteen source/dependency inputs in held Learning checkpoint `e9188c7634895c50c02f3ce81c3f67a6e3ab49ee`. Its existing `--check` and `write: false` logic passed. Both generated native bundles remain **254,934 bytes**, SHA-256 `e12d1dd103db4cb83d2d0abd0809a05449d019be3ef0ced2a2784cb6fe766324`; the manifest remains `8b187ed0f35f98e59c626175ede77f2bb1095a695d3dcde5668227563467cd41`, and the checked registry identity remains `9e12453e6178202ea7e47ce7610311c7a5a7d3be09456544902ac524ef88f906`. All probe source and generated files were unchanged afterward. Learning implementation was not copied into this candidate. This is generator compatibility evidence, not a complete integrated Learning suite or browser journey.

## Run and remaining gates

### Native read-only reproduction

After the static checks, actual Chrome opened the restored root artifact and selected the existing **44,929-byte** `native-model-selected.json` through the native file chooser. Its SHA-256 was `f12fb97edcce4fb6d277678affef307efa3a5797139bed2243be37ce3ba2eaad`. The actual Vite 8 module worker returned `kind: matched` with `differences: []`; the declared and recalculated input, run, costs-array and outcomes-array hashes were identical. This evidence is bound to implementation hold `9b5900c28d8604c97fe79d5318a0ca30445a08c2cfeb7e3f304d413e5f276635`; the following acceptance edit changes no runtime source.

At the actual 390-pixel viewport, client width and scroll width were both 390. The bounded application warning/error result was empty. This covers one selected file, the root deployment shape and one narrow Chrome layout. No library Save or Copy action was invoked. File authority was canceled through the UI; the owned tab and static server were closed and the viewport override was reset.

Native Save, complete workspace recovery, other browser/layout combinations and integrated Learning behavior remain unverified for this migration. A numerical match supplies no observation, source verification or independent scientific review.

### Commands and release gates

```sh
npm ci
npm run check:model-reference
npm run build
npm run check
```

For the subpath build, set both `SITE_URL=https://theguysaccount.github.io` and `BASE_PATH=/charitology/` on the build command. Builds regenerate origin-specific extension downloads; rebuild with the default environment before reviewing canonical packages. The full alternate-command limitation above remains explicit.

A separate AI read-only review supplies no human or institutional approval. Exact CI, integration with pending Learning work, staged/live preservation and release verification remain gates. The bounded native check's browser/server resources were cleaned up. No database, provider configuration, mail, payment or deployment action was introduced by this experiment.
