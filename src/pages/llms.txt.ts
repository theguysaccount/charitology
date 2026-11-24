import type { APIRoute } from 'astro';
import {
  FUNDING_FLOW_GROUPS,
  GLOBAL_CHARITY_INDEX_PANELS,
  GLOBAL_CHARITY_INDEX_TOTAL_RECORDS,
} from '../lib/global-index-catalog';
import { absolute } from '../lib/site';

export const GET: APIRoute = ({ site }) => {
  const lookupCount = FUNDING_FLOW_GROUPS[0].items.length;
  const caseCount = FUNDING_FLOW_GROUPS[1].items.length;
  const totalFlows = lookupCount + caseCount;

  const lines: string[] = [
    '# Charitology',
    '',
    '> Open-source public charity registry index, funding-flow datasets, giving methodology, and free Charity OS workspace.',
    '',
    '## Fast Entrypoints for AI Agents & Tools',
    '',
    '- Public MCP Server (read-only): https://os.charitology.org/mcp',
    '- MCP Setup Guide: https://os.charitology.org/mcp.html',
    `- Public JSON API Catalog (42 endpoints): ${absolute('/api/v1/index.json', site)}`,
    `- Global Charity Index Catalog JSON (${GLOBAL_CHARITY_INDEX_PANELS.length} jurisdictions, ${GLOBAL_CHARITY_INDEX_TOTAL_RECORDS.toLocaleString('en-US')} records): ${absolute('/api/v1/charity-index.json', site)}`,
    `- Funding Flows Catalog JSON (${totalFlows} lookups & cases): ${absolute('/api/v1/funding-flows.json', site)}`,
    '- Charity OS (free open-source charity back-office workspace with full JSON export): https://os.charitology.org/',
    `- Tools & Agent Quickstart: ${absolute('/tools/', site)}`,
    `- Free Things, Credits & Grants for Charities (65 verified programs): ${absolute('/for-charities/free/', site)} | JSON: ${absolute('/data/free-charity-resources.json', site)}`,
    `- Frozen Nonprofit Benefits Directory (Charity OS linked): ${absolute('/for-charities/benefits/', site)}`,
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
    `## Key Funding-Flow Datasets (${lookupCount} Lookups, ${caseCount} Case Studies)`,
    '',
    `- [Browse all ${totalFlows} funding flows](${absolute('/record/funding-flows/', site)})`,
    `- [UN OCHA FTS Global Humanitarian Funding Gaps (2019-2026)](${absolute('/record/funding-flows/ocha-fts-global-clusters/', site)})`,
    `- [Italy 5 per mille IRPEF Allocations (AF 2025, EUR 603.10M)](${absolute('/record/funding-flows/italy-five-per-mille/', site)})`,
    `- [Poland 1.5% PIT Designations (2022-2025)](${absolute('/record/funding-flows/poland-pit-1-5-percent/', site)})`,
    `- [Slovakia 2%/3% Income-Tax Assignments (2016-2025)](${absolute('/record/funding-flows/slovakia-pit-2-percent/', site)})`,
    `- [Hungary 1%+1% SZJA Designations (2024-2026)](${absolute('/record/funding-flows/hungary-szja-1-percent/', site)})`,
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
    `- ${absolute('/sitemap.xml', site)}`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
