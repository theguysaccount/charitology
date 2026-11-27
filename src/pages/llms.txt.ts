import type { APIRoute } from 'astro';
import {
  FUNDING_FLOW_GROUPS,
  GLOBAL_CHARITY_INDEX_PANELS,
  GLOBAL_CHARITY_INDEX_TOTAL_RECORDS,
} from '../lib/global-index-catalog';
import { absolute } from '../lib/site';
import { wave1, usStatePath, US_BASE, EW_BASE, WAVE1_BASE, WAVE1_DATA_PATH } from '../lib/registry-wave1';

export const GET: APIRoute = ({ site }) => {
  const lookupCount = FUNDING_FLOW_GROUPS[0].items.length;
  const caseCount = FUNDING_FLOW_GROUPS[1].items.length;
  const totalFlows = lookupCount + caseCount;
  const w = wave1();

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
    `- ${absolute('/sitemap.xml', site)} (sitemap index: ${absolute('/sitemap-core.xml', site)} | ${absolute('/sitemap-registries-wave1.xml', site)})`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
