/** Local recovery UI. Downloads request files; they do not establish native Save. */
import {
  assertRemainingRecordControlBinding,
  REMAINING_RECORD_LIMITS,
  remainingRecordCapacity,
  type RRKey,
  type RRSession,
  type RRSnapshot,
  type RRViewTracker,
  type RRViewToken,
  type RRRawForm,
  type RRRestorePreview,
  type RRRemovePreview,
  type RRWriteResult,
} from "./remaining-record-recovery";
import {
  remainingRecordRawArchive,
  remainingRecordFormArchive,
} from "./remaining-record-recovery-formats";
import { download } from "./files";

export interface RRRecoveryControls {
  noteViewMutation(): void;
  refresh(): void;
  dispose(): void;
}
export interface RRRecoveryControlsOptions<K extends RRKey> {
  host: HTMLElement;
  session: RRSession<K>;
  view: RRViewTracker;
  readForms: () => readonly RRRawForm[];
  onAdopt: (snapshot: RRSnapshot<K>, view: RRViewToken) => void;
  onStatus?: (snapshot: RRSnapshot<K>) => void;
}
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "This recovery action could not finish.";

export function mountRemainingRecordRecoveryControls<K extends RRKey>(
  options: RRRecoveryControlsOptions<K>,
): RRRecoveryControls {
  const { host, session, view, readForms, onAdopt, onStatus } = options;
  assertRemainingRecordControlBinding(session, view);
  const key = session.key;
  const panel = document.createElement("details");
  panel.className = "callout rr-recovery";
  panel.dataset.rrRecovery = "true";
  const heading = document.createElement("summary");
  heading.textContent = "Backups and recovery";
  panel.append(heading);
  const status = document.createElement("p");
  status.dataset.rrStatus = "true";
  status.setAttribute("role", "status");
  const help = document.createElement("p");
  help.className = "note";
  help.textContent =
    "Keep private backups somewhere safe. A native JSON backup includes the complete validated records, including retained failed-save memory. Unsubmitted fields and original unreadable saved bytes have separate downloads. Reload older open tabs after an update; locks coordinate updated pages only.";
  const buttons = document.createElement("div");
  buttons.className = "btn-row";
  const recoveries = document.createElement("div");
  recoveries.className = "btn-row";
  const label = document.createElement("label");
  const discard = document.createElement("input");
  discard.type = "checkbox";
  discard.dataset.rrDiscard = "true";
  label.append(
    discard,
    document.createTextNode(
      " Allow this reviewed recovery to discard the current unsaved records and unfinished forms. Keep copies first if needed.",
    ),
  );
  const fileLabel = document.createElement("label");
  fileLabel.append(
    document.createTextNode("Choose this workspace's native JSON backup "),
  );
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.dataset.rrFile = "true";
  file.style.maxWidth = "100%";
  fileLabel.append(file);
  const description = document.createElement("p");
  description.dataset.rrPreview = "true";
  description.style.overflowWrap = "anywhere";
  const actions = document.createElement("div");
  actions.className = "btn-row";
  const result = document.createElement("p");
  result.dataset.rrResult = "true";
  result.setAttribute("role", "status");
  result.setAttribute("aria-live", "polite");
  panel.append(
    status,
    help,
    buttons,
    recoveries,
    label,
    fileLabel,
    description,
    actions,
    result,
  );
  host.append(panel);

  let disposed = false,
    epoch = 0,
    busy = false,
    notifying = false;
  let preview: RRRestorePreview<K> | RRRemovePreview<K> | null = null;
  // Capture the native abortable reader once. Commands never receive a read callback.
  const Reader =
    typeof globalThis.FileReader === "function" ? globalThis.FileReader : null;
  const nativeLimit = remainingRecordCapacity(key).nativeBytes;
  type Owned = { epoch: number; token: RRViewToken };
  type ActiveRead = { cancel: () => void };
  let activeRead: ActiveRead | null = null;
  function abortRead() {
    const reading = activeRead;
    activeRead = null;
    reading?.cancel();
  }
  function button(
    parent: HTMLElement,
    action: string,
    text: string,
    run: () => void,
  ) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "btn btn-small btn-ghost";
    el.dataset.rrAction = action;
    el.textContent = text;
    el.addEventListener("click", () => {
      if (!disposed) run();
    });
    parent.append(el);
    return el;
  }
  const say = (message: string) => {
    if (disposed) return;
    result.textContent = message;
    panel.open = true;
  };
  function revoke() {
    epoch++;
    abortRead();
    preview = null;
    description.textContent = "";
    apply.hidden = true;
    apply.disabled = true;
  }
  function begin() {
    view.changedView();
    revoke();
    return { epoch, token: view.capture() };
  }
  const current = (owned: { epoch: number; token: RRViewToken }) =>
    !disposed && epoch === owned.epoch && view.isCurrent(owned.token);
  function started<T>(
    owned: { epoch: number; token: RRViewToken },
    invoke: () => Promise<T>,
  ): Promise<T> {
    // Session methods revoke older authority synchronously at entry. Bind their
    // resulting generation before awaiting, then keep all later DOM checks.
    try {
      return invoke();
    } finally {
      owned.token = view.capture();
    }
  }
  async function run(
    task: () => Promise<void>,
    owned: { epoch: number; token: RRViewToken },
  ) {
    if (disposed || busy) return;
    busy = true;
    refresh();
    try {
      await task();
    } catch (error) {
      if (current(owned)) say(errorText(error));
    } finally {
      busy = false;
      refresh();
    }
  }
  function adopt(state: RRSnapshot<K>, token: RRViewToken) {
    if (!view.isCurrent(token) || disposed) return;
    try {
      onAdopt(state, token);
    } catch {
      say(
        "The recovery finished, but this page could not redraw it. Export the current records before reloading.",
      );
    }
  }
  function completed(
    value: RRWriteResult<K>,
    token: RRViewToken,
    message: string,
    redraw = true,
  ) {
    if (disposed) return;
    if (value.outcome === "saved" || value.outcome === "no-op") {
      say(message);
      if (redraw && value.viewCurrent) adopt(value.snapshot, token);
    } else if (value.outcome === "unsaved")
      say(
        "The browser could not keep this change. The exact desired records remain available for native backup or Retry; unfinished fields stay on this page.",
      );
    else say("A newer request replaced this action. Its fields were retained.");
  }
  const backup = button(
    buttons,
    "backup",
    "Download native record backup",
    () => {
      try {
        const saved = session.exportNative();
        download(
          "charitology-remaining-records.json",
          saved.text,
          "application/json;charset=utf-8",
        );
        say(
          `Requested the complete native record backup (${saved.persistence}). Unsubmitted forms are excluded.`,
        );
      } catch (error) {
        say(errorText(error));
      }
    },
  );
  button(buttons, "forms", "Download unfinished forms", () => {
    try {
      const text = remainingRecordFormArchive({
        format: "charitology-remaining-record-forms",
        version: 1,
        key,
        exportedAt: new Date().toISOString(),
        forms: readForms(),
      });
      download(
        "charitology-unfinished-forms.json",
        text,
        "application/json;charset=utf-8",
      );
      say(
        "Requested unfinished-form recovery. This file is separate from validated records and cannot restore a workspace. Forms remain on this page.",
      );
    } catch (error) {
      say(
        `${errorText(error)} Fields remain on this page. Plain-text recovery is also available.`,
      );
    }
  });
  button(
    buttons,
    "forms-text",
    "Download unfinished fields as plain text",
    () => {
      try {
        const forms = readForms();
        const text =
          "Unfinished private fields; not a workspace restore file.\n" +
          key +
          "\n\n" +
          forms
            .map(
              (form) =>
                `${form.form} (editing ${form.editingId ?? "new"})\n` +
                Object.entries(form.values)
                  .map(([name, value]) => `${name}: ${value}`)
                  .join("\n"),
            )
            .join("\n\n");
        if (
          text.length > REMAINING_RECORD_LIMITS.rawArchiveBytes ||
          new TextEncoder().encode(text).byteLength >
            REMAINING_RECORD_LIMITS.rawArchiveBytes
        )
          throw Error(
            "The whole plain-text recovery exceeds its 128,000,000-byte limit. Copy fields from this page in smaller parts.",
          );
        download("charitology-unfinished-fields.txt", text);
        say(
          "Requested plain-text field recovery. It is an unvalidated working document, not a restore file. Fields remain unchanged.",
        );
      } catch (error) {
        say(errorText(error));
      }
    },
  );
  function raw(copy: "protected" | "observed") {
    try {
      const value = session.rawSavedCopy(copy);
      if (!value)
        throw Error("No readable raw saved bytes are available for this copy.");
      const text = remainingRecordRawArchive({
        format: "charitology-remaining-record-raw-copy",
        version: 1,
        key,
        copy,
        raw: value.raw,
      });
      download(
        `charitology-${copy}-raw-copy.json`,
        text,
        "application/json;charset=utf-8",
      );
      say(
        `Requested the exact ${copy} saved-copy archive. It is inert raw recovery, not a valid native restore file.`,
      );
    } catch (error) {
      say(errorText(error));
    }
  }
  const protectedCopy = button(
    recoveries,
    "protected",
    "Download protected original saved bytes",
    () => raw("protected"),
  );
  const observedCopy = button(
    recoveries,
    "observed",
    "Download currently observed saved bytes",
    () => raw("observed"),
  );
  const retry = button(recoveries, "retry", "Retry exact failed save", () => {
    if (busy) return;
    const owned = begin();
    void run(async () => {
      const next = await started(owned, () => session.retryPersist());
      if (current(owned))
        completed(
          next,
          owned.token,
          "The exact retained change is now saved.",
          false,
        );
    }, owned);
  });
  const reload = button(recoveries, "reload", "Reload saved copy", () => {
    if (busy) return;
    const allowed = discard.checked,
      owned = begin();
    void run(async () => {
      const next = await started(owned, () =>
        session.reload({ discardLocal: allowed }),
      );
      if (!current(owned)) return;
      if (
        (next.code === "ready" || next.code === "read-only") &&
        next.hasCurrent &&
        (next.persistence === "saved" || next.persistence === "absent")
      ) {
        say(
          next.persistence === "saved"
            ? "Loaded the saved copy."
            : "This saved key is absent. Opened an unsaved empty workspace.",
        );
        adopt(next, owned.token);
      } else say(next.message);
    }, owned);
  });
  const undo = button(recoveries, "undo", "Undo previous record change", () => {
    if (busy) return;
    const allowed = discard.checked,
      owned = begin();
    void run(async () => {
      const next = await started(owned, () =>
        session.undo({ discardLocal: allowed }),
      );
      if (current(owned))
        completed(
          next,
          owned.token,
          "Restored the reviewed previous record state.",
        );
    }, owned);
  });
  const remove = button(
    recoveries,
    "review-remove",
    "Review removing this saved workspace",
    () => {
      if (busy) return;
      const allowed = discard.checked,
        owned = begin();
      void run(async () => {
        const next = await started(owned, () =>
          session.previewRemove({ discardLocal: allowed }),
        );
        if (!current(owned)) return;
        preview = next;
        description.textContent = `Remove only ${key}. Successful Apply leaves an empty unsaved workspace; other keys remain. Review ${next.reviewHash}.`;
        apply.textContent = "Apply removal of this saved key";
        apply.hidden = false;
        say(
          "Removal is only a preview. Keep native, raw and unfinished-form copies as needed before Apply.",
        );
      }, owned);
    },
  );
  const apply = button(actions, "apply", "Apply reviewed replacement", () => {
    if (busy || !preview) return;
    const selected = preview,
      owned = { epoch: ++epoch, token: selected.view };
    abortRead();
    preview = null;
    apply.hidden = true;
    void run(async () => {
      const next =
        selected.kind === "remove"
          ? await session.applyRemove(selected)
          : await session.applyRestore(selected);
      if (current(owned)) {
        description.textContent = "";
        completed(
          next,
          owned.token,
          selected.kind === "remove"
            ? "Removed this saved key. The empty workspace is unsaved; guarded Undo is available."
            : "Restored the complete reviewed native backup.",
        );
      }
    }, owned);
  });
  apply.hidden = true;
  button(actions, "cancel", "Cancel recovery preview", () => {
    begin();
    file.value = "";
    say("Canceled recovery. No replacement was applied.");
  });
  discard.addEventListener("change", () => {
    if (disposed) return;
    begin();
    say("Recovery permission changed. Make a new preview for this choice.");
  });
  function readBytes(selected: File, owned: Owned): Promise<Uint8Array> {
    if (!Reader)
      return Promise.reject(
        Error(
          "Native import is unavailable because this browser has no abortable FileReader. Native exports and raw recovery remain available.",
        ),
      );
    return new Promise((resolve, reject) => {
      const reader = new Reader();
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        reader.onload = reader.onerror = reader.onabort = null;
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        if (activeRead === reading) activeRead = null;
      };
      const refuse = (error: unknown, abort = false) => {
        if (settled) return;
        settled = true;
        stop();
        // Detach first: native abort events and retained synthetic late events
        // cannot revive old authority or replace a newer status.
        if (abort) {
          try {
            reader.abort();
          } catch {
            /* already terminal */
          }
        }
        reject(error);
      };
      const reading: ActiveRead = {
        cancel: () => refuse(Error("This file choice was canceled."), true),
      };
      activeRead = reading;
      reader.onload = () => {
        if (settled) return;
        if (!current(owned)) {
          refuse(Error("A newer view replaced this file choice."), true);
          return;
        }
        try {
          const buffer = reader.result;
          if (
            !(buffer instanceof ArrayBuffer) ||
            buffer.byteLength !== selected.size ||
            buffer.byteLength > nativeLimit
          )
            throw Error(
              "The actual file bytes do not match this bounded file choice.",
            );
          const bytes = new Uint8Array(buffer);
          settled = true;
          stop();
          resolve(bytes);
        } catch (error) {
          refuse(error);
        }
      };
      reader.onerror = () =>
        refuse(
          Error(
            "This file could not be read. Keep the original and choose it again for a new review.",
          ),
        );
      reader.onabort = () =>
        refuse(
          Error(
            "Reading the file was aborted. Choose it again for a new review.",
          ),
        );
      timer = setTimeout(
        () =>
          refuse(
            Error(
              "Reading the file timed out. Keep the original and choose it again for a new review.",
            ),
            true,
          ),
        REMAINING_RECORD_LIMITS.fileReadTimeoutMs,
      );
      try {
        reader.readAsArrayBuffer(selected);
      } catch (error) {
        refuse(error, true);
      }
    });
  }
  file.addEventListener("change", () => {
    if (disposed) return;
    // Revoke before reading even an empty, invalid or oversized newer choice.
    const owned = begin(),
      selected = file.files?.[0],
      allowed = discard.checked;
    const count = file.files?.length ?? 0;
    file.value = "";
    if (!selected || count !== 1) {
      say("Choose one native JSON file. Earlier preview canceled.");
      return;
    }
    if (
      !Number.isSafeInteger(selected.size) ||
      selected.size < 0 ||
      selected.size > nativeLimit
    ) {
      say(
        `Choose one complete native backup no larger than ${nativeLimit.toLocaleString("en-US")} bytes. Keep a larger original and split its records in the originating tool. Earlier preview canceled.`,
      );
      return;
    }
    if (!Reader) {
      say(
        "Native import is unavailable because this browser has no abortable FileReader. Native exports and raw recovery remain available.",
      );
      return;
    }
    // A replacement file event is allowed during reading/digest so it can revoke
    // the previous choice immediately. The engine owns one shared payload lane.
    void (async () => {
      try {
        const bytes = await readBytes(selected, owned);
        if (!current(owned)) return;
        const next = await started(owned, () =>
          session.previewRestore(bytes, { discardLocal: allowed }),
        );
        if (!current(owned)) return;
        preview = next;
        description.textContent = `${next.summary.title}; ${Object.entries(
          next.summary.counts,
        )
          .map(([name, count]) => `${name}: ${count}`)
          .join(
            ", ",
          )}. This replaces the whole native model. Review ${next.reviewHash}.`;
        apply.textContent = "Apply reviewed native backup";
        apply.hidden = false;
        say(
          "The native backup is ready for review. Nothing has been restored yet.",
        );
      } catch (error) {
        if (current(owned)) say(errorText(error));
      } finally {
        refresh();
      }
    })();
  });
  function refresh() {
    if (disposed) return;
    const state = session.snapshot();
    if (preview && !view.isCurrent(preview.view)) revoke();
    status.textContent = `${state.persistence}: ${state.message}`;
    backup.disabled = !state.hasCurrent;
    protectedCopy.disabled =
      state.code === "disposed" ||
      (!state.hasProtectedRaw && !state.hasObservedRaw);
    observedCopy.disabled = state.code === "disposed" || !state.hasObservedRaw;
    retry.disabled = busy || !state.pendingPersist || state.code !== "ready";
    reload.disabled = busy || state.code === "disposed";
    undo.disabled =
      busy ||
      !state.canUndo ||
      state.code === "read-only" ||
      state.code === "disposed" ||
      state.code === "unavailable";
    remove.disabled =
      busy ||
      state.code === "read-only" ||
      state.code === "disposed" ||
      state.observedPresence === "unreadable";
    file.disabled =
      !Reader ||
      state.code === "read-only" ||
      state.code === "disposed" ||
      state.observedPresence === "unreadable";
    apply.disabled = busy || !preview;
    // Notification is outside the engine and has no authority to save or discard.
    // A caller may refresh its record view here, while retaining raw form controls.
    if (onStatus && !notifying) {
      notifying = true;
      try {
        onStatus(state);
      } catch {
        say(
          "Record status changed, but this page could not redraw it. Native backup remains available; keep unfinished forms before reloading.",
        );
      } finally {
        notifying = false;
      }
    }
  }
  refresh();
  if (!Reader)
    say(
      "Native import is unavailable because this browser has no abortable FileReader. Native exports and raw recovery remain available.",
    );
  return Object.freeze({
    noteViewMutation() {
      if (!disposed) revoke();
    },
    refresh,
    dispose() {
      if (disposed) return;
      // Revoking only this panel's epoch would leave a queued engine write valid.
      try {
        view.changedView();
      } catch {
        /* The caller may have closed its view first. */
      }
      revoke();
      disposed = true;
      abortRead();
      panel.remove();
    },
  });
}

export { createRemainingRecordDraftAutosaver } from "./remaining-record-recovery-autosave";
export type {
  RRAutosaveKey,
  RRDraftAutosaver,
  RRDraftAutosaveOptions,
} from "./remaining-record-recovery-autosave";
