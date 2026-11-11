import { $, h } from './dom';
import { download, toCsv } from './files';
import { readHash } from './store';
import { formatCnpj, normalizeBrazilName, readCnpj, type BrazilAgreement } from './brazil-transferegov';
import { loadVerifiedJson } from './verified-json';

type Registry = typeof import('../../../public/data/charity-registry/brazil-osc/manifest.json');
type Transfers = typeof import('../../../public/data/funding-flows/brazil-transferegov/manifest.json');
type Registration = [cnpj: string, sourceRecord: number, status: string, office: string, state: string | null];
type Match = 'exact' | 'unmatched' | 'ambiguous';
type Organization = {
  cnpj: string;
  name: string;
  names: Set<string>;
  latestOrder: string;
  agreements: number;
  proponentStates: Set<string>;
  periods: Map<string, { orders: number; centsBRL: number }>;
  registration: Registration | null;
  match: Match;
};

const labels = {
  exact: 'One exact registry record',
  unmatched: 'No exact registry record',
  ambiguous: 'Repeated registry number',
};
const offices: Record<string, string> = { Matriz: 'Head office', Filial: 'Branch', 'Não Identificado': 'Office type unknown' };
const count = (value: number) => value.toLocaleString('en-US');
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'BRL', currencyDisplay: 'code' });

function groupOrganizations(agreements: BrazilAgreement[], registrations: Registration[], ambiguous: string[]) {
  const byCnpj = new Map(registrations.map(row => [row[0], row]));
  const conflicts = new Set(ambiguous);
  const organizations = new Map<string, Organization>();
  for (const row of agreements) {
    const [, , cnpj, name, proponentState, , , , , orders] = row;
    let organization = organizations.get(cnpj);
    if (!organization) {
      const registration = byCnpj.get(cnpj) ?? null;
      organization = {
        cnpj, name, registration, match: registration ? 'exact' : conflicts.has(cnpj) ? 'ambiguous' : 'unmatched',
        names: new Set(), latestOrder: '', agreements: 0, proponentStates: new Set(), periods: new Map(),
      };
      organizations.set(cnpj, organization);
    }
    organization.names.add(normalizeBrazilName(name));
    if (proponentState) organization.proponentStates.add(proponentState);
    organization.agreements++;
    for (const [, date, centsBRL] of orders) {
      if (date > organization.latestOrder) {
        organization.name = name;
        organization.latestOrder = date;
      }
      const year = date.slice(0, 4);
      const period = organization.periods.get(year) ?? { orders: 0, centsBRL: 0 };
      period.orders++;
      period.centsBRL += centsBRL;
      organization.periods.set(year, period);
    }
  }
  return [...organizations.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.cnpj.localeCompare(b.cnpj));
}

