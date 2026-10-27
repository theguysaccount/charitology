/** Filtering changes presentation only. Facts and provenance are server-rendered. */
export function mountObservationDesks(scope: ParentNode = document): void {
  for (const root of scope.querySelectorAll<HTMLElement>(
    "[data-observation-desk]",
  )) {
    if (root.dataset.mounted) continue;
    root.dataset.mounted = "true";
    const search = root.querySelector<HTMLInputElement>("[data-ob-search]")!;
    const measure = root.querySelector<HTMLSelectElement>("[data-ob-measure]")!;
    const state = root.querySelector<HTMLSelectElement>("[data-ob-state]")!;
    const count = root.querySelector<HTMLElement>("[data-ob-count]")!;
    const more = root.querySelector<HTMLButtonElement>("[data-ob-more]")!;
    const rows = [...root.querySelectorAll<HTMLElement>("[data-ob-row]")];
    let visible = 50;
    function render(reset = true) {
      if (reset) visible = 50;
      const words = search.value
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const matching = rows.filter(
        (r) =>
          words.every((w) => (r.dataset.search ?? "").includes(w)) &&
          (!measure.value || r.dataset.measure === measure.value) &&
          (state.value === "all" || r.dataset.state === state.value),
      );
      const shown = new Set(matching.slice(0, visible));
      for (const row of rows) row.hidden = !shown.has(row);
      count.textContent = `${Math.min(visible, matching.length)} of ${matching.length} matching cells shown; ${rows.length} cells in this edition.`;
      root.querySelector<HTMLElement>("[data-ob-empty]")!.hidden =
        matching.length !== 0;
      more.hidden = matching.length <= visible;
    }
    search.addEventListener("input", () => render());
    measure.addEventListener("change", () => render());
    state.addEventListener("change", () => render());
    root.querySelector("[data-ob-reset]")!.addEventListener("click", () => {
      search.value = "";
      measure.value = "";
      state.value = "all";
      render();
    });
    more.addEventListener("click", () => {
      visible += 50;
      render(false);
    });
    render();
    function revealExactCell() {
      const index = rows.findIndex(
        (row) => row.getAttribute("id") === location.hash.slice(1),
      );
      if (index < 0) return;
      search.value = "";
      measure.value = "";
      state.value = "all";
      visible = Math.ceil((index + 1) / 50) * 50;
      render(false);
      rows[index].setAttribute("tabindex", "-1");
      rows[index].scrollIntoView({ block: "center" });
      rows[index].focus({ preventScroll: true });
    }
    window.addEventListener("hashchange", revealExactCell);
    revealExactCell();
  }
}

export function mountOrganizationComparisons(
  scope: ParentNode = document,
): void {
  for (const root of scope.querySelectorAll<HTMLElement>(
    "[data-organization-comparison]",
  )) {
    if (root.dataset.mounted) continue;
    root.dataset.mounted = "true";
    const data = JSON.parse(
      root.querySelector("[data-org-data]")!.textContent!,
    ) as {
      choices: { id: string; label: string; scopeId: string | null }[];
      comparisons: Record<string, { rows: { reasons: string[] }[] }>;
      reasons: Record<string, string>;
      first: string;
      second: string;
    };
    const a = root.querySelector<HTMLSelectElement>("[data-org-a]")!,
      b = root.querySelector<HTMLSelectElement>("[data-org-b]")!;
    const panels = [...root.querySelectorAll<HTMLElement>("[data-org-panel]")];
    function render() {
      const left = data.choices.find((c) => c.id === a.value),
        right = data.choices.find((c) => c.id === b.value);
      const same =
        !!left &&
        !!right &&
        (left.id === right.id ||
          (!!left.scopeId && left.scopeId === right.scopeId));
      const comparison =
        !same && left && right
          ? data.comparisons[`${left.id}|${right.id}`]
          : null;
      const status = root.querySelector<HTMLElement>("[data-org-status]")!;
      for (const panel of panels) panel.hidden = true;
      const boxA = root.querySelector<HTMLElement>("[data-org-left]")!,
        boxB = root.querySelector<HTMLElement>("[data-org-right]")!;
      for (const [choice, box] of [
        [left, boxA],
        [right, boxB],
      ] as const) {
        box.replaceChildren();
        if (!choice || same) continue;
        const panel = panels.find((p) => p.dataset.orgPanel === choice.scopeId);
        if (panel) {
          panel.hidden = false;
          box.append(panel);
        } else {
          const note = document.createElement("p");
          note.className = "ob-card";
          note.textContent = `${choice.label}. No financial facts are collected for this selection in this edition.`;
          box.append(note);
        }
      }
      const list = root.querySelector<HTMLElement>("[data-org-reasons]")!;
      list.replaceChildren();
      const reasons = same
        ? []
        : [
            ...new Set(
              comparison?.rows.flatMap((r) => r.reasons) ?? ["not-collected"],
            ),
          ];
      for (const reason of reasons) {
        const li = document.createElement("li");
        li.textContent =
          data.reasons[reason] ??
          "Read the source-specific comparison limitation.";
        list.append(li);
      }
      status.textContent = same
        ? "Choose two different organization selections; an alias is not a separate reporting group."
        : `Showing ${left?.label ?? "an unselected first panel"} and ${right?.label ?? "an unselected second panel"}. No score, difference, ratio or winner is calculated.`;
      root.querySelector<HTMLElement>("[data-org-uncovered]")!.hidden =
        same || (!!left?.scopeId && !!right?.scopeId);
      const both = root.querySelector<HTMLElement>("[data-org-both]");
      if (both) both.hidden = same || !left?.scopeId || !right?.scopeId;
    }
    function fromLink() {
      const q = new URLSearchParams(location.hash.slice(1));
      for (const [select, key] of [
        [a, "orgA"],
        [b, "orgB"],
      ] as const) {
        const id = q.get(key);
        if (id && data.choices.some((c) => c.id === id)) select.value = id;
      }
      render();
    }
    root
      .querySelector("[data-org-form]")!
      .addEventListener("submit", (e) => e.preventDefault());
    a.addEventListener("change", () => render());
    b.addEventListener("change", () => render());
    root
      .querySelector<HTMLButtonElement>("[data-org-share]")!
      .addEventListener("click", async (e) => {
        const target = new URL(location.href),
          q = new URLSearchParams(target.hash.slice(1));
        q.set("orgA", a.value);
        q.set("orgB", b.value);
        target.hash = q.toString();
        const button = e.currentTarget as HTMLButtonElement;
        try {
          await navigator.clipboard.writeText(target.href);
          button.textContent = "Comparison link copied";
        } catch {
          button.textContent = "Copy unavailable; select the address below";
          let field = root.querySelector<HTMLInputElement>("[data-org-copy]");
          if (!field) {
            field = document.createElement("input");
            field.dataset.orgCopy = "";
            field.readOnly = true;
            field.setAttribute("aria-label", "Comparison link to copy");
            button.after(field);
          }
          field.value = target.href;
          field.focus();
          field.select();
        }
      });
    window.addEventListener("hashchange", fromLink);
    fromLink();
  }
}
