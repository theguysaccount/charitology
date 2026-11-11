import type { SymbolName } from './site-identities';

// Identify the kind of source that will open, independent of its evidence grade.
export function sourceSymbol(href: string): SymbolName {
  const address = new URL(href, 'https://charitology.com');
  const { hostname, pathname } = address;
  if (/\.pdf$/i.test(pathname)) return 'document';
  if (/\.(?:csv|tsv|xlsx?|ods)$/i.test(pathname)) return 'table';
  if (/\.(?:json|xml|geojson)$/i.test(pathname)) return 'code';
  if (/\.(?:gz|zip|tar)$/i.test(pathname)) return 'packet';
  if (/\.(?:mp3|wav|m4a)$/i.test(pathname)) return 'headphones';
  if (/\.(?:mp4|webm)$/i.test(pathname)) return 'window';
  if (hostname === 'doi.org' || hostname === 'pubmed.ncbi.nlm.nih.gov') return 'flask';
  if (hostname === 'github.com') return 'code';
  if (/(?:^|\.)gov(?:\.[a-z]{2})?$|(?:^|\.)gouv\.fr$/i.test(hostname)) return 'columns';
  return 'external';
}
