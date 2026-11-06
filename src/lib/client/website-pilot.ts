import {
  blankWebsitePilot,
  websitePilotValues,
  applyWebsitePilotFields,
  restoreWebsitePilot,
  websitePilotNative,
  websitePilotBriefs,
  websitePilotCounts,
  websitePilotFields,
  websitePilotHash,
  WEBSITE_PILOT_KEY,
  WEBSITE_PILOT_LIMITS,
  type WebsitePilotState,
  type WebsitePilotRaw,
} from "./website-pilot-model";
import {
  createRemainingRecordView,
  type RRViewToken,
  type RRFormId,
} from "./remaining-record-recovery";

type Reviewed = {
  token: RRViewToken;
  raw: string;
  state: string;
  native: string;
  briefs: ReturnType<typeof websitePilotBriefs>;
  sha: string;
};
type Restore = {
  token: RRViewToken;
  raw: string;
  state: string;
  file: File;
  candidate: WebsitePilotState;
  sha: string;
  counts: ReturnType<typeof websitePilotCounts>;
};
/** File-first guide. It never opens a storage session or sends a request. */
export function mountWebsitePilotGuide(root: HTMLElement): () => void {
  const $ = <T extends HTMLElement>(selector: string) =>
    root.querySelector<T>(selector);
  const controls = $<HTMLFieldSetElement>("[data-pilot-controls]"),
    status = $("[data-pilot-status]");
  if (!controls || !status) return () => {};
  const fields = new Map(
    [
      ...root.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("[data-pilot-field]"),
    ].map((f) => [f.dataset.pilotField!, f]),
  );
  const review = $<HTMLButtonElement>("[data-pilot-review]"),
    preview = $("[data-pilot-preview]"),
    reviewAck = $<HTMLInputElement>("[data-pilot-reviewed]");
  const native = $<HTMLButtonElement>("[data-pilot-native]"),
    website = $<HTMLButtonElement>("[data-pilot-website]"),
    osBrief = $<HTMLButtonElement>("[data-pilot-os-brief]");
  const nativeSha = $("[data-pilot-sha]"),
    websiteText = $("[data-pilot-website-text]"),
    osText = $("[data-pilot-os-text]");
  const file = $<HTMLInputElement>("[data-pilot-file]"),
    restorePanel = $("[data-pilot-restore]"),
    restoreInfo = $("[data-pilot-restore-info]"),
    restoreAck = $<HTMLInputElement>("[data-pilot-replace-ack]"),
    apply = $<HTMLButtonElement>("[data-pilot-apply]");
  const rawCopy = $<HTMLButtonElement>("[data-pilot-raw]"),
    lastValid = $<HTMLButtonElement>("[data-pilot-last-valid]");
  const osChoice = $<HTMLInputElement>("[data-pilot-os-choice]"),
    osLink = $<HTMLAnchorElement>("[data-pilot-os-link]");
  const haltSubmit = (event: Event) => event.preventDefault();
  root.addEventListener("submit", haltSubmit, true);
  if (
    !review ||
    !preview ||
    !reviewAck ||
    !native ||
    !website ||
    !osBrief ||
    !nativeSha ||
    !websiteText ||
    !osText ||
    !file ||
    !restorePanel ||
    !restoreInfo ||
    !restoreAck ||
    !apply ||
    !rawCopy ||
    !lastValid ||
    !osChoice ||
    !osLink ||
    fields.size !== websitePilotFields.length
  ) {
    status.textContent =
      "The guide could not start. The original briefs remain available below.";
    return () => root.removeEventListener("submit", haltSubmit, true);
  }
  let state: WebsitePilotState;
  try {
    state = blankWebsitePilot();
  } catch {
    status.textContent =
      "The existing native case definitions could not be loaded. The original briefs remain available.";
    return () => root.removeEventListener("submit", haltSubmit, true);
  }
  const view = createRemainingRecordView(WEBSITE_PILOT_KEY);
  let disposed = false,
    dirty = false,
    reviewed: Reviewed | null = null,
    replacement: Restore | null = null,
    reader: FileReader | null = null,
    cancelRead: (() => void) | null = null;
  let visibleBaseline = websitePilotValues(state);
  const urls = new Map<string, ReturnType<typeof setTimeout>>();
  const say = (text: string, focus = false) => {
    if (disposed) return;
    status.textContent = text;
    if (focus) status.focus();
  };
  const raw = (): WebsitePilotRaw =>
    Object.freeze(
      Object.fromEntries(
        websitePilotFields.map((f) => [f.id, fields.get(f.id)!.value]),
      ),
    );
  const stamp = () => JSON.stringify(raw());
  const stateStamp = () => websitePilotNative(state);
  const hydrate = () => {
    const values = websitePilotValues(state);
    for (const f of websitePilotFields) fields.get(f.id)!.value = values[f.id];
    visibleBaseline = raw();
  };
  const osReset = () => {
    osChoice.checked = false;
    osLink.hidden = true;
    osLink.removeAttribute("href");
  };
  const revoke = () => {
    reviewed = null;
    replacement = null;
    preview.hidden = true;
    restorePanel.hidden = true;
    reviewAck.checked = false;
    reviewAck.disabled = true;
    restoreAck.checked = false;
    restoreAck.disabled = true;
    native.disabled = true;
    website.disabled = true;
    osBrief.disabled = true;
    apply.disabled = true;
    websiteText.textContent = "";
    osText.textContent = "";
    nativeSha.textContent = "";
    osReset();
  };
  const abortReader = () => {
    const cancel = cancelRead;
    cancelRead = null;
    cancel?.();
    reader = null;
  };
  const revokeUrls = () => {
    for (const [href, timer] of urls) {
      clearTimeout(timer);
      URL.revokeObjectURL(href);
    }
    urls.clear();
  };
  const current = (token: RRViewToken, rawStamp: string, base: string) =>
    !disposed &&
    view.isCurrent(token) &&
    stamp() === rawStamp &&
    stateStamp() === base;
  const download = (text: string, name: string, type: string) => {
    const href = URL.createObjectURL(new Blob([text], { type }));
    let anchor: HTMLAnchorElement | null = null;
    try {
      anchor = root.ownerDocument.createElement("a");
      anchor.href = href;
      anchor.download = name;
      anchor.hidden = true;
      root.ownerDocument.body.append(anchor);
      anchor.click();
    } finally {
      anchor?.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(href);
        urls.delete(href);
      }, 1000);
      urls.set(href, timer);
    }
    say(
      "Download requested. Check the saved file before leaving. Your writing remains on this page.",
    );
  };
  const onEdit = (event: Event) => {
    const target = event.target as HTMLElement;
    if (!target.dataset?.pilotField) return;
    const f = websitePilotFields.find(
      (f) => f.id === target.dataset.pilotField,
    );
    if (!f) return;
    const form: RRFormId =
      "context" in f.pointer
        ? "context"
        : `collection:${({ task: "diagnostics", observation: "evidence", change: "actions", publication: "readiness", recurring: "readiness", os: "readiness", osRecurring: "readiness", publicCase: "readiness", review: "learning", osReview: "learning" } as const)[f.pointer.row]}`;
    view.changedForm(form);
    dirty = true;
    abortReader();
    revoke();
    say(
      "Writing changed. Review again before downloading or replacing the case.",
    );
  };
  const onReview = () => {
    if (disposed) return;
    view.changedView();
    abortReader();
    revoke();
    const token = view.capture(),
      rawStamp = stamp(),
      base = stateStamp();
    try {
      const candidate = applyWebsitePilotFields(
        state,
        raw(),
        new Date().toISOString(),
        visibleBaseline,
      );
      const text = websitePilotNative(candidate),
        briefs = websitePilotBriefs(candidate),
        sha = websitePilotHash(text);
      if (!current(token, rawStamp, base)) return;
      state = candidate;
      visibleBaseline = raw();
      reviewed = {
        token,
        raw: rawStamp,
        state: stateStamp(),
        native: text,
        briefs,
        sha,
      };
      nativeSha.textContent = `Complete native file: ${new TextEncoder().encode(text).length.toLocaleString()} bytes · SHA-256 ${sha}`;
      websiteText.textContent = briefs["website-preview-brief"];
      osText.textContent = briefs["os-pilot-brief"];
      preview.hidden = false;
      reviewAck.disabled = false;
      say(
        "Case prepared in memory. Inspect both briefs, the complete-file scope and the limits, then acknowledge this exact version.",
        true,
      );
    } catch (error) {
      if (current(token, rawStamp, base))
        say(
          error instanceof Error
            ? error.message
            : "The review could not finish. Your writing remains here.",
          true,
        );
    }
  };
  const checkReview = () => {
    const good = Boolean(
      reviewed &&
      reviewAck.checked &&
      current(reviewed.token, reviewed.raw, reviewed.state),
    );
    native.disabled = !good;
    website.disabled = !good;
    osBrief.disabled = !good;
  };
  const emit = (which: "native" | "website" | "os") => {
    if (disposed) return;
    if (
      !reviewed ||
      !reviewAck.checked ||
      !current(reviewed.token, reviewed.raw, reviewed.state)
    ) {
      revoke();
      say(
        "This case no longer matches the inspected version. Review it again.",
        true,
      );
      return;
    }
    try {
      if (which === "native")
        download(
          reviewed.native,
          "charitology-website-pilot-nonprofit-advisory.json",
          "application/json;charset=utf-8",
        );
      else
        download(
          reviewed.briefs[
            which === "website" ? "website-preview-brief" : "os-pilot-brief"
          ],
          which === "website"
            ? "website-preview-brief.md"
            : "os-pilot-brief.md",
          "text/markdown;charset=utf-8",
        );
    } catch {
      say(
        "The download could not start. Your writing and prepared case remain available.",
        true,
      );
    }
  };
  const onPickerOpen = () => {
    if (disposed) return;
    view.changedView();
    abortReader();
    revoke();
    // Native pickers do not emit change when the already-selected file is
    // chosen again. Clear only at opening, before a new owned selection; the
    // admitted file must remain selected for the preview/Apply identity guard.
    file.value = "";
    say("Choose a replacement file. Cancelling keeps your current writing.");
  };
  const onPickerCancel = () => {
    if (disposed) return;
    view.changedView();
    abortReader();
    revoke();
    say("File choice cancelled. Your current writing remains here.");
  };
  const onFile = () => {
    if (disposed) return;
    view.changedView();
    abortReader();
    revoke();
    const token = view.capture(),
      rawStamp = stamp(),
      base = stateStamp(),
      selected = file.files?.[0];
    if (!selected) {
      say("No replacement file selected. Your current writing remains here.");
      return;
    }
    if (selected.size > WEBSITE_PILOT_LIMITS.nativeBytes) {
      say(
        "The complete native file exceeds 8,000,000 bytes. Your current writing remains here.",
        true,
      );
      return;
    }
    if (typeof FileReader === "undefined") {
      say(
        "File reading is unavailable. Keep your work with the download controls.",
        true,
      );
      return;
    }
    const ownedReader = new FileReader();
    reader = ownedReader;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      ownedReader.onload = null;
      ownedReader.onerror = null;
      ownedReader.onabort = null;
      if (reader === ownedReader) {
        reader = null;
        cancelRead = null;
      }
    };
    const fail = (text: string) => {
      const active = current(token, rawStamp, base);
      finish();
      if (active) {
        view.changedView();
        revoke();
        say(text, true);
      }
    };
    const timer = setTimeout(() => {
      if (finished) return;
      const active = current(token, rawStamp, base);
      finish();
      if (ownedReader.readyState === 1) ownedReader.abort();
      if (active) {
        view.changedView();
        revoke();
        say(
          "The file read timed out. Your current writing remains here; choose the file again.",
          true,
        );
      }
    }, WEBSITE_PILOT_LIMITS.readTimeoutMs);
    cancelRead = () => {
      finish();
      if (ownedReader.readyState === 1) ownedReader.abort();
    };
    ownedReader.onerror = () =>
      fail("The file could not be read. Your current writing remains here.");
    ownedReader.onabort = () =>
      fail("The file read was cancelled. Your current writing remains here.");
    ownedReader.onload = () => {
      if (finished) return;
      try {
        if (!(ownedReader.result instanceof ArrayBuffer))
          throw Error("Choose an ordinary native JSON file.");
        const bytes = new Uint8Array(ownedReader.result.slice(0));
        if (
          bytes.byteLength !== selected.size ||
          bytes.byteLength > WEBSITE_PILOT_LIMITS.nativeBytes
        )
          throw Error("The complete file size changed or exceeded its bound.");
        const candidate = restoreWebsitePilot(bytes),
          counts = websitePilotCounts(candidate),
          sha = websitePilotHash(bytes);
        finish();
        if (!current(token, rawStamp, base) || file.files?.[0] !== selected)
          return;
        replacement = {
          token,
          raw: rawStamp,
          state: base,
          file: selected,
          candidate,
          sha,
          counts,
        };
        restoreInfo.textContent = `Verified native file · ${selected.size.toLocaleString()} bytes · SHA-256 ${sha}. All ${counts.records} records will remain in the complete file, including ${counts.otherRecords} records outside this guide’s named case.`;
        restorePanel.hidden = false;
        restoreAck.disabled = false;
        say(
          "Replacement preview ready. It changes nothing until you explicitly replace the case in this page.",
          true,
        );
      } catch (error) {
        finish();
        if (current(token, rawStamp, base))
          say(
            error instanceof Error
              ? error.message
              : "The file is invalid. Your current writing remains here.",
            true,
          );
      }
    };
    say("Reading only the selected local file…");
    try {
      ownedReader.readAsArrayBuffer(selected);
    } catch {
      fail("The file read could not start. Your current writing remains here.");
    }
  };
  const checkRestore = () => {
    apply.disabled = !(
      replacement &&
      restoreAck.checked &&
      current(replacement.token, replacement.raw, replacement.state) &&
      file.files?.[0] === replacement.file
    );
  };
  const onApply = () => {
    if (disposed) return;
    const selected = replacement;
    if (
      !selected ||
      !restoreAck.checked ||
      !current(selected.token, selected.raw, selected.state) ||
      file.files?.[0] !== selected.file
    ) {
      revoke();
      say(
        "Review the replacement file again. The case or unfinished fields changed.",
        true,
      );
      return;
    }
    replacement = null;
    view.changedView();
    abortReader();
    revoke();
    state = selected.candidate;
    hydrate();
    dirty = false;
    say(
      "Opened the verified case in this page. All native records were retained. Nothing was written to browser storage or Charity OS.",
      true,
    );
  };
  const onRaw = () => {
    if (disposed) return;
    const values = raw(),
      text = [
        "Charitology website pilot — unfinished writing",
        "Text recovery only; this is not a native restore file.",
        "Values are JSON-quoted to retain exact UTF-16 text. The last valid native backup separately retains all records.",
        "",
        ...websitePilotFields.flatMap((f) => [
          f.label,
          JSON.stringify(values[f.id]),
          "",
        ]),
      ].join("\n");
    if (
      new TextEncoder().encode(text).length > WEBSITE_PILOT_LIMITS.briefBytes
    ) {
      say(
        "The complete writing copy is too large. Nothing was truncated. Copy your fields before leaving.",
        true,
      );
      return;
    }
    try {
      download(
        text,
        "website-pilot-unfinished-writing.txt",
        "text/plain;charset=utf-8",
      );
    } catch {
      say(
        "The writing-copy download could not start. Your fields remain here.",
        true,
      );
    }
  };
  const onLast = () => {
    if (disposed) return;
    try {
      download(
        stateStamp(),
        "website-pilot-last-valid-native.json",
        "application/json;charset=utf-8",
      );
      say(
        "Last valid native download requested. It excludes later unreviewed or invalid fields. Keep a writing copy too.",
      );
    } catch {
      say(
        "The last valid file could not be downloaded. Your fields remain here.",
        true,
      );
    }
  };
  const onOs = () => {
    if (disposed) return;
    osLink.hidden = !osChoice.checked;
    if (osChoice.checked) osLink.href = "https://os.charitology.org/";
    else osLink.removeAttribute("href");
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  const onHide = () => {
    if (disposed) return;
    view.changedView();
    abortReader();
    revoke();
    revokeUrls();
    say("Review this retained case again before downloading or replacing it.");
  };
  controls.addEventListener("input", onEdit);
  controls.addEventListener("change", onEdit);
  review.addEventListener("click", onReview);
  reviewAck.addEventListener("change", checkReview);
  const onNative = () => emit("native"),
    onWebsite = () => emit("website"),
    onOsBrief = () => emit("os");
  native.addEventListener("click", onNative);
  website.addEventListener("click", onWebsite);
  osBrief.addEventListener("click", onOsBrief);
  file.addEventListener("click", onPickerOpen);
  file.addEventListener("cancel", onPickerCancel);
  file.addEventListener("change", onFile);
  restoreAck.addEventListener("change", checkRestore);
  apply.addEventListener("click", onApply);
  rawCopy.addEventListener("click", onRaw);
  lastValid.addEventListener("click", onLast);
  osChoice.addEventListener("change", onOs);
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("pagehide", onHide);
  hydrate();
  revoke();
  controls.disabled = false;
  root.dataset.pilotReady = "true";
  say(
    "File-first case ready. Nothing is saved between visits. Use roles and public or fictional information.",
  );
  return () => {
    if (disposed) return;
    view.changedView();
    abortReader();
    revoke();
    revokeUrls();
    disposed = true;
    view.dispose();
    controls.disabled = true;
    root.removeEventListener("submit", haltSubmit, true);
    controls.removeEventListener("input", onEdit);
    controls.removeEventListener("change", onEdit);
    review.removeEventListener("click", onReview);
    reviewAck.removeEventListener("change", checkReview);
    native.removeEventListener("click", onNative);
    website.removeEventListener("click", onWebsite);
    osBrief.removeEventListener("click", onOsBrief);
    file.removeEventListener("click", onPickerOpen);
    file.removeEventListener("cancel", onPickerCancel);
    file.removeEventListener("change", onFile);
    restoreAck.removeEventListener("change", checkRestore);
    apply.removeEventListener("click", onApply);
    rawCopy.removeEventListener("click", onRaw);
    lastValid.removeEventListener("click", onLast);
    osChoice.removeEventListener("change", onOs);
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("pagehide", onHide);
  };
}
