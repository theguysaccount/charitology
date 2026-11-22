# Source-link and store-kit audit addendum

Date: November 22, 2026. AI-assisted maintenance audit; this is **not** the independent second-human source review required by `STYLE.md` and [Issue #1](https://github.com/theguysaccount/charitology/issues/1). **No content entry was changed from `draft` to `reviewed`.**

## Scope

- Checked all **217** Markdown content files under `src/content/` for Markdown link-parenthesis truncation bugs (0 found) and audited all **346** unique external YAML source URLs.
- Audited `docs/extension-store-listing.md` against the live `0.1.3` (`https://charitology.com`) release baseline in `scripts/lib/extension-release-baselines.json` for [Issue #2](https://github.com/theguysaccount/charitology/issues/2).

## Verified findings and updates

1. **Retired source host queued for next Research Ledger edition (`src/content/encyclopedia/participatory-grantmaking.md`):** `https://learningforfunders.candid.org/wp-content/uploads/sites/2/2018/12/DecidingTogether_Final_20181002.pdf` failed DNS resolution (NXDOMAIN) on November 22, 2026. Because encyclopedia sources are hash-pinned in the frozen Research Ledger `v1` edition (`src/data/research-ledger/versions/version--concept-participatory-grantmaking-v1.json`), the file was intentionally preserved unchanged pending a superseding Research Ledger capture. Verified live replacement ready for that capture: Candid’s IssueLab record [`https://participatorygrantmaking.issuelab.org/resource/deciding-together-shifting-power-and-resources-through-participatory-grantmaking.html`](https://participatorygrantmaking.issuelab.org/resource/deciding-together-shifting-power-and-resources-through-participatory-grantmaking.html) (HTTP 200 on November 22, 2026, `<title>Deciding Together: Shifting Power and Resources Through Participatory Grantmaking</title>`).
2. **Domain consistency (`src/content/tools/public-api.md`):** Updated the CC BY 4.0 attribution line from `charitology.org` to `charitology.com` to match the canonical public site domain.
3. **Browser extension store kit refreshed (`docs/extension-store-listing.md`):** Updated version references from `0.1.2` to `0.1.3`, updated Homepage and Privacy URLs to `https://charitology.com/tools/browser-extension/` and `https://charitology.com/tools/browser-extension/privacy/`, and added exact SHA-256 package digests matching `scripts/lib/extension-release-baselines.json`. No store acceptance or installed-browser verification is claimed.

## External URLs returning bot-protection responses (not dead)

- Three `consumer.ftc.gov` URLs (`giving-charity`, `donating-through-crowdfunding-social-media-and-fundraising-platforms`, `help-people-affected-flooding-texas-not-scammer`) and several DOI/publisher endpoints (`doi.org/10.1001/...`, `doi.org/10.1002/...`, `unep.org`, `malariaconsortium.org`, `efsa.europa.eu`) returned Akamai/Cloudflare HTTP 403/404/429 responses to non-browser automated requests. Those links were left unchanged rather than altered without browser verification.
- `doi.org/10.1017/S1930297500007452`, `journal.sjdm.org/7303a/jdm7303a.htm`, `nzf.org.uk/knowledge/what-is-zakat`, and `nzf.org.uk/knowledge/zakat-and-your-family/` all returned HTTP 200 when checked with modern TLS (`curl`).
