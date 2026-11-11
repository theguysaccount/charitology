import { $, h } from './dom';
import { download, toCsv } from './files';
import { formatCnpj, normalizeBrazilName, readCnpj, type BrazilAgreement } from './brazil-transferegov';
import { loadVerifiedJson } from './verified-json';
import type manifestType from '../../../public/data/funding-flows/brazil-planned-geography/manifest.json';

type Manifest = typeof manifestType;
type Status = 'municipality-linked' | 'missing-state-or-municipality' | 'unresolved-municipality';
type Goal = [
  proposalId: string, agreementId: string, goalId: string, sourceRecord: number, state: string | null,
  municipality: string | null, status: Status, start: string, end: string,
];
type Place = [code: string, name: string, stateName: string, odsRow: number];
type Snapshot = { plannedGoals: Goal[]; municipalities: Place[] };
const labels: Record<Status, string> = {
  'municipality-linked': 'Linked to IBGE',
  'missing-state-or-municipality': 'State or municipality missing',
  'unresolved-municipality': 'No unique IBGE match',
};
const pageSize = 30;
const count = (value: number) => value.toLocaleString('en-US');
const agreementFormat = /^(?:[0-9]{1,20}|[0-9][A-Z]{5})$/i;

export function mountBrazilPlannedGeography(root: HTMLElement) {
  const manifest: Manifest = JSON.parse(root.dataset.manifest!);
  const form = $<HTMLFormElement>('form', root);
  const place = $<HTMLInputElement>('[name=place]', form);
  const agreementInput = $<HTMLInputElement>('[name=agreement]', form);
  const state = $<HTMLSelectElement>('[name=state]', form);
  const year = $<HTMLSelectElement>('[name=year]', form);
  const clear = $<HTMLButtonElement>('[data-clear]', root);
  const submit = $<HTMLButtonElement>('button[type=submit]', form);
  const status = $('[data-status]', root);
  const region = $('[data-result-table]', root);
  const rows = $('[data-results]', region);
  const pagination = $('[data-pagination]', root);
  const previous = $<HTMLButtonElement>('[data-previous]', pagination);
  const next = $<HTMLButtonElement>('[data-next]', pagination);
  const pageLabel = $('[data-page]', pagination);
  const csv = $<HTMLButtonElement>('[data-csv]', root);
  const json = $<HTMLButtonElement>('[data-json]', root);
  let snapshot: ReturnType<typeof load> | undefined;
  let matches: Goal[] = [];
  let page = 0;
  let searchTicket = 0;

  async function load() {
    const [value, transfers] = await Promise.all([
      loadVerifiedJson(root.dataset.file!, manifest.asset) as Promise<Snapshot>,
      loadVerifiedJson(root.dataset.transferFile!, manifest.sources.transfers.asset) as Promise<BrazilAgreement[]>,
    ]);
    if (!Array.isArray(value?.plannedGoals) || !Array.isArray(value?.municipalities) || !Array.isArray(transfers) ||
        value.plannedGoals.length !== manifest.selection.goals || value.municipalities.length !== manifest.selection.municipalities ||
        transfers.length !== manifest.selection.agreements) {
      throw new Error('The published files have unexpected record counts.');
    }
    return {
      goals: value.plannedGoals,
      places: new Map(value.municipalities.map(row => [row[0], row])),
      placeNames: new Map(value.municipalities.map(row => [row[0], normalizeBrazilName(row[1])])),
      transfers: new Map(transfers.map(row => [row[0], row])),
    };
  }

  const data = () => snapshot ??= load().catch(error => { snapshot = undefined; throw error; });

  function resetResults() {
    matches = [];
    page = 0;
    rows.replaceChildren();
    pagination.hidden = region.hidden = true;
    csv.disabled = json.disabled = true;
  }

  async function render() {
    const current = matches;
    const { places, transfers } = await data();
    if (current !== matches) return;
    const startIndex = page * pageSize;
    const part = matches.slice(startIndex, startIndex + pageSize);
    rows.replaceChildren(...part.map(([, agreement, goal, sourceRecord, reportedState, code, kind, start, end]) => {
      const locality = code ? places.get(code) : undefined;
      const transfer = transfers.get(agreement)!;
      return h('tr', {},
        h('th', { scope: 'row' }, locality ? locality[1] + ' · ' + locality[0] : 'Municipality unknown',
          h('small', {}, `${reportedState ?? 'State unknown'} · ${labels[kind]}`)),
        h('td', {}, h('a', { href: root.dataset.transfers + '?agreement=' + encodeURIComponent(agreement) + '#brazil-transfer-heading' }, agreement),
          h('small', {}, transfer[3] + ' · CNPJ ' + formatCnpj(transfer[2])),
          h('small', {}, `Proponent state ${transfer[4] ?? 'unknown'}`)),
        h('td', {}, h('time', { datetime: start }, start), ' to ', h('time', { datetime: end }, end)),
        h('td', {}, `Goal ${goal}`, h('small', {}, `Work-plan record ${sourceRecord}`),
          locality ? h('small', {}, `IBGE workbook row ${locality[3]}`) : null));
    }));
    const pages = Math.ceil(matches.length / pageSize);
    region.hidden = !matches.length;
    pagination.hidden = pages < 2;
    previous.disabled = page === 0;
    next.disabled = page + 1 >= pages;
    pageLabel.textContent = `Rows ${count(startIndex + 1)}–${count(startIndex + part.length)} of ${count(matches.length)}`;
  }

  async function search() {
    const ticket = ++searchTicket;
    resetResults();
    const municipalityQuery = normalizeBrazilName(place.value);
    const identifier = agreementInput.value.trim();
    const cnpj = readCnpj(identifier);
    const agreement = !cnpj && agreementFormat.test(identifier) ? identifier.toUpperCase() : null;
    if ((identifier && !cnpj && !agreement) || (municipalityQuery && municipalityQuery.length < 2)) {
      status.textContent = 'Enter a full agreement number or CNPJ and at least two characters for a municipality search.';
      return;
    }
    const stateFilter = state.value;
    const yearFilter = year.value;
    status.textContent = 'Checking the published work-plan and agreement records.';
    submit.disabled = true;
    try {
      const { goals, placeNames, transfers } = await data();
      if (ticket !== searchTicket) return;
      const overlap = new Set<string>();
      if (yearFilter) {
        for (const row of transfers.values()) {
          if (row[9].some(order => order[1].slice(0, 4) === yearFilter)) overlap.add(row[0]);
        }
      }
      matches = goals.filter(([, id, , , uf, code, , start, end]) => {
        if ((agreement && agreement !== id) || (cnpj && transfers.get(id)?.[2] !== cnpj)) return false;
        if (stateFilter && stateFilter !== uf) return false;
        if (municipalityQuery && !(code === municipalityQuery || (code && placeNames.get(code)?.includes(municipalityQuery)))) return false;
        return !yearFilter || (overlap.has(id) && start <= yearFilter + '-12-31' && end >= yearFilter + '-01-01');
      });
      const agreements = new Set(matches.map(row => row[1]));
      const places = new Set(matches.flatMap(row => row[5] ? [row[5]] : []));
      const unknown = matches.filter(row => !row[5]).length;
      status.textContent = matches.length
        ? `${count(matches.length)} matching plan goals across ${count(agreements.size)} agreements and ${count(places.size)} linked municipalities. ${count(unknown)} goals have no linked municipality.`
        : 'No plan goals match these filters in this edition.';
      csv.disabled = json.disabled = !matches.length;
      await render();
    } catch (error) {
      if (ticket === searchTicket) status.textContent = error instanceof Error ? error.message : 'The planned-location search failed.';
    } finally {
      if (ticket === searchTicket) submit.disabled = false;
    }
  }

  function changePage(step: number) {
    page += step;
    void render();
  }

  async function save(format: 'csv' | 'json') {
    const current = matches;
    if (!current.length) return;
    const { places } = await data();
    if (current !== matches) return;
    const output = current.map(goal => {
      const locality = goal[5] ? places.get(goal[5]) : undefined;
      return {
        ...Object.fromEntries(manifest.fields.goals.map((field, index) => [field, goal[index]])),
        municipalityName: locality?.[1] ?? null,
        stateNameFromIBGE: locality?.[2] ?? null,
        odsPhysicalRow: locality?.[3] ?? null,
      };
    });
    if (format === 'json') {
      download('brazil-planned-goals.json', JSON.stringify({ manifest, plannedGoals: output }, null, 2) + '\n', 'application/json');
    } else {
      download('brazil-planned-goals.csv', toCsv(output) + '\n', 'text/csv;charset=utf-8');
    }
  }

  form.addEventListener('submit', event => { event.preventDefault(); void search(); });
  form.addEventListener('input', () => {
    searchTicket++;
    resetResults();
    submit.disabled = false;
    status.textContent = 'Search to apply these filters.';
  });
  clear.addEventListener('click', () => {
    searchTicket++;
    form.reset();
    resetResults();
    submit.disabled = false;
    status.textContent = 'Search cleared.';
    place.focus();
  });
  previous.addEventListener('click', () => changePage(-1));
  next.addEventListener('click', () => changePage(1));
  csv.addEventListener('click', () => { void save('csv'); });
  json.addEventListener('click', () => { void save('json'); });

  const initial = new URLSearchParams(location.search).get('agreement');
  $<HTMLFieldSetElement>('fieldset', form).disabled = false;
  if (initial && agreementFormat.test(initial)) {
    agreementInput.value = initial;
    void search();
  }
}
