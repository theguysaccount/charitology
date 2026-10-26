export const SITE = {
  name: 'Charitology',
  tagline: 'The science of doing the most good.',
  description:
    'Charitology studies charity as a system: where generosity flows, why it flows there, and how to route it from the symptoms of the world’s problems to their sources.',
  repo: 'https://github.com/theguysaccount/charitology',
  branch: 'main',
  edition: 'Edition 0',
  established: 2026,
  contact: 'https://github.com/theguysaccount/charitology/discussions',
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Prefix a root-relative path with the deploy base path. */
export function url(path = '/'): string {
  if (/^(https?:|mailto:|#)/.test(path)) return path;
  return BASE + (path.startsWith('/') ? path : `/${path}`);
}

/** Absolute URL for feeds, canonical links and the API. */
export function absolute(path: string, site: URL | undefined): string {
  return new URL(url(path), site ?? 'https://charitology.org').toString();
}

/** Link that opens the GitHub editor for a content file. */
export function editUrl(filePath?: string): string {
  return filePath ? `${SITE.repo}/edit/${SITE.branch}/${filePath}` : SITE.repo;
}

/** Prefilled issue for a correction or challenge. */
export function issueUrl(kind: 'correction' | 'challenge' | 'idea', title: string, page?: string): string {
  const labels = { correction: 'correction', challenge: 'red-team', idea: 'idea' }[kind];
  const body = page ? `Page: ${page}\n\nWhat should change, and what is your source?\n` : '';
  const params = new URLSearchParams({ title, labels, body });
  return `${SITE.repo}/issues/new?${params.toString()}`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}
