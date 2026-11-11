import { $, h } from './dom';
import { download, toCsv } from './files';
import { readHash } from './store';
import { loadVerifiedJson } from './verified-json';
import type { SymbolName } from '../site-identities';

type Manifest = typeof import('../../../public/data/charity-financials/mx/manifest.json');
type FiscalYear = keyof Manifest['financial'];
type DirectoryYear = keyof Manifest['directories'];
type Activity = keyof Manifest['directoryActivityCodes'];
type Period = [number, number, string, string, string, (number | null)[]];
type Directory = [number, string, string, string, [number, Activity][]];
type Organization = [string, Period[], Directory[]];

const activitySymbols = {
  A: 'hands', B: 'school', C: 'flask', D: 'spark', E: 'book', F: 'leaf', G: 'paw',
  H: 'coins', I: 'tools', J: 'archive', K: 'columns', L: 'people', M: 'globe',
} as const satisfies Record<Activity, SymbolName>;

const rfcFormat = /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/;
const number = new Intl.NumberFormat('en-US');
const peso = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'MXN', currencyDisplay: 'code' });
const normalizeName = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const safe = (value: unknown) => typeof value === 'string' && /^(?:\s*[=+\-@]|[\t\r\n])/.test(value)
  ? "'" + value : value;

export function mountMexicoFinancials(root: HTMLElement) {
  const manifest = JSON.parse(root.dataset.manifest!) as Manifest;
  const form = $<HTMLFormElement>('form', root);
  const query = $<HTMLInputElement>('input', form);
  const year = $<HTMLSelectElement>('select', form);
  const submit = $<HTMLButtonElement>('button[type=submit]', form);
  const clear = $<HTMLButtonElement>('[data-clear]', form);
  const status = $('[data-status]', root);
  const results = $('[data-results]', root);
  const json = $<HTMLButtonElement>('[data-export=json]', root);
  const finances = $<HTMLButtonElement>('[data-export=financial]', root);
  const directory = $<HTMLButtonElement>('[data-export=directory]', root);
  let snapshot: Promise<Organization[]> | undefined;
  let displayed: Organization[] = [];
  let sequence = 0;

  const fields = manifest.financialFields.map((field, index) => ({ ...field, index }));
  const groups = ['Donations', 'Other income', 'Expenditure'].map(group =>
    [group, fields.filter(field => field.group === group)] as const);
  const periodSource = (value: number) => manifest.financial[String(value) as FiscalYear];
  const directorySource = (value: number) => manifest.directories[String(value) as DirectoryYear];
  const title = ([, periods, directories]: Organization) => periods.at(-1)?.[2] ?? directories.at(-1)![1];

  async function load() {
    const data = await loadVerifiedJson(root.dataset.asset!, manifest.asset);
    if (!Array.isArray(data) || data.length !== manifest.coverage.identities) throw new Error('The snapshot has unexpected coverage.');
    return data as Organization[];
  }

  function invalidate(message: string) {
    sequence++;
    displayed = [];
    results.replaceChildren();
    json.disabled = finances.disabled = directory.disabled = true;
    submit.disabled = false;
    status.textContent = message;
  }

  function showPeriod([fiscal, record, name, state, category, values]: Period) {
    const sections = groups.map(([label, selected]) => {
      const amounts = selected.map(field => {
        const value = values[field.index];
        return h('div', {}, h('dt', {}, field.label),
          h('dd', {}, value === null ? 'Not reported' : peso.format(value / 100)));
      });
      return h('section', {}, h('h4', {}, label), h('dl', { class: 'finance-amounts' }, amounts));
    });
    return h('details', { class: 'finance-period' },
      h('summary', {}, `Fiscal ${fiscal} financial report`),
      h('p', { class: 'note' }, name, ` · ${state} · ${category}`),
      sections,
      h('p', { class: 'note' }, `SAT CSV record ${number.format(record)} · `,
        h('a', { href: periodSource(fiscal).report.url }, 'Finance ministry report')),
    );
  }

  function showDirectory([edition, name, state, taxState, activityRows]: Directory) {
    return h('details', { class: 'finance-period' },
      h('summary', {}, `${edition} authorization directory`),
      h('p', {}, `${name} · ${state}`),
      h('p', { class: 'note' }, taxState ? `The tax register recorded the status as ${taxState}.` : 'Tax registration status is unavailable.'),
      h('ul', {}, activityRows.map(([row, activity]) => h('li', {},
        h('span', { class: 'site-symbol identity-inline', 'data-site-symbol': activitySymbols[activity], 'aria-hidden': 'true' }),
        ' ', manifest.directoryActivityCodes[activity].label,
        h('span', { class: 'note' }, ` · SAT code ${activity} · Workbook row ${row}`)))),
      h('p', { class: 'note' }, h('a', { href: directorySource(edition).url }, 'Original SAT directory workbook')),
    );
  }

  function display(row: Organization) {
    const [rfc, periods, directories] = row;
    return h('li', { class: 'card', 'data-rfc': rfc },
      h('h3', {}, title(row)), h('p', {}, `RFC ${rfc}`),
      periods.length ? periods.map(showPeriod) : h('p', { class: 'note' }, 'No financial report in this selection.'),
      directories.length ? directories.map(showDirectory) : h('p', { class: 'note' }, 'No exact RFC in these two directories.'),
      h('p', { class: 'note' }, h('a', { href: '#rfc=' + encodeURIComponent(rfc) }, 'Link to this RFC')));
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    invalidate('');
    const value = query.value.trim();
    const normalized = normalizeName(value);
    const exact = value.replace(/\s/g, '').toUpperCase();
    const byRfc = rfcFormat.test(exact);
    const selected = year.value ? Number(year.value) : null;
    if ((!value && selected === null) || (value && !byRfc && normalized.length < 3)) {
      status.textContent = 'Enter at least three characters of an organization name, a full RFC or a financial year.';
      return;
    }
    const ticket = sequence;
    submit.disabled = true;
    status.textContent = 'Checking the public snapshot.';
    try {
      snapshot ??= load().catch(error => { snapshot = undefined; throw error; });
      const organizations = await snapshot;
      if (ticket !== sequence) return;
      const matches = organizations.filter(([rfc, periods, directories]) =>
        (selected === null || periods.some(row => row[0] === selected)) &&
        (byRfc ? rfc === exact : !normalized ||
          periods.some(row => normalizeName(row[2]).includes(normalized)) ||
          directories.some(row => normalizeName(row[1]).includes(normalized))));
      matches.sort((a, b) => title(a).localeCompare(title(b), 'es-MX') || a[0].localeCompare(b[0]));
      displayed = matches.slice(0, 25).map(([rfc, periods, directories]) =>
        [rfc, selected === null ? periods : periods.filter(row => row[0] === selected), directories]);
      results.append(...displayed.map(display));
      status.textContent = matches.length
        ? `${number.format(matches.length)} ${matches.length === 1 ? 'organization matches' : 'organizations match'}. Showing ${displayed.length}.`
        : 'No organization matches this search and financial year.';
      json.disabled = !displayed.length;
      finances.disabled = !displayed.some(([, periods]) => periods.length);
      directory.disabled = !displayed.some(([, , directories]) => directories.length);
    } catch (error) {
      if (ticket === sequence) status.textContent = error instanceof Error ? error.message : 'The search failed.';
    } finally {
      if (ticket === sequence) submit.disabled = false;
    }
  });

  form.addEventListener('input', () => invalidate('Search to apply your current filters.'));
  clear.addEventListener('click', () => {
    query.value = year.value = '';
    invalidate('Search cleared.');
    query.focus();
  });

  function csv(kind: string, rows: Record<string, unknown>[]) {
    if (rows.length) download(`mexico-charity-${kind}.csv`, '\uFEFF' + toCsv(rows.map(row =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, safe(value)])))), 'text/csv;charset=utf-8');
  }
  finances.addEventListener('click', () => csv('financial-periods', displayed.flatMap(([rfc, periods]) =>
    periods.map(([fiscalYear, sourceRecord, reportedName, reportedState, authorizedCategory, values]) => {
      const source = periodSource(fiscalYear);
      return { rfc, fiscalYear, sourceRecord, reportedName, reportedState, authorizedCategory,
        currency: manifest.currency, sourceCurrencyLabel: manifest.sourceCurrencyLabel,
        ...Object.fromEntries(manifest.financialFields.map(({ field }, index) => [field + '_cents', values[index]])),
        publisher: manifest.publisher, sourceUrl: source.url, sourceSha256: source.sha256, reportUrl: source.report.url };
    }))));
  directory.addEventListener('click', () => csv('directory-entries', displayed.flatMap(([rfc, , directories]) =>
    directories.flatMap(([editionYear, nameInDirectory, stateInDirectory, reportedTaxRegistrationState, activityRows]) => {
      const source = directorySource(editionYear);
      return activityRows.map(([sourceSpreadsheetRow, authorizedActivity]) => ({
        rfc, editionYear, sourceSpreadsheetRow, nameInDirectory, stateInDirectory, reportedTaxRegistrationState,
        authorizedActivity, activityLabel: manifest.directoryActivityCodes[authorizedActivity].label,
        activityDefinitionCell: manifest.directoryActivityCodes[authorizedActivity].definitionCell,
        gazettePublicationDate: source.gazettePublicationDate,
        publisher: manifest.publisher, sourceUrl: source.url, sourceSha256: source.sha256,
      }));
    }))));
  json.addEventListener('click', () => {
    if (displayed.length) download('mexico-charity-records.json', JSON.stringify({ manifest, organizations: displayed }, null, 2) + '\n',
      'application/json');
  });

  function openRfc() {
    const linked = readHash('rfc')?.toUpperCase() ?? '';
    if (!rfcFormat.test(linked)) return;
    query.value = linked;
    year.value = '';
    form.requestSubmit();
  }
  query.disabled = year.disabled = submit.disabled = clear.disabled = false;
  window.addEventListener('hashchange', openRfc);
  openRfc();
}
