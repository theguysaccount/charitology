import type { APIRoute } from 'astro';
import {
  FUNDING_FLOW_GROUPS,
  GLOBAL_CHARITY_INDEX_PANELS,
  GLOBAL_CHARITY_INDEX_TOTAL_RECORDS,
} from '../lib/global-index-catalog';
import { absolute } from '../lib/site';
import { wave1, usStatePath, US_BASE, EW_BASE, WAVE1_BASE, WAVE1_DATA_PATH } from '../lib/registry-wave1';
import { wave1b, sentence, SC_BASE, AU_BASE, CA_BASE, CAUSE_PATH, WAVE1B_DATA_PATH, WAVE1B_SITEMAP } from '../lib/registry-wave1b';
import { wave1c, DOSSIER_KEYS, HUB_KEYS, WAVE1C_DATA_PATH, WAVE1C_SITEMAP } from '../lib/registry-wave1c';
import { wave1d, W1D_KEYS, WAVE1D_DATA_PATH, WAVE1D_SITEMAP } from '../lib/registry-wave1d';

// The registry sections of llms.txt are plain ASCII; labels in other scripts are listed by URL only.
const ascii = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '');

export const GET: APIRoute = ({ site }) => {
  const lookupCount = FUNDING_FLOW_GROUPS[0].items.length;
  const caseCount = FUNDING_FLOW_GROUPS[1].items.length;
  const totalFlows = lookupCount + caseCount;
  const w = wave1();
  const b = wave1b();
  const c = wave1c();
  const cTotal = DOSSIER_KEYS.reduce((n, k) => n + c.sorted[k].length, 0);
  const d = wave1d();
  const dTotal = W1D_KEYS.reduce((n, k) => n + d.sorted[k].length, 0);

  const lines: string[] = [
    '# Charitology',
    '',
    '> Open-source public charity registry index, funding-flow datasets, giving methodology, and free Charity OS workspace.',
    '',
    '## Fast Entrypoints for AI Agents & Tools',
    '',
    '- Public MCP Server (read-only): https://os.charitology.org/mcp',
    '- MCP Setup Guide: https://os.charitology.org/mcp.html',
    '- Glama MCP Connector Listing: https://glama.ai/mcp/connectors/io.github.theguysaccount/charitology',
    `- Public JSON API Catalog (42 endpoints): ${absolute('/api/v1/index.json', site)}`,
    `- Public API Documentation & Interactive Explorer: ${absolute('/tools/public-api/', site)}`,
    `- Global Charity Index Catalog JSON (${GLOBAL_CHARITY_INDEX_PANELS.length} jurisdictions, ${GLOBAL_CHARITY_INDEX_TOTAL_RECORDS.toLocaleString('en-US')} records): ${absolute('/api/v1/charity-index.json', site)}`,
    `- Global Charity Index Coverage Page: ${absolute('/record/charity-index/coverage/', site)}`,
    `- Funding Flows Catalog JSON (${totalFlows} lookups & cases): ${absolute('/api/v1/funding-flows.json', site)}`,
    `- The Diagnosis (15 System Conditions, starting with C01 Missing Feedback Loop): ${absolute('/diagnosis/', site)} | C01: ${absolute('/diagnosis/missing-feedback-loop/', site)}`,
    '- Charity OS (free open-source charity back-office workspace with full JSON export): https://os.charitology.org/',
    `- Tools & Agent Quickstart: ${absolute('/tools/', site)}`,
    `- Free Things, Credits & Grants for Charities (65 verified programs): ${absolute('/for-charities/free/', site)} | JSON: ${absolute('/data/free-charity-resources.json', site)}`,
    `- Frozen Nonprofit Benefits Directory (Charity OS linked): ${absolute('/for-charities/benefits/', site)}`,
    `- Institutional, Nonprofit & Data Partnership Inquiries (open collaboration, zero paywalls): ${absolute('/tools/public-api/#partnership-inquiry', site)} | ${absolute('/for-charities/free/#partnership-inquiry', site)}`,
    '',
    '## Core Integrity Rules for Agents Reading Charitology',
    '',
    '- No charity ratings or overhead scores: depth classifications (relief -> repair -> prevention -> structure -> source) are falsifiable hypotheses, never quality grades.',
    '- Preserve native currencies, source dates, legal forms, and explicit missingness (null is missing/unreported, never zero).',
    '- Preserve source-specific reuse terms and government attribution from each dataset manifest.',
    '- The public MCP server is strictly read-only and never accesses private Charity OS accounts, donors, or files.',
    '',
    `## Global Charity Index (${GLOBAL_CHARITY_INDEX_PANELS.length} Jurisdictions | ${GLOBAL_CHARITY_INDEX_TOTAL_RECORDS.toLocaleString('en-US')} Dated Records)`,
    '',
    ...GLOBAL_CHARITY_INDEX_PANELS.map(
      (p) =>
        `- [${p.name} (${p.recordCount.toLocaleString('en-US')} ${p.recordUnit})](${absolute(p.route, site)}): ${p.source}${p.manifest ? ` | manifest: ${absolute(p.manifest, site)}` : ''}`,
    ),
    '',
    `## Verified Charity Dossiers, Wave 1 (${(w.us.length + w.ew.length).toLocaleString('en-US')} Organizations | Official Registry Figures, No Ratings)`,
    '',
    `- [Wave 1 index](${absolute(WAVE1_BASE, site)}): one page per organization with source file, record number and SHA-256 fingerprint | manifest: ${absolute(`${WAVE1_DATA_PATH}manifest.json`, site)}`,
    `- [United States (${w.us.length.toLocaleString('en-US')} IRS Form 990 dossiers)](${absolute(US_BASE, site)}): IRS EO BMF + IRS SOI Form 990 extracts | data: ${absolute(`${WAVE1_DATA_PATH}us-form-990-dossiers.json`, site)}`,
    `- [England and Wales (${w.ew.length.toLocaleString('en-US')} Charity Commission dossiers)](${absolute(EW_BASE, site)}): register, classification and annual return history | data: ${absolute(`${WAVE1_DATA_PATH}england-wales-dossiers.json`, site)}`,
    `- U.S. state hubs (${w.stateHubs.length}): ${w.stateHubs.map((st) => absolute(usStatePath(st), site)).join(' | ')}`,
    `- NTEE major-group hubs (${w.groupHubs.length}): ${w.groupHubs.map((g) => `[${w.groupLabel(g)}](${absolute(w.groupPath(g), site)})`).join(' | ')}`,
    `- U.S. state x NTEE group hubs (${w.stateGroupHubs.length}, each with >= ${w.stateMin} dossiers): listed in ${absolute('/sitemap-registries-wave1.xml', site)}`,
    `- England and Wales purpose hubs (${w.purposeHubs.length}): ${w.purposeHubs.map((c) => `[${w.ewHubs.purposes[c].description}](${absolute(w.purposePath(c), site)})`).join(' | ')}`,
    '',
    `## Verified Charity Dossiers, Wave 1b (${(b.sc.length + b.au.length + b.ca.length).toLocaleString('en-US')} Organizations | Scotland, Australia, Canada | No Ratings)`,
    '',
    `- [Scotland (${b.sc.length.toLocaleString('en-US')} OSCR dossiers, gross income >= GBP ${b.manifest.selection.scotland.thresholdGBP.toLocaleString('en-US')})](${absolute(SC_BASE, site)}): Scottish Charity Register download + OSCR five-year return export | data: ${absolute(`${WAVE1B_DATA_PATH}scotland-dossiers.json`, site)}`,
    `- [Australia (${b.au.length.toLocaleString('en-US')} ACNC dossiers, total revenue >= AUD ${b.manifest.selection.australia.thresholdAUD.toLocaleString('en-US')})](${absolute(AU_BASE, site)}): ACNC Registered Charities dataset + AIS 2023/2024 | data: ${absolute(`${WAVE1B_DATA_PATH}australia-dossiers.json`, site)}`,
    `- [Canada (${b.ca.length.toLocaleString('en-US')} CRA dossiers, T3010 line 4700 >= CAD ${b.manifest.selection.canada.thresholdCAD.toLocaleString('en-US')})](${absolute(CA_BASE, site)}): CRA List of charities identification + T3010 financial files | data: ${absolute(`${WAVE1B_DATA_PATH}canada-dossiers.json`, site)}`,
    `- [Cause x Country index](${absolute(CAUSE_PATH, site)}): ${b.causes.groups.length} label-level cause groups across NTEE, Charity Commission, OSCR, ACNC and CRA labels; categories are not identical across registers and this is not a crosswalk | data: ${absolute(`${WAVE1B_DATA_PATH}cause-groups.json`, site)}`,
    `- Wave 1b manifest (sources, retrieval times, SHA-256): ${absolute(`${WAVE1B_DATA_PATH}manifest.json`, site)} | sitemap: ${absolute(`/${WAVE1B_SITEMAP}`, site)}`,
    `- Scotland purpose hubs (${b.scPurposeHubs.length}, each with >= ${b.hubMin} dossiers): ${b.scPurposeHubs.map((p) => `[${sentence(p)}](${absolute(b.scPurposePath(p), site)})`).join(' | ')}`,
    `- Australia charity subtype hubs (${b.auSubtypeHubs.length}, each with >= ${b.hubMin} dossiers): ${b.auSubtypeHubs.map((c) => `[${b.subtypeLabel(c)}](${absolute(b.auSubtypePath(c), site)})`).join(' | ')}`,
    `- Canada category hubs (${b.caCategoryHubs.length}, each with >= ${b.hubMin} dossiers): ${b.caCategoryHubs.map((c) => `[${b.categoryLabel(c)} (${c})](${absolute(b.caCategoryPath(c), site)})`).join(' | ')}`,
    `- Canada designation hubs (${b.caDesignationHubs.length}, each with >= ${b.hubMin} dossiers): ${b.caDesignationHubs.map((c) => `[${b.designationLabel(c)} (${c})](${absolute(b.caDesignationPath(c), site)})`).join(' | ')}`,
    '',
    `## Verified Charity Dossiers, Wave 1c (${cTotal.toLocaleString('en-US')} Organizations | ${DOSSIER_KEYS.length} National Registers with Figures + ${HUB_KEYS.length} Register-Hub Countries | No Ratings)`,
    '',
    `- Wave 1c manifest (committed editions, capture dates, sizes, SHA-256): ${absolute(`${WAVE1C_DATA_PATH}manifest.json`, site)} | sitemap: ${absolute(`/${WAVE1C_SITEMAP}`, site)} | cause groups: ${absolute(`${WAVE1C_DATA_PATH}cause-groups.json`, site)}`,
    ...DOSSIER_KEYS.map((k) => `- [${c.D[k].country} (${c.sorted[k].length.toLocaleString('en-US')} dossiers, ${ascii(c.D[k].register)})](${absolute(c.base(c.D[k].slug), site)}): threshold ${c.sel[k].threshold.currency} ${Number(c.sel[k].threshold.value).toLocaleString('en-US')}${c.sel[k].threshold.unit ? ` ${c.sel[k].threshold.unit}` : ''} on ${c.sel[k].threshold.line} | data: ${absolute(`${WAVE1C_DATA_PATH}${k}-dossiers.json`, site)}`),
    ...DOSSIER_KEYS.filter((k) => c.dossierHubs[k].length).map((k) => `- ${c.D[k].country} ${ascii(c.D[k].labelNoun!)} hubs (${c.dossierHubs[k].length}, each with >= ${c.hubMin} dossiers): ${c.dossierHubs[k].map((l) => absolute(c.dossierHubPath(k, l), site)).join(' | ')}`),
    ...HUB_KEYS.map((k) => `- [${c.H[k].country} register hubs (${c.registryHubKeys(k).length}, ${ascii(c.H[k].labelPlural)}, no per-organization figures in the edition)](${absolute(c.base(c.H[k].slug), site)}): ${c.registryHubKeys(k).map((key) => absolute(c.registryHubPath(k, key), site)).join(' | ')} | data: ${absolute(`${WAVE1C_DATA_PATH}${k}-hubs.json`, site)}`),
    `- [Cause x Country index](${absolute(CAUSE_PATH, site)}) also sets the Wave 1c registers' own labels side by side (${c.causes.groups.length} groups; Wave 1b stems plus stems for labels in Swedish, Spanish, German, Latvian and Croatian); not a crosswalk.`,
    '',
    `## Verified Charity Dossiers, Wave 1d (${dTotal.toLocaleString('en-US')} Organizations | ${W1D_KEYS.length} National Registers Rebuilt from Official Downloads | Figures Exactly as Published | No Ratings)`,
    '',
    `- Wave 1d manifest (official file URLs, retrieval times, sizes, SHA-256; compact source extracts): ${absolute(`${WAVE1D_DATA_PATH}manifest.json`, site)} | sitemap: ${absolute(`/${WAVE1D_SITEMAP}`, site)} | cause groups: ${absolute(`${WAVE1D_DATA_PATH}cause-groups.json`, site)}`,
    ...W1D_KEYS.map((k) => `- [${d.D[k].country} (${d.sorted[k].length.toLocaleString('en-US')} dossiers, ${ascii(d.D[k].register)})](${absolute(d.base(k), site)}): threshold ${d.sel[k].threshold.currency} ${d.sel[k].threshold.value} on ${d.sel[k].threshold.line} | data: ${absolute(`${WAVE1D_DATA_PATH}${k}-dossiers.json`, site)} | extract: ${absolute(`${WAVE1D_DATA_PATH}${d.manifest.extracts[k].path}`, site)}`),
    ...W1D_KEYS.filter((k) => d.hubKeys[k].length).map((k) => `- ${d.D[k].country} ${ascii(d.D[k].labelNoun!)} hubs (${d.hubKeys[k].length}, each with >= ${d.hubMin} dossiers): ${d.hubKeys[k].map((l) => absolute(d.hubPath(k, l), site)).join(' | ')}`),
    '- Slovenia covers only recipients in section 1 (non-governmental organizations in the public interest) of the Government 2025 list of eligible recipients; political parties, trade unions, religious communities and schools are excluded.',
    `- [Cause x Country index](${absolute(CAUSE_PATH, site)}) also sets the Israel and Italy labels side by side (${d.causes.groups.length} groups; Wave 1b stems plus stems for Hebrew and Italian labels); not a crosswalk.`,
    '',
    `## Key Funding-Flow Datasets (${lookupCount} Lookups, ${caseCount} Case Studies)`,
    '',
    `- [Browse all ${totalFlows} funding flows](${absolute('/record/funding-flows/', site)})`,
    `- [European 5-Country Percentage Tax-Assignment Observatory](${absolute('/record/funding-flows/europe-tax-assignment-compare/', site)})`,
    `- [EU Transparency Register Civil Society & EUR 7.80B EU Grants Explorer](${absolute('/record/funding-flows/eu-transparency-register-ngos/', site)})`,
    `- [UN OCHA FTS Global Humanitarian Funding Gaps (2019-2026)](${absolute('/record/funding-flows/ocha-fts-global-clusters/', site)})`,
    `- [Italy 5 per mille IRPEF Allocations (AF 2025, EUR 603.10M)](${absolute('/record/funding-flows/italy-five-per-mille/', site)})`,
    `- [Poland 1.5% PIT Designations (2022-2025)](${absolute('/record/funding-flows/poland-pit-1-5-percent/', site)})`,
    `- [Slovakia 2%/3% Income-Tax Assignments (2016-2025)](${absolute('/record/funding-flows/slovakia-pit-2-percent/', site)})`,
    `- [Hungary 1%+1% SZJA Designations (2024-2026)](${absolute('/record/funding-flows/hungary-szja-1-percent/', site)})`,
    `- [Slovenia 1% Income-Tax Allocations (2019-2025, EUR 93.47M)](${absolute('/record/funding-flows/slovenia-dohodnina-1-percent/', site)})`,
    `- [Hong Kong Approved Charitable Fund-Raising Permits (GovHK)](${absolute('/record/funding-flows/hong-kong-fundraising-permits/', site)})`,
    `- [2024-2026 OpenFEMA Federal Disaster Captures](${absolute('/disasters/2024-2026-emergencies/', site)})`,
    '',
    '## Key Public API Endpoints',
    '',
    `- ${absolute('/api/v1/charity-index.json', site)}`,
    `- ${absolute('/api/v1/funding-flows.json', site)}`,
    `- ${absolute('/api/v1/interventions.json', site)}`,
    `- ${absolute('/api/v1/nonprofit-benefits.json', site)}`,
    `- ${absolute('/api/v1/nonprofit-tools.json', site)}`,
    `- ${absolute('/api/v1/conditions.json', site)}`,
    `- ${absolute('/api/v1/open-problems.json', site)}`,
    `- ${absolute('/api/v1/checklist.json', site)}`,
    `- ${absolute('/sitemap.xml', site)} (sitemap index: ${absolute('/sitemap-core.xml', site)} | ${absolute('/sitemap-registries-wave1.xml', site)} | ${absolute(`/${WAVE1B_SITEMAP}`, site)} | ${absolute(`/${WAVE1C_SITEMAP}`, site)} | ${absolute(`/${WAVE1D_SITEMAP}`, site)})`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
