import type { ReferenceLibrary, ReferenceRecord } from "../record-library";
import { h } from "./dom";
import { copy, download } from "./files";

type LibraryData = ReferenceLibrary & { page: string };
const plainSearch = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const citationUrl = (path: string, page: string) =>
  /^https?:/.test(path)
    ? path
    : new URL(base + path, new URL(page).origin).href;
const markdownLinks = (body: string, page: string) =>
  body.replace(
    /\]\((\/[^)\s]*)([^)]*)\)/g,
    (_, path, suffix) => `](${citationUrl(path, page)}${suffix})`,
  );

export function researchDossier(
  data: LibraryData,
  entries: ReferenceRecord[],
): string {
  const intro = [
    `# ${data.title}: reading list`,
    "",
    `Exported ${new Date().toISOString().slice(0, 10)} from ${data.page}`,
    "",
    "Charitology · Content CC BY 4.0. Cite the individual entry and its original sources.",
    "",
    data.notice,
    "",
    "This is an editorial research dossier, not an independent verification of the cited claims. Review labels below remain attached to every entry.",
    "",
    "## Reading list",
    "",
    ...entries.map(
      (entry, index) =>
        `${index + 1}. [${entry.title}](${citationUrl(entry.href, data.page)}) — ${entry.review === "reviewed" ? "contributor reviewed" : "draft: human review pending"}`,
    ),
  ];
  for (const entry of entries) {
    intro.push(
      "",
      "---",
      "",
      `## ${entry.title}`,
      "",
      entry.summary,
      "",
      `Entry: ${citationUrl(entry.href, data.page)}`,
      "",
      `Review: ${entry.review === "reviewed" ? "contributor reviewed" : "draft: human review pending"}`,
    );
    for (const field of entry.fields)
      intro.push(
        "",
        `### ${field.label}`,
        "",
        ...(field.values.length
          ? field.values.map((value) => `- ${value}`)
          : ["Not recorded."]),
      );
    if (entry.body.trim())
      intro.push(
        "",
        "### Entry text",
        "",
        markdownLinks(entry.body.trim(), data.page),
      );
    intro.push("", "### Sources", "");
    if (!entry.sources.length)
      intro.push(
        "No sources are recorded. This is a gap, not evidence for a claim.",
      );
    entry.sources.forEach((source, index) =>
      intro.push(
        `${index + 1}. [${source.title}](${source.url})${source.publisher ? ` — ${source.publisher}` : ""}${source.year ? ` (${source.year})` : ""}${source.note ? `. ${source.note}` : ""}`,
      ),
    );
    if (entry.links.length)
      intro.push(
        "",
        "### Further research",
        "",
        ...entry.links.map(
          (link) => `- [${link.label}](${citationUrl(link.href, data.page)})`,
        ),
      );
  }
  return intro.join("\n") + "\n";
}

