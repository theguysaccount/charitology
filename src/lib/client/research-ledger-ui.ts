/** Progressive, read-only navigation over server-rendered ledger rows.
 * No fetched data, storage, scientific counters or qualification rules live here.
 */
const mounted = new WeakSet<HTMLElement>();
const PAGE_SIZE = 20;
const normalize = (value: string) => value.normalize("NFKC").toLowerCase();

export function mountResearchLedger(root: HTMLElement): void {
  if (mounted.has(root)) return;
  mounted.add(root);
  for (const list of root.querySelectorAll<HTMLElement>(".rl-list")) {
    const controls = list.querySelector<HTMLElement>(".rl-controls");
    const search = list.querySelector<HTMLInputElement>(".rl-text-filter");
    const kind = list.querySelector<HTMLSelectElement>(".rl-kind-filter");
    const state = list.querySelector<HTMLSelectElement>(".rl-state-filter");
    const reset = list.querySelector<HTMLButtonElement>(".rl-reset");
    const previous = list.querySelector<HTMLButtonElement>(".rl-prev");
    const next = list.querySelector<HTMLButtonElement>(".rl-next");
    const status = list.querySelector<HTMLElement>(".rl-page-status");
    const rows = [...list.querySelectorAll<HTMLElement>(".rl-item")];
    const batches = [...list.querySelectorAll<HTMLDetailsElement>(".rl-batch")];
    if (!controls || !search || !reset || !previous || !next || !status)
      continue; // The unenhanced source remains readable if a shell is incomplete.
    let page = 0;
    const matches = () => {
      const text = normalize(search.value.slice(0, 180));
      return rows.filter(
        (row) =>
          (!kind?.value || row.dataset.ledgerKind === kind.value) &&
          (!state?.value || row.dataset.ledgerState === state.value) &&
          (!text ||
            normalize(
              row.dataset.ledgerSearch ?? row.textContent ?? "",
            ).includes(text)),
      );
    };
    const render = (focus = false, notice = "") => {
      const filtered = matches();
      const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      page = Math.min(Math.max(0, page), pages - 1);
      const visible = new Set(
        filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
      );
      for (const row of rows) row.hidden = !visible.has(row);
      for (const batch of batches) {
        batch.hidden = !batch.querySelector<HTMLElement>(
          ".rl-item:not([hidden])",
        );
        batch.open = !batch.hidden;
      }
      previous.disabled = page === 0;
      next.disabled = page === pages - 1;
      const noun = list.dataset.ledgerNoun ?? "items";
      status.textContent = `${notice}${filtered.length} matching ${noun}. ${filtered.length ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)}. ` : ""}Page ${page + 1} of ${pages}. Filters change this view only; the edition totals above stay unchanged.`;
      if (focus) status.focus();
    };
    const resetFilters = () => {
      search.value = "";
      if (kind) kind.value = "";
      if (state) state.value = "";
      page = 0;
    };
    const revealLinkedRow = () => {
      const hash = root.ownerDocument.defaultView?.location.hash;
      if (!hash) return false;
      let target: HTMLElement | null = null;
      try {
        target = root.ownerDocument.getElementById(
          decodeURIComponent(hash.slice(1)),
        );
      } catch {
        return false;
      }
      const row = target?.closest<HTMLElement>(".rl-item");
      const index = row ? rows.indexOf(row) : -1;
      if (index < 0) return false;
      resetFilters();
      page = Math.floor(index / PAGE_SIZE);
      render(false, "The linked item is visible. ");
      // An archive record/version can be nested inside its own ordinary details.
      let parent: HTMLElement | null = target;
      while (parent && parent !== root) {
        if (parent.tagName === "DETAILS")
          (parent as HTMLDetailsElement).open = true;
        parent = parent.parentElement;
      }
      return true;
    };
    for (const input of [search, kind, state])
      input?.addEventListener(input === search ? "input" : "change", () => {
        page = 0;
        render();
      });
    reset.addEventListener("click", () => {
      resetFilters();
      render();
      search.focus();
    });
    previous.addEventListener("click", () => {
      page--;
      render(true);
    });
    next.addEventListener("click", () => {
      page++;
      render(true);
    });
    root.ownerDocument.defaultView?.addEventListener("hashchange", () =>
      revealLinkedRow(),
    );
    controls.hidden = false;
    list.classList.add("rl-enhanced");
    if (!revealLinkedRow()) render();
  }
  // Contributor/review/record anchors can sit outside a paginated row. Native
  // anchor navigation must still reveal an enclosing historical archive.
  const revealArchive = () => {
    const hash = root.ownerDocument.defaultView?.location.hash;
    if (!hash || hash.length > 512) return;
    let target: HTMLElement | null;
    try {
      target = root.ownerDocument.getElementById(
        decodeURIComponent(hash.slice(1)),
      );
    } catch {
      return;
    }
    const parents: HTMLElement[] = [];
    while (target && target !== root) {
      parents.push(target);
      target = target.parentElement;
    }
    if (target !== root) return;
    for (const parent of parents)
      if (parent.tagName === "DETAILS")
        (parent as HTMLDetailsElement).open = true;
  };
  root.ownerDocument.defaultView?.addEventListener("hashchange", revealArchive);
  revealArchive();
}
