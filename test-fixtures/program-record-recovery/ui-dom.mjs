// Synthetic DOM only; actual engine captures its own storage/locks. No browser proof.
import {
  installD1Dom,
  settle,
  fileOf,
  delayedFile,
} from "../donor-recovery/ui-dom.mjs";
export { settle, fileOf, delayedFile };
export function installProgramRecordDom(initial = {}) {
  const dom = installD1Dom();
  const create = dom.document.createElement;
  dom.document.createElement = (...args) => {
    const el = create(...args);
    el.style ??= {};
    return el;
  };
  for (const [key, value] of Object.entries(initial))
    dom.values.set(
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  dom.action = (name) =>
    dom.host
      .querySelectorAll("button")
      .find((b) => b.dataset.prAction === name);
  dom.field = (name) =>
    dom.host.querySelectorAll("input").find((e) => e.dataset[name] === "true");
  dom.say = () =>
    dom.host.querySelectorAll("p").find((p) => p.dataset.prResult === "true")
      ?.textContent ?? "";
  dom.state = () =>
    dom.host.querySelectorAll("p").find((p) => p.dataset.prStatus === "true")
      ?.textContent ?? "";
  dom.previewText = () =>
    dom.host.querySelectorAll("p").find((p) => p.dataset.prPreview === "true")
      ?.textContent ?? "";
  return dom;
}
