import { download } from "./files";
import {
  prepareWebsiteVisitorHandoff, worksheetFieldIds, worksheetRows,
  WorksheetInputError, type WorksheetDraft,
} from "./website-visitor-worksheet-model";

/** Holds a single local comparison for the lifetime of this page. */
export function mountWebsiteVisitorWorksheet(root: HTMLElement): () => void {
  const select = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-visitor-${name}]`);
  const controls = select<HTMLFieldSetElement>("controls");
  const review = select<HTMLButtonElement>("review");
  const preview = select("preview");
  const text = select("text");
  const status = select("status");
  const acknowledgment = select<HTMLInputElement>("ack");
  const save = select<HTMLButtonElement>("save");
  const fields = worksheetFieldIds.map((id) =>
    root.querySelector<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>(`[data-visitor-field="${id}"]`),
  );
  const cells = [...root.querySelectorAll<HTMLElement>("[data-visitor-value]")];
  const view = root.ownerDocument.defaultView;
  if (!controls || !review || !preview || !text || !status || !acknowledgment || !save ||
      !view || !fields.every((field) => field !== null) || cells.length !== worksheetRows.length * 2) {
    if (status) status.textContent = "The worksheet could not start. Use the editable website brief below.";
    return () => {};
  }
  let reviewed: { stamp: string; markdown: string } | null = null;

  const announce = (message: string, focus = false) => {
    status.textContent = message;
    if (focus) status.focus();
  };
  const draft = () => Object.fromEntries(
    worksheetFieldIds.map((id, index) => [id, fields[index].value]),
  ) as WorksheetDraft;
  const revoke = () => {
    reviewed = null;
    acknowledgment.checked = false;
    acknowledgment.disabled = true;
    save.disabled = true;
    preview.hidden = true;
    text.textContent = "";
    for (const cell of cells) cell.textContent = "";
  };
  const onEdit = () => {
    if (!reviewed) return;
    revoke();
    announce("The worksheet changed. Review the new handoff before downloading.");
  };
  const onReview = () => {
    revoke();
    try {
      const current = draft();
      const handoff = prepareWebsiteVisitorHandoff(current);
      reviewed = { stamp: JSON.stringify(current), markdown: handoff.markdown };
      text.textContent = handoff.markdown;
      const values = handoff.rows.flatMap(({ before, after }) => [before, after]);
      cells.forEach((cell, index) => { cell.textContent = values[index]; });
      preview.hidden = false;
      acknowledgment.disabled = false;
      announce("The handoff is ready below. Review the exact text before downloading.", true);
    } catch (error) {
      announce(error instanceof WorksheetInputError ? error.message : "The handoff could not be prepared. Your entries are still on this page.", true);
    }
  };
  const onAcknowledge = () => {
    if (reviewed && reviewed.stamp !== JSON.stringify(draft())) onEdit();
    save.disabled = !reviewed || !acknowledgment.checked;
  };
  const onSave = () => {
    onAcknowledge();
    if (!reviewed || save.disabled) return;
    try {
      download("website-visitor-task-handoff.md", reviewed.markdown, "text/markdown;charset=utf-8");
      announce("Download requested. Check your browser for the saved file.");
    } catch {
      announce("The browser could not start the download. The handoff is still below.", true);
    }
  };
  const clearPage = () => {
    for (const field of fields) field.value = "";
    revoke();
    announce("Start with one task. Blank measurements stay unknown.");
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) clearPage();
  };

  controls.addEventListener("input", onEdit);
  controls.addEventListener("change", onEdit);
  review.addEventListener("click", onReview);
  acknowledgment.addEventListener("change", onAcknowledge);
  save.addEventListener("click", onSave);
  view.addEventListener("pagehide", clearPage);
  view.addEventListener("pageshow", onPageShow);
  clearPage();
  controls.disabled = false;

  return () => {
    clearPage();
    controls.disabled = true;
    controls.removeEventListener("input", onEdit);
    controls.removeEventListener("change", onEdit);
    review.removeEventListener("click", onReview);
    acknowledgment.removeEventListener("change", onAcknowledge);
    save.removeEventListener("click", onSave);
    view.removeEventListener("pagehide", clearPage);
    view.removeEventListener("pageshow", onPageShow);
  };
}
