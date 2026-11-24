import { SITE, absolute } from './site';
import {
  FUNDING_FLOW_GROUPS,
  GLOBAL_CHARITY_INDEX_PANELS,
  type FundingFlowCatalogItem,
  type JurisdictionPanel,
} from './global-index-catalog';

export interface BreadcrumbInput {
  label: string;
  href?: string;
}

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
    sameAs: [
      'https://github.com/theguysaccount/charitology',
      'https://os.charitology.org/',
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