export function mountBrazilRegistry(root: HTMLElement) {
  const registry: Registry = JSON.parse(root.dataset.registry!);
  const transfers: Transfers = JSON.parse(root.dataset.transfers!);
  const form = $<HTMLFormElement>('form', root);
  const query = $<HTMLInputElement>('input', form);
  const match = $<HTMLSelectElement>('select', form);
  const submit = $<HTMLButtonElement>('button[type=submit]', form);
  const clear = $<HTMLButtonElement>('[data-clear]', root);
  const status = $('[data-status]', root);
  const results = $('[data-results]', root);
  const json = $<HTMLButtonElement>('[data-export=json]', root);
  const csv = $<HTMLButtonElement>('[data-export=csv]', root);
  let snapshot: Promise<Organization[]> | undefined;
  let matches: Organization[] = [];
  let sequence = 0;

  async function load() {
    if (registry.transfers.assetSha256 !== transfers.asset.sha256) throw new Error('These snapshots are from different editions.');
    const [registrations, agreements] = await Promise.all([
      loadVerifiedJson(root.dataset.asset!, registry.asset),
      loadVerifiedJson(root.dataset.transferAsset!, transfers.asset),
    ]);
    if (!Array.isArray(registrations) || registrations.length !== registry.asset.rows ||
        !Array.isArray(agreements) || agreements.length !== transfers.asset.rows) {
      throw new Error('The snapshots have unexpected record counts.');
    }
    const organizations = groupOrganizations(agreements, registrations, registry.ambiguousCnpjs);
    if (organizations.length !== registry.transfers.identifiers) throw new Error('The transfer snapshot has unexpected coverage.');
    return organizations;
  }

  function invalidate() {
    sequence++;
    matches = [];
    results.replaceChildren();
    json.disabled = csv.disabled = true;
    submit.disabled = false;
  }

  function display(organization: Organization) {
    const { cnpj, name, registration, periods, agreements, proponentStates } = organization;
    const evidence = registration ? h('p', {},
      `Ipea source record ${count(registration[1])} · ${registration[2]} · ${offices[registration[3]] ?? registration[3]}`,
      registration[4] && ` · Registered state ${registration[4]}`,
    ) : h('p', {}, 'No dated registry status or location is supplied for this match.');
    const periodList = h('ul', {}, [...periods].sort(([a], [b]) => a.localeCompare(b)).map(([year, period]) =>
      h('li', {}, `${year} · ${count(period.orders)} ${period.orders === 1 ? 'order' : 'orders'} · ${money.format(period.centsBRL / 100)} made available to agreement accounts`)));
    return h('li', { class: 'card', 'data-cnpj': cnpj },
      h('h3', {}, name),
      h('p', {}, `CNPJ ${formatCnpj(cnpj)} · ${labels[organization.match]}`),
      evidence,
      h('p', { class: 'note' }, `Name as published in a selected proposal. ${count(agreements)} ${agreements === 1 ? 'agreement' : 'agreements'} in the transfer edition.`),
      h('p', { class: 'note' }, proponentStates.size
        ? `Proponent state in the proposals: ${[...proponentStates].sort().join(', ')}.` : 'Proponent state is unavailable in the selected proposals.'),
      periodList,
      h('p', {}, h('a', { href: root.dataset.transferPage + '#cnpj=' + cnpj }, 'Open agreements and bank orders for this CNPJ')),
      h('p', { class: 'note' }, h('a', { href: '#cnpj=' + cnpj }, 'Link to this registry match')),
    );
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    invalidate();
    const ticket = sequence;
    const value = query.value.trim();
    const cnpj = readCnpj(value);
    const name = normalizeBrazilName(value);
    const selected = match.value;
    if (value && !cnpj && name.length < 3) {
      status.textContent = 'Enter at least three characters from the start of a name or a full CNPJ.';
      return;
    }
    submit.disabled = true;
    status.textContent = 'Checking the registry and transfer snapshots.';
    try {
      snapshot ??= load().catch(error => { snapshot = undefined; throw error; });
      const organizations = await snapshot;
      if (ticket !== sequence) return;
      matches = organizations.filter(row => (!selected || row.match === selected) &&
        (cnpj ? row.cnpj === cnpj : !name || [...row.names].some(candidate => candidate.startsWith(name))));
      const visible = matches.slice(0, 25);
      status.textContent = matches.length
        ? `${count(matches.length)} ${matches.length === 1 ? 'registration number matches' : 'registration numbers match'} the search. Showing ${count(visible.length)}.`
        : 'No result in this transfer edition for the selected search and match type.';
      results.append(...visible.map(display));
      json.disabled = csv.disabled = !matches.length;
    } catch (error) {
      if (ticket === sequence) status.textContent = error instanceof Error ? error.message : 'The registry search failed.';
    } finally {
      if (ticket === sequence) submit.disabled = false;
    }
  });

  form.addEventListener('input', () => {
    invalidate();
    status.textContent = 'Search to apply the current filters.';
  });
  clear.addEventListener('click', () => {
    invalidate();
    query.value = match.value = '';
    status.textContent = 'Search cleared.';
    query.focus();
  });
  const records = () => matches.map(({ cnpj, registration, match }) => ({
    cnpj, match, ipeaSourceRecord: registration?.[1] ?? null, registrationStatus: registration?.[2] ?? null,
    officeType: registration?.[3] ?? null, registeredState: registration?.[4] ?? null,
  }));
  json.addEventListener('click', () => {
    if (!matches.length) return;
    download('brazil-osc-registry-matches.json',
      JSON.stringify({ source: registry.source, transferEdition: registry.transfers, records: records() }, null, 2) + '\n',
      'application/json');
  });
  csv.addEventListener('click', () => {
    if (!matches.length) return;
    const { publisher, title, edition, accessedOn, url, sourceSha256, terms } = registry.source;
    const rows = records().map(row => ({ ...row, publisher, title, edition, accessedOn, sourceUrl: url, sourceSha256, terms, transferAssetSha256: registry.transfers.assetSha256 }));
    download('brazil-osc-registry-matches.csv', '\uFEFF' + toCsv(rows), 'text/csv;charset=utf-8');
  });

  function openCnpj(value: string | null) {
    const cnpj = readCnpj(value ?? '');
    if (!cnpj) return;
    query.value = formatCnpj(cnpj);
    match.value = '';
    form.requestSubmit();
  }
  query.disabled = match.disabled = submit.disabled = clear.disabled = false;
  window.addEventListener('hashchange', () => openCnpj(readHash('cnpj') ?? null));
  openCnpj(readHash('cnpj') ?? new URLSearchParams(window.location.search).get('cnpj'));
}
