import { validateFundingProjection, selectFundingRows, fundingSelectionJson, fundingSelectionCsv, type FundingEdition, type FundingFilter } from "../humanitarian-funding/model.mjs";

/** Public page-only filtering and explicit exports; no fetch, account or persistence. */
export function wireHumanitarianFunding(root: HTMLElement): () => void {
  const script = root.querySelector<HTMLScriptElement>("[data-funding-json]");
  const controls = root.querySelector<HTMLFieldSetElement>("[data-funding-controls]");
  const search = root.querySelector<HTMLInputElement>("[data-funding-search]");
  const country = root.querySelector<HTMLSelectElement>("[data-funding-country]");
  const type = root.querySelector<HTMLSelectElement>("[data-funding-type]");
  const clear = root.querySelector<HTMLButtonElement>("[data-funding-clear]");
  const status = root.querySelector<HTMLElement>("[data-funding-status]");
  const empty = root.querySelector<HTMLElement>("[data-funding-empty]");
  const output = [...root.querySelectorAll<HTMLButtonElement>("[data-funding-export]")];
  const elements = [...root.querySelectorAll<HTMLElement>("[data-funding-row]")];
  if (!script || !controls || !search || !country || !type || !clear || !status || !empty || output.length !== 4) {
    if (status) status.textContent = "The filters could not start. The complete captured table and source links remain available.";
    return () => {};
  }
  let edition: FundingEdition;
  try {
    const raw = script.textContent || "";
    if (raw.length > 4_194_304) throw new Error();
    edition = validateFundingProjection(JSON.parse(raw));
    if (elements.length !== edition.rows.length || new Set(elements.map(r => r.dataset.fundingRow)).size !== elements.length || elements.some(el => !edition.rows.some(r => r.key === el.dataset.fundingRow))) throw new Error();
  } catch {
    status.textContent = "The captured table could not be checked for filtering. Read its source links and complete server-rendered rows below.";
    return () => {};
  }
  let disposed = false;
  const urls = new Map<string, ReturnType<typeof setTimeout>>();
  function revoke() { for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url); } urls.clear(); }
  const filter = (): FundingFilter => ({ search: search.value, country: country.value, type: type.value });
  const say = (text: string) => { if (!disposed) status.textContent = text; };
  const render = () => {
    if (disposed) return;
    const selected = selectFundingRows(edition, filter()), keys = new Set(selected.map(r => r.key));
    for (const row of elements) row.hidden = !keys.has(row.dataset.fundingRow!);
    empty.hidden = selected.length !== 0;
    say(`${selected.length} of ${edition.rows.length} captured rows shown. Rows may overlap; no funding amounts are added together.`);
  };
  const reset = () => { search.value = ""; country.value = ""; type.value = ""; render(); };
  function exportClick(event: Event) {
    if (disposed) return;
    const button = event.currentTarget as HTMLButtonElement;
    const [scope, format] = (button.dataset.fundingExport || "").split("-");
    if (!["complete", "selected"].includes(scope) || !["json", "csv"].includes(format)) return;
    const selection = scope === "complete" ? { kind: "complete" } : { kind: "filtered", ...filter() };
    const rows = scope === "complete" ? edition.rows : selectFundingRows(edition, filter());
    let href: string | null = null, anchor: HTMLAnchorElement | null = null;
    try {
      const text = format === "json" ? fundingSelectionJson(edition, rows, selection) : fundingSelectionCsv(edition, rows, selection);
      if (new TextEncoder().encode(text).length > 4_194_304) throw new Error("The selected export exceeds its size limit.");
      revoke();
      href = URL.createObjectURL(new Blob([text], { type: format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8" }));
      anchor = root.ownerDocument.createElement("a");
      anchor.href = href; anchor.download = `charitology-humanitarian-funding-${edition.referenceYear}-${scope}.${format}`; anchor.hidden = true;
      root.ownerDocument.body.append(anchor); anchor.click();
      const owned = href;
      urls.set(owned, setTimeout(() => { URL.revokeObjectURL(owned); urls.delete(owned); }, 1000));
      say(`${format.toUpperCase()} download requested for ${rows.length} source rows, with attribution, license and provenance.${format === "csv" ? " The CSV also has one marked provenance record." : ""}`);
    } catch {
      if (href) { URL.revokeObjectURL(href); urls.delete(href); }
      say("The export could not be prepared. Your filter choices and the readable source rows are kept.");
    } finally { anchor?.remove(); }
  }
  search.addEventListener("input", render);
  country.addEventListener("change", render); type.addEventListener("change", render);
  clear.addEventListener("click", reset); output.forEach(b => b.addEventListener("click", exportClick));
  const pagehide = () => revoke();
  globalThis.window?.addEventListener("pagehide", pagehide);
  controls.disabled = false; output.forEach(b => b.disabled = false); render();
  return () => {
    if (disposed) return; disposed = true; revoke(); controls.disabled = true; output.forEach(b => b.disabled = true);
    search.removeEventListener("input", render); country.removeEventListener("change", render); type.removeEventListener("change", render);
    clear.removeEventListener("click", reset); output.forEach(b => b.removeEventListener("click", exportClick));
    globalThis.window?.removeEventListener("pagehide", pagehide);
  };
}