export function initializeRecordLibraries(): void {
  document
    .querySelectorAll<HTMLElement>("[data-record-library]")
    .forEach((root) => {
      if (root.dataset.initialized) return;
      root.dataset.initialized = "true";
      const data = JSON.parse(
        root.querySelector("[data-library-data]")!.textContent!,
      ) as LibraryData;
      const form = root.querySelector<HTMLFormElement>("form")!;
      const query = form.querySelector<HTMLInputElement>('[name="q"]')!;
      const choices = new Map(
        data.filters.map((filter) => [
          filter.key,
          form.querySelector<HTMLSelectElement>(`[name="${filter.key}"]`)!,
        ]),
      );
      const cards = new Map(
        [...root.querySelectorAll<HTMLElement>("[data-record-id]")].map(
          (card) => [card.dataset.recordId!, card],
        ),
      );
      const records = new Map(data.entries.map((entry) => [entry.id, entry]));
      const searchIndex = new Map(
        data.entries.map((entry) => [
          entry.id,
          plainSearch(
            [
              entry.title,
              entry.summary,
              entry.body,
              ...entry.fields.flatMap((field) => [
                field.label,
                ...field.values,
              ]),
              ...entry.sources.flatMap((source) => [
                source.title,
                source.publisher ?? "",
                source.year ?? "",
              ]),
            ].join(" "),
          ),
        ]),
      );
      const selected = new Set<string>();
      const selectionKey = `charitology.record-reading.${data.id}`;
      try {
        const saved: unknown = JSON.parse(
          sessionStorage.getItem(selectionKey) ?? "[]",
        );
        if (Array.isArray(saved))
          saved.forEach((id) => {
            if (typeof id === "string" && records.has(id)) selected.add(id);
          });
      } catch {
        /* blocked or invalid storage: the current page still works */
      }
      let visible: ReferenceRecord[] = [...data.entries];
      let comparisonOpen = false;
      const message = root.querySelector<HTMLElement>(
        "[data-library-message]",
      )!;
      const comparison = root.querySelector<HTMLElement>("[data-comparison]")!;
      const readingButtons = [
        "download-reading",
        "copy-reading",
        "clear-reading",
      ].map((name) => root.querySelector<HTMLButtonElement>(`[data-${name}]`)!);
      const compareButton =
        root.querySelector<HTMLButtonElement>("[data-compare]");
      const say = (value: string) => {
        message.textContent = value;
      };
      const picked = () =>
        data.entries.filter((entry) => selected.has(entry.id));
      const viewURL = (includeSelection = false) => {
        const next = new URL(location.href);
        next.hash = "";
        next.searchParams.delete("reading");
        for (const [key, value] of [
          ["q", query.value.trim()],
          ...[...choices].map(([key, choice]) => [key, choice.value]),
        ] as [string, string][]) {
          if (value) next.searchParams.set(key, value);
          else next.searchParams.delete(key);
        }
        if (includeSelection && selected.size)
          next.searchParams.set(
            "reading",
            picked()
              .map((entry) => entry.id)
              .join(","),
          );
        return next;
      };
      function renderComparison() {
        const entries = picked();
        comparison.replaceChildren();
        comparison.hidden =
          !comparisonOpen || entries.length < 2 || entries.length > 4;
        if (comparison.hidden) return;
        const headings = [
          ...new Set(
            entries.flatMap((entry) =>
              entry.fields.map((field) => field.label),
            ),
          ),
        ];
        const body = h(
          "tbody",
          {},
          ...headings.map((label) =>
            h(
              "tr",
              {},
              h("th", { scope: "row" }, label),
              ...entries.map((entry) =>
                h(
                  "td",
                  {},
                  ...(
                    entry.fields.find((field) => field.label === label)
                      ?.values ?? ["Not recorded"]
                  ).map((value) => h("p", {}, value)),
                ),
              ),
            ),
          ),
        );
        body.append(
          h(
            "tr",
            {},
            h("th", { scope: "row" }, "Editorial review"),
            ...entries.map((entry) =>
              h(
                "td",
                {},
                entry.review === "reviewed"
                  ? "Contributor reviewed"
                  : "Draft: human review pending",
              ),
            ),
          ),
        );
        body.append(
          h(
            "tr",
            {},
            h("th", { scope: "row" }, "Sources"),
            ...entries.map((entry) =>
              h(
                "td",
                {},
                h(
                  "ul",
                  {},
                  ...entry.sources.map((source) =>
                    h(
                      "li",
                      {},
                      h(
                        "a",
                        { href: source.url, rel: "noopener" },
                        source.title,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        const table = h(
          "table",
          {},
          h(
            "caption",
            {},
            "Recorded fields, not a ranking. Different cost outcomes, locations, dates and assumptions are not interchangeable.",
          ),
          h(
            "thead",
            {},
            h(
              "tr",
              {},
              h("th", { scope: "col" }, "Field"),
              ...entries.map((entry) =>
                h(
                  "th",
                  { scope: "col" },
                  h("a", { href: base + entry.href }, entry.title),
                ),
              ),
            ),
          ),
          body,
        );
        comparison.append(h("h3", {}, "Compare the recorded fields"), table);
      }
      function selectionChanged() {
        try {
          sessionStorage.setItem(selectionKey, JSON.stringify([...selected]));
        } catch {
          /* selection still works in memory */
        }
        root.querySelector("[data-selected-count]")!.textContent = String(
          selected.size,
        );
        for (const button of readingButtons)
          button.disabled = selected.size === 0;
        if (compareButton)
          compareButton.disabled = selected.size < 2 || selected.size > 4;
        root
          .querySelectorAll<HTMLInputElement>("[data-pick]")
          .forEach((box) => {
            box.checked = selected.has(box.dataset.pick!);
          });
        renderComparison();
      }
      function update(writeURL = true) {
        const words = plainSearch(query.value.trim())
          .split(/\s+/)
          .filter(Boolean);
        visible = data.entries.filter(
          (entry) =>
            words.every((word) => searchIndex.get(entry.id)!.includes(word)) &&
            [...choices].every(
              ([key, choice]) =>
                !choice.value || entry.facets[key]?.includes(choice.value),
            ),
        );
        const ids = new Set(visible.map((entry) => entry.id));
        for (const [id, card] of cards) card.hidden = !ids.has(id);
        root.querySelector("[data-library-count]")!.textContent =
          `Showing ${visible.length} of ${data.entries.length} entries. Reading list: ${selected.size} selected${picked().some((entry) => !ids.has(entry.id)) ? ", including entries outside this filter" : ""}.`;
        root.querySelector<HTMLElement>("[data-library-empty]")!.hidden =
          visible.length > 0;
        root.querySelector<HTMLButtonElement>(
          "[data-export-results]",
        )!.disabled = visible.length === 0;
        if (writeURL) history.replaceState(null, "", viewURL().href);
      }
      const incoming = new URL(location.href);
      query.value = (incoming.searchParams.get("q") ?? "").slice(0, 400);
      for (const filter of data.filters) {
        const value = incoming.searchParams.get(filter.key);
        if (value && filter.options.some((option) => option.value === value))
          choices.get(filter.key)!.value = value;
      }
      if (incoming.searchParams.has("reading")) {
        selected.clear();
        (incoming.searchParams.get("reading") ?? "")
          .split(",")
          .forEach((id) => {
            if (records.has(id)) selected.add(id);
          });
      }
      // A permalink must reveal its entry even if the shared filters exclude it.
      const anchor = (() => {
        try {
          return decodeURIComponent(location.hash.slice(1));
        } catch {
          return "";
        }
      })();
      if (
        anchor &&
        records.has(anchor) &&
        (query.value || [...choices.values()].some((choice) => choice.value))
      ) {
        query.value = "";
        for (const choice of choices.values()) choice.value = "";
        say("Filters cleared so the linked entry is visible.");
      }
      form.addEventListener("submit", (event) => event.preventDefault());
      form.addEventListener("input", () => update());
      form.addEventListener("change", () => update());
      form.addEventListener("reset", () =>
        requestAnimationFrame(() => {
          say("Filters reset. Your reading list is unchanged.");
          update();
        }),
      );
      root.querySelectorAll<HTMLInputElement>("[data-pick]").forEach((box) =>
        box.addEventListener("change", () => {
          if (box.checked) selected.add(box.dataset.pick!);
          else selected.delete(box.dataset.pick!);
          selectionChanged();
          update(false);
        }),
      );
      root
        .querySelector("[data-clear-reading]")!
        .addEventListener("click", () => {
          selected.clear();
          selectionChanged();
          update(false);
          say("Reading list cleared.");
        });
      root
        .querySelector("[data-copy-view]")!
        .addEventListener("click", async () =>
          say(
            (await copy(viewURL().href))
              ? "View link copied, with the current search and filters."
              : "Copy was unavailable. You can copy the current page address instead.",
          ),
        );
      root
        .querySelector("[data-copy-reading]")!
        .addEventListener("click", async () =>
          say(
            (await copy(viewURL(true).href))
              ? "Reading-list link copied. Anyone with it can see the selected public entries."
              : "Copy was unavailable. Download the research dossier instead.",
          ),
        );
      root
        .querySelector("[data-download-reading]")!
        .addEventListener("click", () => {
          download(
            `charitology-${data.id}-research-dossier.md`,
            researchDossier(data, picked()),
            "text/markdown;charset=utf-8",
          );
          say(
            `Downloaded a source-linked research dossier with ${selected.size} ${selected.size === 1 ? "entry" : "entries"}.`,
          );
        });
      root
        .querySelector("[data-export-results]")!
        .addEventListener("click", () => {
          const exported = {
            title: data.title,
            page: data.page,
            license: "CC BY 4.0",
            exported: new Date().toISOString(),
            scope: data.notice,
            filters: Object.fromEntries([
              ["q", query.value.trim()],
              ...[...choices].map(([key, choice]) => [key, choice.value]),
            ]),
            entries: visible,
          };
          download(
            `charitology-${data.id}-filtered.json`,
            JSON.stringify(exported, null, 2) + "\n",
            "application/json;charset=utf-8",
          );
          say(
            `Downloaded ${visible.length} filtered entries with their review labels and sources.`,
          );
        });
      compareButton?.addEventListener("click", () => {
        comparisonOpen = true;
        renderComparison();
        comparison.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "start",
        });
        say(
          "Comparison opened. Read the units and caveats before interpreting cost figures.",
        );
      });
      selectionChanged();
      update(false);
    });
}
