import { SITE, absolute } from './site';
import {
  FUNDING_FLOW_GROUPS,
  GLOBAL_CHARITY_INDEX_PANELS,
  GLOBAL_CHARITY_INDEX_TOTAL_RECORDS,
  type FundingFlowCatalogItem,
  type JurisdictionPanel,
} from './global-index-catalog';
import freeCharityData from '../data/free-charity-resources.json';

export interface BreadcrumbInput {
  label: string;
  href?: string;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export const HOME_FAQS: readonly FaqEntry[] = [
  {
    question: 'What is Charitology and what open datasets does it publish?',
    answer: `Charitology is an open-source field and public reference project studying charity as a system. It publishes the Global Charity Index (${GLOBAL_CHARITY_INDEX_PANELS.length} official jurisdictions and ${GLOBAL_CHARITY_INDEX_TOTAL_RECORDS.toLocaleString('en-US')} dated records), 48 public funding-flow lookups and case studies, 42 static JSON API endpoints, a read-only MCP server (https://os.charitology.org/mcp), and 65 verified free software and grant programs for nonprofits.`,
  },
  {
    question: 'Does Charitology publish charity ratings or overhead scores?',
    answer: 'No. Charitology deliberately avoids charity star ratings and overhead ratios. Its five-level source-depth scale (relief, repair, prevention, structure, source) classifies where work acts on a problem as a falsifiable hypothesis, never a quality grade.',
  },
  {
    question: 'How does the Diagnosis explain the Missing Feedback Loop in philanthropy?',
    answer: 'In donor-funded services, the person paying is often not the person using the service—what legal scholar Henry Hansmann called contract failure. Charitology maps 15 system conditions, starting with Condition C01 (The Missing Feedback Loop), alongside open research problems and testable interventions.',
  },
  {
    question: 'Can nonprofits, foundations, and AI agents use Charitology data and Charity OS for free?',
    answer: 'Yes. Charitology schema and editorial datasets are licensed under CC BY 4.0 with no API key required, Charity OS (https://os.charitology.org/) is MIT-licensed open-source software with full JSON backup export, and institutions can reach the team via /tools/public-api/#partnership-inquiry for onboarding or jurisdiction registry collaboration.',
  },
];

export const PUBLIC_API_FAQS: readonly FaqEntry[] = [
  {
    question: 'Do I need an API key or account to query Charitology JSON endpoints?',
    answer: 'No. All 42 static JSON endpoints under /api/v1/ (indexed at /api/v1/index.json) and the read-only MCP server at https://os.charitology.org/mcp are openly accessible with no API key or registration.',
  },
  {
    question: 'What license applies to Charitology Public API datasets?',
    answer: 'Charitology schemas and editorial content use CC BY 4.0 with attribution to Charitology (charitology.com). Underlying government registries and third-party filings retain their own source dates, attribution, and reuse terms documented in each dataset manifest.',
  },
  {
    question: 'How can institutions or nonprofits request custom registry coverage or integration help?',
    answer: 'Foundations, nonprofits, researchers, and donation platforms can submit an institutional data or Charity OS partnership inquiry directly on /tools/public-api/#partnership-inquiry or open a public issue on GitHub.',
  },
];

export const FREE_CHARITY_FAQS: readonly FaqEntry[] = [
  {
    question: 'Are the programs listed on Charitology free to use, or are some discounted?',
    answer: `Every listing states its exact cost tier up front: ${freeCharityData.items.filter((i) => i.tier === 'free').length} programs are 100% free or donated to eligible charities, ${freeCharityData.items.filter((i) => i.tier === 'grant').length} provide cloud credits, ad grants, or donated goods, and ${freeCharityData.items.filter((i) => i.tier === 'discount').length} offer verified nonprofit discounts. Charitology accepts no affiliate fees or sponsorships.`,
  },
  {
    question: 'What is the fastest way for a charity to unlock most of these offers?',
    answer: 'Register once with TechSoup and once with Goodstack (often triggered through Google for Nonprofits, Canva for Nonprofits, or OpenAI for Nonprofits). Completing those two free nonprofit verifications satisfies the eligibility check for most major cloud, productivity, design, and AI programs.',
  },
  {
    question: 'Is Charitology Charity OS really free and open source?',
    answer: 'Yes. Charity OS (https://os.charitology.org/) is MIT-licensed open-source software with 26 back-office modules for volunteers, programs, grant periods, and public participation forms, plus full JSON backup export so charities never face vendor lock-in.',
  },
  {
    question: 'Can nonprofit directories, journalists, or AI agents reuse this directory data?',
    answer: 'Yes. The full verified list is published as an open CC BY 4.0 JSON file at /data/free-charity-resources.json and can also be exported as CSV directly from this page or queried alongside our 31-country Global Charity Index via /llms.txt and our read-only MCP server at https://os.charitology.org/mcp.',
  },
];

const normalizePath = (value: string) => {
  const clean = value.split(/[?#]/, 1)[0] || '/';
  return clean.endsWith('/') ? clean : `${clean}/`;
};

const panelByRoute = new Map<string, JurisdictionPanel>(
  GLOBAL_CHARITY_INDEX_PANELS.map((panel) => [normalizePath(panel.route), panel]),
);

const fundingFlowByRoute = new Map<string, FundingFlowCatalogItem>(
  FUNDING_FLOW_GROUPS.flatMap((group) =>
    group.items.map((item) => [normalizePath(`/record/funding-flows/${item.slug}/`), item] as const),
  ),
);

function organizationNode(site: URL | undefined) {
  const origin = absolute('/', site);
  return {
    '@type': 'Organization',
    '@id': `${origin}#organization`,
    name: SITE.name,
    url: origin,
    description: SITE.description,
    logo: absolute('/apple-touch-icon.png', site),
    knowsAbout: [
      'Charity registries and public nonprofit filings',
      'Philanthropy systems analysis and feedback loops',
      'Open nonprofit datasets and public JSON APIs',
      'Free software, cloud credits, and grants for charities',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Institutional Data & Nonprofit Partnerships',
      url: absolute('/tools/public-api/#partnership-inquiry', site),
    },
    sameAs: [
      'https://github.com/theguysaccount/charitology',
      'https://os.charitology.org/',
      'https://glama.ai/mcp/connectors/io.github.theguysaccount/charitology',
    ],
  };
}

export function buildStructuredData({
  sitePath,
  canonical,
  site,
  title,
  description,
  crumbs,
}: {
  sitePath: string;
  canonical: string;
  site: URL | undefined;
  title?: string;
  description: string;
  crumbs?: BreadcrumbInput[];
}): Record<string, unknown>[] {
  const normalized = normalizePath(sitePath);
  const origin = absolute('/', site);
  const nodes: Record<string, unknown>[] = [];

  if (normalized === '/') {
    nodes.push({
      '@context': 'https://schema.org',
      ...organizationNode(site),
    });
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${origin}#website`,
      name: SITE.name,
      url: origin,
      description: SITE.description,
      publisher: { '@id': `${origin}#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${absolute('/search/', site)}?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    });
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Charitology Global Charity Index & Open Funding-Flow Datasets',
      description: `Open-source index spanning ${GLOBAL_CHARITY_INDEX_PANELS.length} official charity and nonprofit jurisdictions (${GLOBAL_CHARITY_INDEX_TOTAL_RECORDS.toLocaleString('en-US')} dated records) plus 42 static JSON API endpoints preserving native currencies, source dates, legal forms, and explicit missingness.`,
      url: absolute('/record/charity-index/coverage/', site),
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      creator: { '@id': `${origin}#organization` },
      distribution: [
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: absolute('/api/v1/index.json', site),
        },
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: absolute('/api/v1/charity-index.json', site),
        },
      ],
    });
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: HOME_FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    });
    return nodes;
  }

  if (crumbs && crumbs.length > 0) {
    const items = [
      {
        '@type': 'ListItem',
        position: 1,
        name: SITE.name,
        item: origin,
      },
      ...crumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 2,
        name: crumb.label,
        item: crumb.href ? absolute(crumb.href, site) : canonical,
      })),
    ];
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items,
    });
  }

  const panel = panelByRoute.get(normalized);
  if (panel) {
    const dataset: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: title ?? `${panel.name} — Global Charity Index`,
      description: `${panel.coverage}${panel.boundary ? ` ${panel.boundary}` : ''}`,
      url: canonical,
      spatialCoverage: panel.name,
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      creator: {
        '@type': 'Organization',
        name: SITE.name,
        url: origin,
      },
      publisher: {
        '@type': 'Organization',
        name: panel.source,
      },
    };
    if (panel.date && /^\d{4}-\d{2}-\d{2}$/.test(panel.date)) {
      dataset.dateModified = panel.date;
    }
    if (panel.manifest) {
      dataset.distribution = [
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: absolute(panel.manifest, site),
        },
      ];
    }
    nodes.push(dataset);
    return nodes;
  }

  const flow = fundingFlowByRoute.get(normalized);
  if (flow) {
    const dataset: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: title ?? flow.title,
      description: flow.summary,
      url: canonical,
      spatialCoverage: flow.scope,
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      creator: {
        '@type': 'Organization',
        name: SITE.name,
        url: origin,
      },
    };
    const downloadPath = flow.manifest ?? flow.dataJson;
    if (downloadPath) {
      dataset.distribution = [
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: absolute(downloadPath, site),
        },
      ];
    }
    nodes.push(dataset);
    return nodes;
  }

  if (normalized === '/for-charities/free/') {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title ?? 'Free things, credits & grants for charities',
      description,
      url: canonical,
      isPartOf: { '@id': `${origin}#website` },
      mainEntity: {
        '@type': 'ItemList',
        name: 'Verified free software, credits, grants & discounts for charities',
        numberOfItems: freeCharityData.items.length,
        itemListElement: freeCharityData.items.map((item, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: item.name,
          url: item.url,
          description: item.offer,
        })),
      },
    });
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Charitology Free Things, Credits & Grants for Charities Directory',
      description,
      url: canonical,
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      dateModified: freeCharityData.checkedOn,
      creator: {
        '@type': 'Organization',
        name: SITE.name,
        url: origin,
      },
      distribution: [
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: absolute('/data/free-charity-resources.json', site),
        },
      ],
    });
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FREE_CHARITY_FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    });
    return nodes;
  }

  if (normalized === '/tools/') {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Charitology Charity OS',
      description:
        'Free MIT open-source charity back-office workspace with 26 modules for volunteers, programs, grant-period reporting, public participation forms, full JSON backup export, and a read-only public MCP server.',
      url: 'https://os.charitology.org/',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser',
      isAccessibleForFree: true,
      license: 'https://opensource.org/licenses/MIT',
      softwareHelp: 'https://os.charitology.org/mcp.html',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      publisher: {
        '@type': 'Organization',
        name: SITE.name,
        url: origin,
      },
    });
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Charitology Charity OS, MCP Server & Everyday Browser Tools',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Charity OS (Free Open-Source Workspace)', url: 'https://os.charitology.org/' },
        { '@type': 'ListItem', position: 2, name: 'Charitology Public MCP Server & Agent Guide', url: 'https://os.charitology.org/mcp.html' },
        { '@type': 'ListItem', position: 3, name: 'Charity Lookup', url: absolute('/tools/charity-lookup/', site) },
        { '@type': 'ListItem', position: 4, name: 'Due Diligence Checklist', url: absolute('/tools/due-diligence-checklist/', site) },
        { '@type': 'ListItem', position: 5, name: 'Compare Tool', url: absolute('/tools/compare-tool/', site) },
        { '@type': 'ListItem', position: 6, name: 'Giving Dashboard', url: absolute('/tools/giving-dashboard/', site) },
      ],
    });
    return nodes;
  }

  if (normalized === '/record/charity-index/coverage/') {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Charitology Global Charity Index',
      description: `Open-source index spanning ${GLOBAL_CHARITY_INDEX_PANELS.length} official charity and nonprofit jurisdictions (${GLOBAL_CHARITY_INDEX_TOTAL_RECORDS.toLocaleString('en-US')} dated records across five continents) preserving original legal forms, native currencies, explicit nulls, and SHA-256 manifests.`,
      url: canonical,
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      creator: {
        '@type': 'Organization',
        name: SITE.name,
        url: origin,
      },
      distribution: [
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: absolute('/api/v1/charity-index.json', site),
        },
      ],
    });
    return nodes;
  }

  if (normalized === '/record/funding-flows/') {
    const totalFlows = FUNDING_FLOW_GROUPS.reduce((sum, g) => sum + g.items.length, 0);
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Charitology Public Funding Flows',
      description: `${totalFlows} public funding-flow lookups and case studies tracking government grants, percentage tax-assignment designations across Europe, EU Transparency Register civil-society grants, and humanitarian funding gaps.`,
      url: canonical,
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      creator: {
        '@type': 'Organization',
        name: SITE.name,
        url: origin,
      },
      distribution: [
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: absolute('/api/v1/funding-flows.json', site),
        },
      ],
    });
    return nodes;
  }

  if (normalized === '/tools/public-api/') {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Charitology Public JSON API',
      description,
      url: canonical,
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      creator: {
        '@type': 'Organization',
        name: SITE.name,
        url: origin,
      },
      distribution: [
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: absolute('/api/v1/index.json', site),
        },
      ],
    });
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: PUBLIC_API_FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    });
  }

  if (normalized.startsWith('/tools/') && normalized !== '/tools/') {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: title ?? SITE.name,
      description,
      url: canonical,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web browser',
      isAccessibleForFree: true,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      publisher: {
        '@type': 'Organization',
        name: SITE.name,
        url: origin,
      },
    });
  }

  return nodes;
}
