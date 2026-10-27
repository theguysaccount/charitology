// Shared recovery controls for the fourteen existing donor keys. No remote calls.
// A generated download is not evidence that a native file was saved.
import {
  assertD1ControlBinding,
  D1_LIMITS,
  type D1ToolSession,
  type D1ViewTracker,
  type D1RecoveryControls,
  type D1RecoveryControlsOptions,
  type D1GrantRecoveryControlsOptions,
  type D1RestorePreview,
  type D1ClearPreview,
  type D1GrantRestorePlan,
  type D1GrantRestoreStep,
  type D1GrantRemoveStep,
  type D1GrantKey,
} from "./donor-recovery";
import { d1RawRecovery } from "./donor-recovery-formats";
import { download } from "./files";

const titles: Record<string, string> = {
  gifts: "Gift log",
  portfolio: "Portfolio",
  legacy: "Legacy worksheet",
  "gift-card": "Gift card",
  "ce-models": "Saved cost-effectiveness models",
  "due-diligence": "Due diligence library",
  "impact-drafts": "Measurement library",
  split: "Split instructions",
  compass: "Values Compass",
  "disaster-plan": "Disaster response plan",
  wrapped: "Wrapped preferences",
  "grant-proposals": "Proposal library",
  "grant-weights": "Grant weights",
  "grant-draft": "Current grant draft",
};
const grantOrder: readonly D1GrantKey[] = [
  "grant-proposals",
  "grant-weights",
  "grant-draft",
];
type Epochs = ReturnType<D1ViewTracker["snapshot"]>;
type ViewBinding = Pick<Epochs, "formGeneration" | "recoveryGeneration">;
type ActionButton = HTMLButtonElement & { dataset: DOMStringMap };

function textError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "This recovery action could not finish.";
}
function sameView(a: ViewBinding, b: ViewBinding): boolean {
  return (
    a.formGeneration === b.formGeneration &&
    a.recoveryGeneration === b.recoveryGeneration
  );
}
function retainedCopyAtRisk(
  state: {
    unsaved: boolean;
    persistence: string;
    hasState: boolean;
    code: string;
  },
  protectedRaw: string | null | undefined,
  observedRaw: string | null | undefined,
): boolean {
  return (
    state.unsaved ||
    state.persistence === "unsaved-memory" ||
    (state.hasState && state.persistence === "unreadable") ||
    (state.code !== "ready" &&
      typeof protectedRaw === "string" &&
      protectedRaw !== observedRaw)
  );
}
function attachPanel(host: HTMLElement, title: string) {
  const panel = document.createElement("details");
  panel.className = "callout d1-recovery";
  panel.dataset.d1Recovery = "true";
  const heading = document.createElement("summary");
  heading.textContent = `Keep a copy: ${title}`;
  panel.append(heading);
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.dataset.d1Status = "true";
  panel.append(status);
  const help = document.createElement("p");
  help.className = "note";
  help.textContent =
    "Backups contain private text. Keep them somewhere safe. A record backup includes validated tool records, including a failed-write draft; it does not include every unsubmitted field on this page. Save that form through the tool first. Downloads are requested on this device.";
  panel.append(help);
  const buttons = document.createElement("div");
  buttons.className = "btn-row";
  panel.append(buttons);
  const recovery = document.createElement("div");
  recovery.className = "btn-row";
  panel.append(recovery);
  const label = document.createElement("label");
  label.className = "note";
  const discard = document.createElement("input");
  discard.type = "checkbox";
  discard.dataset.d1Discard = "true";
  label.append(
    discard,
    document.createTextNode(
      " I allow the reviewed recovery action to discard current unsaved memory and unsubmitted fields. Keep a backup first if needed.",
    ),
  );
  panel.append(label);
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.setAttribute("aria-label", `Choose a ${title} JSON backup`);
  panel.append(file);
  const description = document.createElement("p");
  description.dataset.d1Preview = "true";
  panel.append(description);
  const action = document.createElement("div");
  action.className = "btn-row";
  panel.append(action);
  const result = document.createElement("p");
  result.setAttribute("role", "status");
  result.setAttribute("aria-live", "polite");
  result.dataset.d1Result = "true";
  panel.append(result);
  function button(
    parent: HTMLElement,
    id: string,
    name: string,
    callback: () => void,
  ): ActionButton {
    const el = document.createElement("button") as ActionButton;
    el.type = "button";
    el.className = "btn btn-ghost btn-small";
    el.dataset.d1Action = id;
    el.textContent = name;
    el.addEventListener("click", callback);
    parent.append(el);
    return el;
  }
  host.append(panel);
  return {
    panel,
    status,
    buttons,
    recovery,
    discard,
    file,
    description,
    action,
    result,
    button,
  };
}

/** Own the chosen File/read bytes and revoke all older reads before starting another. */
function fileReader(view: D1ViewTracker, invalidate: () => void) {
  let epoch = 0,
    disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function revoke() {
    epoch++;
    invalidate();
  }
  function current(token: number, captured: Epochs) {
    return !disposed && token === epoch && sameView(captured, view.snapshot());
  }
  return {
    revoke,
    token: () => epoch,
    current,
    async read(
      file: File,
      limit: number,
    ): Promise<{ bytes: Uint8Array; token: number; view: Epochs } | null> {
      const token = epoch,
        captured = view.snapshot();
      if (
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        file.size > limit
      ) {
        throw Error(
          `Choose a complete backup no larger than ${limit.toLocaleString("en-US")} bytes.`,
        );
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const owned = await Promise.race([
          file.arrayBuffer(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  Error(
                    "Reading this file timed out. Choose it again to make a new preview.",
                  ),
                ),
              D1_LIMITS.fileReadTimeoutMs,
            );
            timers.add(timer);
          }),
        ]);
        if (!current(token, captured)) return null;
        if (!(owned instanceof ArrayBuffer) || owned.byteLength > limit)
          throw Error("The actual file bytes exceed this backup limit.");
        // Native File bytes are detached into our own bounded copy before parsing.
        return { bytes: new Uint8Array(owned.slice(0)), token, view: captured };
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
          timers.delete(timer);
        }
      }
    },
    dispose() {
      disposed = true;
      revoke();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}

function askDiscard(needed: boolean, allowed: boolean): void {
  if (needed && !allowed)
    throw Error(
      "Current unsaved work is outside this replacement. Keep a copy, then explicitly allow discarding it before previewing recovery.",
    );
}
function requestRaw(
  key: Parameters<typeof d1RawRecovery>[0],
  copy: "protected" | "observed",
  raw: string | null | undefined,
) {
  if (raw === undefined)
    throw Error(
      "The browser did not expose this saved copy. No raw copy can be generated.",
    );
  if (raw === null)
    throw Error(
      "This saved key is absent; there are no saved bytes in this copy.",
    );
  download(
    `charitology-${key}-${copy}-raw.json`,
    d1RawRecovery(key, copy, raw),
    "application/json",
  );
}

export function mountD1RecoveryControls<T>(
  options: D1RecoveryControlsOptions<T>,
): D1RecoveryControls {
  const { host, session, view } = options;
  assertD1ControlBinding(session as D1ToolSession<unknown>, view);
  const key = session.snapshot().key;
  const ui = attachPanel(host, titles[key] ?? key);
  let disposed = false,
    busy = false;
  let restore: D1RestorePreview<T> | null = null,
    clear: D1ClearPreview<T> | null = null;
  const resetPreview = () => {
    restore = null;
    clear = null;
    ui.description.textContent = "";
    apply.hidden = true;
    remove.hidden = true;
  };
  const reader = fileReader(view, resetPreview);
  const say = (text: string) => {
    if (!disposed) {
      ui.result.textContent = text;
      ui.panel.open = true;
    }
  };
  function changedRecovery() {
    reader.revoke();
    view.changedRecovery();
  }
  function isCurrent(captured: Epochs) {
    return !disposed && sameView(captured, view.snapshot());
  }
  async function run(action: () => Promise<void>) {
    if (disposed || busy) return;
    busy = true;
    refresh();
    try {
      await action();
    } catch (error) {
      say(textError(error));
    } finally {
      busy = false;
      refresh();
    }
  }
  const backup = ui.button(
    ui.buttons,
    "backup",
    "Download validated record backup",
    () => {
      void run(async () => {
        const raw = await session.backup();
        if (disposed) return;
        download(`charitology-${key}-backup.json`, raw, "application/json");
        say(
          "A complete validated record backup was generated and its download requested. Unsubmitted fields are outside this backup.",
        );
      });
    },
  );
  const protectedCopy = ui.button(
    ui.buttons,
    "protected",
    "Download original protected saved copy",
    () => {
      try {
        requestRaw(key, "protected", session.protectedRawCopy());
        say(
          "The original protected saved string was wrapped losslessly and its download requested. It is recovery material, not an automatically restorable draft.",
        );
      } catch (error) {
        say(textError(error));
      }
    },
  );
  const observedCopy = ui.button(
    ui.buttons,
    "observed",
    "Download latest observed saved copy",
    () => {
      try {
        requestRaw(key, "observed", session.observedRawCopy());
        say(
          "The latest observed saved string was wrapped losslessly and its download requested. It can differ from the original protected copy.",
        );
      } catch (error) {
        say(textError(error));
      }
    },
  );
  const retry = ui.button(
    ui.recovery,
    "retry",
    "Retry the exact failed save or removal",
    () => {
      changedRecovery();
      const captured = view.snapshot();
      void run(async () => {
        const next = await session.retryPersist();
        if (!isCurrent(captured)) return;
        say(
          next.unsaved
            ? next.message
            : "The retained operation is saved. This does not save newer unsubmitted fields.",
        );
      });
    },
  );
  const reload = ui.button(
    ui.recovery,
    "reload",
    "Reload the observed saved version",
    () => {
      const allow = ui.discard.checked;
      try {
        askDiscard(
          session.snapshot().unsaved || view.snapshot().hasUnsubmittedForm,
          allow,
        );
      } catch (error) {
        say(textError(error));
        return;
      }
      changedRecovery();
      const captured = view.snapshot();
      void run(async () => {
        const next = await session.reload({ discardUnsaved: allow });
        if (!isCurrent(captured)) return;
        if (next.code === "ready" && !next.unsaved) {
          view.discardedForm();
          location.reload();
        } else say(next.message);
      });
    },
  );
  const undo = ui.button(
    ui.recovery,
    "undo",
    "Undo the last recovery change",
    () => {
      const allow = ui.discard.checked;
      try {
        askDiscard(
          session.snapshot().unsaved || view.snapshot().hasUnsubmittedForm,
          allow,
        );
      } catch (error) {
        say(textError(error));
        return;
      }
      changedRecovery();
      const captured = view.snapshot();
      void run(async () => {
        const next = await session.undo({ discardUnsaved: allow });
        if (!isCurrent(captured)) return;
        if (next.code === "ready" && !next.unsaved) {
          view.discardedForm();
          location.reload();
        } else say(next.message);
      });
    },
  );
  const previewRemove = ui.button(
    ui.recovery,
    "preview-remove",
    "Preview removing only this saved key",
    () => {
      const allow = ui.discard.checked;
      changedRecovery();
      const captured = view.snapshot(),
        token = reader.token();
      void run(async () => {
        const preview = await session.previewRemove({ discardUnsaved: allow });
        if (!reader.current(token, captured)) return;
        clear = preview;
        ui.description.textContent = `Removal of charitology.${key} is previewed. No saved bytes have changed. Keep any needed record and raw copies first.`;
        remove.hidden = false;
        ui.panel.open = true;
      });
    },
  );
  const apply = ui.button(
    ui.action,
    "apply-restore",
    "Replace only this key with the previewed record and reload",
    () => {
      const preview = restore;
      if (!preview || busy || disposed) return;
      const captured = view.snapshot();
      reader.revoke();
      void run(async () => {
        const next = await session.restore(preview);
        if (!isCurrent(captured)) return;
        if (next.code === "ready" && !next.unsaved) {
          view.discardedForm();
          location.reload();
        } else say(next.message);
      });
    },
  );
  apply.hidden = true;
  const remove = ui.button(
    ui.action,
    "apply-remove",
    "Confirm removal of only this saved key and reload",
    () => {
      const preview = clear;
      if (!preview || busy || disposed) return;
      const captured = view.snapshot();
      reader.revoke();
      void run(async () => {
        const next = await session.remove(preview);
        if (!isCurrent(captured)) return;
        if (next.code === "ready" && !next.unsaved) {
          view.discardedForm();
          location.reload();
        } else say(next.message);
      });
    },
  );
  remove.hidden = true;
  function refresh() {
    if (disposed) return;
    const state = session.snapshot(),
      currentView = view.snapshot();
    if (
      (restore &&
        (restore.expectedGeneration !== state.generation ||
          !sameView(restore, currentView))) ||
      (clear &&
        (clear.expectedGeneration !== state.generation ||
          !sameView(clear, currentView)))
    )
      reader.revoke();
    ui.status.textContent = `${state.message} ${state.unsaved ? "The validated current record is only in memory." : state.persistence === "absent" ? "This key has no persisted record yet." : ""}${currentView.hasUnsubmittedForm ? " Unsubmitted fields remain on this page." : ""}`;
    if (state.code !== "ready" && state.code !== "unsupported")
      ui.panel.open = true;
    backup.disabled = busy || !state.hasState;
    protectedCopy.disabled = session.protectedRawCopy() == null;
    observedCopy.disabled = session.observedRawCopy() == null;
    retry.disabled = busy || !state.canRetryPersist;
    reload.disabled = busy;
    undo.disabled = busy || !state.hasUndo;
    previewRemove.disabled = busy || !state.canRecover;
    apply.disabled = busy || !state.canRecover;
    remove.disabled = busy || !state.canRecover;
  }
  const fileChange = () => {
    // Revoke A before looking at B, including an empty/invalid choice.
    changedRecovery();
    const selected = ui.file.files?.[0];
    ui.file.value = "";
    const allow = ui.discard.checked,
      token = reader.token(),
      captured = view.snapshot();
    if (!selected) {
      refresh();
      return;
    }
    ui.description.textContent =
      "Reading the chosen file. Nothing has been replaced.";
    void (async () => {
      try {
        const read = await reader.read(
          selected,
          D1_LIMITS.individualBackupBytes,
        );
        if (!read || !reader.current(token, captured)) return;
        const preview = await session.previewRestore(read.bytes, {
          discardUnsaved: allow,
        });
        if (!reader.current(read.token, read.view)) return;
        restore = preview;
        ui.description.textContent = `A valid ${titles[key] ?? key} record is previewed. Its complete key is charitology.${key}. Nothing has been replaced. The separate confirmation below replaces only that saved key.`;
        apply.hidden = false;
        ui.panel.open = true;
        refresh();
      } catch (error) {
        if (reader.current(token, captured)) {
          reader.revoke();
          say(textError(error));
          refresh();
        }
      }
    })();
  };
  const discardChanged = () => {
    changedRecovery();
    refresh();
  };
  const storageChanged = (event: StorageEvent) => {
    if (event.key === null || event.key === `charitology.${key}`) {
      session.noticeExternalChange();
      changedRecovery();
      refresh();
    }
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (
      !disposed &&
      (retainedCopyAtRisk(
        session.snapshot(),
        session.protectedRawCopy(),
        session.observedRawCopy(),
      ) ||
        view.snapshot().hasUnsubmittedForm)
    ) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  ui.file.addEventListener("change", fileChange);
  ui.discard.addEventListener("change", discardChanged);
  window.addEventListener("storage", storageChanged);
  window.addEventListener("beforeunload", beforeUnload);
  refresh();
  return Object.freeze({
    refresh,
    noteFileChoice() {
      if (!disposed) {
        changedRecovery();
        refresh();
      }
    },
    noteViewMutation() {
      if (!disposed) {
        ui.discard.checked = false;
        reader.revoke();
        refresh();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reader.dispose();
      try {
        view.changedRecovery();
      } catch {
        /* The owner may have disposed its tracker first. */
      }
      ui.file.removeEventListener("change", fileChange);
      ui.discard.removeEventListener("change", discardChanged);
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("beforeunload", beforeUnload);
      ui.panel.remove();
    },
  });
}

export function mountD1GrantRecoveryControls(
  options: D1GrantRecoveryControlsOptions,
): D1RecoveryControls {
  const { host, editor, coordinator: grant, view } = options;
  assertD1ControlBinding(grant, view);
  if (host === editor || editor.contains(host))
    throw Error(
      "Grant recovery controls must stay outside the ordinary grant editor.",
    );
  const ui = attachPanel(host, "Complete grant workspace");
  let disposed = false,
    busy = false,
    plan: D1GrantRestorePlan | null = null;
  let planKind: "bundle" | "individual" | "remove" = "bundle";
  let step: D1GrantRestoreStep | D1GrantRemoveStep | null = null;
  const originalInert = editor.inert;
  const resetPreview = () => {
    plan = null;
    step = null;
    ui.description.textContent = "";
    apply.hidden = true;
    next.hidden = true;
  };
  const reader = fileReader(view, resetPreview);
  const rawButtons: {
    key: D1GrantKey;
    kind: "protected" | "observed";
    button: ActionButton;
  }[] = [];
  const say = (text: string) => {
    if (!disposed) {
      ui.result.textContent = text;
      ui.panel.open = true;
    }
  };
  function changedRecovery() {
    reader.revoke();
    view.changedRecovery();
  }
  function isCurrent(captured: Epochs) {
    return !disposed && sameView(captured, view.snapshot());
  }
  async function run(action: () => Promise<void>) {
    if (disposed || busy) return;
    busy = true;
    refresh();
    try {
      await action();
    } catch (error) {
      say(textError(error));
    } finally {
      busy = false;
      refresh();
    }
  }
  const bundle = ui.button(
    ui.buttons,
    "bundle",
    "Download current three-member grant bundle",
    () => {
      void run(async () => {
        const raw = await grant.bundle(new Date().toISOString());
        if (disposed) return;
        download("charitology-grant-workspace.json", raw, "application/json");
        say(
          "The current valid working vector was generated as a three-member bundle and its download requested. Failed-memory values/removals are labeled unsaved-memory. Unattempted desired source members and open unsubmitted fields are outside this current-vector bundle.",
        );
      });
    },
  );
  const desiredBundle = ui.button(
    ui.buttons,
    "desired-bundle",
    "Download complete intended grant vector, including unattempted members",
    () => {
      void run(async () => {
        const raw = await grant.desiredBundle(new Date().toISOString());
        if (disposed) return;
        download(
          "charitology-grant-intended-workspace.json",
          raw,
          "application/json",
        );
        say(
          "The complete intended vector was generated and its download requested, including unattempted source members. Unsaved-memory labels identify pending differences. Exporting it authorizes no later restore step. Keep raw saved copies separately.",
        );
      });
    },
  );
  for (const key of grantOrder) {
    ui.button(
      ui.buttons,
      `individual-${key}`,
      `Download ${titles[key]} record`,
      () => {
        void run(async () => {
          const raw = await grant.individual(key, new Date().toISOString());
          if (disposed) return;
          download(`charitology-${key}-backup.json`, raw, "application/json");
          say(
            "A single-member record download was requested. This is not the complete three-key workspace.",
          );
        });
      },
    );
    for (const kind of ["protected", "observed"] as const) {
      rawButtons.push({
        key,
        kind,
        button: ui.button(
          ui.buttons,
          `${kind}-${key}`,
          `${titles[key]}: ${kind === "protected" ? "original protected" : "latest observed"} raw copy`,
          () => {
            try {
              requestRaw(
                key,
                kind,
                kind === "protected"
                  ? grant.protectedRawCopy(key)
                  : grant.observedRawCopy(key),
              );
              say(
                "The exact saved string was wrapped losslessly and its download requested. It grants no restore authority.",
              );
            } catch (error) {
              say(textError(error));
            }
          },
        ),
      });
    }
  }
  const retry = ui.button(
    ui.recovery,
    "retry",
    "Retry the exact pending grant operation",
    () => {
      const state = grant.snapshot(),
        captured = view.snapshot();
      if (state.pending?.origin === "save") {
        changedRecovery();
        const retryView = view.snapshot();
        void run(async () => {
          const result = await grant.retryPending();
          if (isCurrent(retryView)) say(result.snapshot.message);
        });
      } else if (plan) {
        const owned = plan;
        step = null;
        apply.hidden = true;
        void run(async () => {
          const result = await grant.retryStep(owned);
          if (!isCurrent(captured)) return;
          plan = result.plan;
          say(
            result.complete && planKind === "bundle"
              ? "Every member of this source bundle now matches after a fresh locked comparison."
              : result.snapshot.message,
          );
          showNext();
          if (
            result.complete &&
            planKind === "bundle" &&
            !result.snapshot.pending &&
            result.snapshot.consistency === "consistent"
          ) {
            view.discardedForm();
            location.reload();
          } else if (
            planKind !== "bundle" &&
            result.outcome !== "unsaved" &&
            !result.snapshot.pending &&
            result.snapshot.consistency === "consistent"
          ) {
            view.discardedForm();
            location.reload();
          }
        });
      } else
        say(
          "Select the source bundle again to review current members. No hidden recovery journal is available after reload.",
        );
    },
  );
  const reload = ui.button(
    ui.recovery,
    "reload",
    "Reload all observed grant members",
    () => {
      const state = grant.snapshot(),
        allow = ui.discard.checked;
      try {
        askDiscard(
          Boolean(state.pending) ||
            Object.values(state.members).some((s) => s.unsaved) ||
            view.snapshot().hasUnsubmittedForm,
          allow,
        );
      } catch (error) {
        say(textError(error));
        return;
      }
      changedRecovery();
      const captured = view.snapshot();
      void run(async () => {
        const result = await grant.reload({ discardUnsaved: allow });
        if (!isCurrent(captured)) return;
        if (result.consistency === "consistent" && !result.pending) {
          view.discardedForm();
          location.reload();
        } else say(result.message);
      });
    },
  );
  const modeLabel = document.createElement("label");
  modeLabel.textContent = "File to review: ";
  const mode = document.createElement("select");
  mode.dataset.d1FileKind = "true";
  for (const [value, name] of [
    ["bundle", "Complete grant bundle"],
    ...grantOrder.map((key) => [key, `${titles[key]} individual backup`]),
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = name;
    mode.append(option);
  }
  mode.value = "bundle";
  modeLabel.append(mode);
  ui.panel.insertBefore(modeLabel, ui.file);
  const removeLabel = document.createElement("label");
  removeLabel.textContent = "Member to remove: ";
  const member = document.createElement("select");
  member.dataset.d1Member = "true";
  for (const key of grantOrder) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = titles[key];
    member.append(option);
  }
  member.value = "grant-draft";
  removeLabel.append(member);
  ui.panel.append(removeLabel);
  const previewRemove = ui.button(
    ui.recovery,
    "preview-remove",
    "Preview removing the selected grant key only",
    () => {
      const key = member.value as D1GrantKey,
        allow = ui.discard.checked;
      if (!grantOrder.includes(key)) return;
      changedRecovery();
      const captured = view.snapshot(),
        token = reader.token();
      void run(async () => {
        const preview = await grant.previewRemove(key, {
          discardUnsaved: allow,
        });
        if (!reader.current(token, captured)) return;
        step = preview;
        planKind = "remove";
        ui.description.textContent = `Removal of charitology.${key} is previewed. Other members will not be removed. Nothing has changed.`;
        apply.textContent = `Confirm removal of ${titles[key]} only and reload`;
        apply.hidden = false;
      });
    },
  );
  function showNext() {
    if (!plan || disposed) {
      next.hidden = true;
      return;
    }
    const upcoming = plan.steps.some(
      (item) => item.state === "failed" || item.state === "changed",
    )
      ? undefined
      : plan.steps.find((item) => item.state === "ready");
    next.hidden = !upcoming;
    if (upcoming) {
      next.dataset.d1Key = upcoming.key;
      next.textContent = `Preview next member: ${titles[upcoming.key]}`;
    }
    ui.description.textContent = plan.steps
      .map((item) => `${titles[item.key]}: ${item.state}. ${item.message}`)
      .join(" ");
  }
  const next = ui.button(
    ui.action,
    "preview-step",
    "Preview the next grant member",
    () => {
      if (!plan || busy) return;
      const key = next.dataset.d1Key as D1GrantKey,
        owned = plan;
      if (!grantOrder.includes(key)) return;
      const captured = view.snapshot(),
        token = reader.token();
      step = null;
      apply.hidden = true;
      void run(async () => {
        const preview = await grant.previewStep(owned, key);
        if (!reader.current(token, captured)) return;
        step = preview;
        apply.textContent = `Confirm replacement of ${titles[key]} only`;
        apply.hidden = false;
        ui.description.textContent = `Only ${titles[key]} is previewed for the next explicit step. The complete source was checked; other source members will still require separate previews and confirmations. No atomic restore or rollback is promised.`;
      });
    },
  );
  next.hidden = true;
  const apply = ui.button(
    ui.action,
    "apply-step",
    "Confirm the previewed grant member only",
    () => {
      const preview = step;
      if (!preview || busy) return;
      const captured = view.snapshot();
      step = null;
      apply.hidden = true;
      void run(async () => {
        const result =
          preview.kind === "remove"
            ? await grant.remove(preview as D1GrantRemoveStep)
            : await grant.applyStep(preview as D1GrantRestoreStep);
        if (!isCurrent(captured)) return;
        plan = result.plan;
        if (result.complete && planKind === "bundle") {
          say(
            "All three desired members match after a fresh locked comparison. The complete source bundle is restored.",
          );
          if (
            !result.snapshot.pending &&
            result.snapshot.consistency === "consistent"
          ) {
            view.discardedForm();
            location.reload();
          }
        } else {
          say(
            `${result.snapshot.message} ${planKind === "bundle" ? "This is one explicit member step; the whole restore is incomplete until the final comparison." : "Only the selected member was reviewed; this is not a complete-bundle restoration."}`,
          );
          if (planKind === "bundle") showNext();
          else next.hidden = true;
          if (
            planKind !== "bundle" &&
            result.outcome !== "unsaved" &&
            !result.snapshot.pending &&
            result.snapshot.consistency === "consistent"
          ) {
            view.discardedForm();
            location.reload();
          }
        }
      });
    },
  );
  apply.hidden = true;
  function refresh() {
    if (disposed) return;
    const state = grant.snapshot(),
      currentView = view.snapshot();
    ui.status.textContent = `${state.message} Consistency: ${state.consistency}.${currentView.hasUnsubmittedForm ? " Unsubmitted fields remain outside the record backup." : ""}`;
    editor.inert =
      originalInert ||
      busy ||
      Boolean(step) ||
      Boolean(plan?.steps.some((item) => item.state !== "applied")) ||
      state.partial ||
      Boolean(state.pending) ||
      state.consistency === "inconsistent" ||
      state.consistency === "unreadable";
    if (state.consistency !== "consistent" || state.pending)
      ui.panel.open = true;
    bundle.disabled = busy || state.consistency === "unreadable";
    desiredBundle.disabled = busy || (!plan && !state.pending);
    retry.disabled = busy || !state.pending;
    reload.disabled = busy;
    previewRemove.disabled =
      busy || !Object.values(state.members).every((s) => s.canRecover);
    next.disabled = busy;
    apply.disabled = busy;
    for (const raw of rawButtons)
      raw.button.disabled =
        (raw.kind === "protected"
          ? grant.protectedRawCopy(raw.key)
          : grant.observedRawCopy(raw.key)) == null;
  }
  const fileChange = () => {
    changedRecovery();
    const selected = ui.file.files?.[0];
    ui.file.value = "";
    const fileKind = mode.value,
      allow = ui.discard.checked,
      token = reader.token(),
      captured = view.snapshot();
    if (!selected) {
      refresh();
      return;
    }
    ui.description.textContent =
      "Reading the selected grant source. No member has changed.";
    void (async () => {
      try {
        const read = await reader.read(
          selected,
          fileKind === "bundle"
            ? D1_LIMITS.grantBundleBytes
            : D1_LIMITS.individualBackupBytes,
        );
        if (!read || !reader.current(token, captured)) return;
        if (fileKind === "bundle") {
          const owned = await grant.previewBundle(read.bytes, {
            discardUnsaved: allow,
          });
          if (!reader.current(token, captured)) return;
          plan = owned;
          planKind = "bundle";
          showNext();
          say(
            "A complete source bundle is previewed. Review and confirm each member separately in library, weights, draft order. Nothing has changed.",
          );
        } else if (grantOrder.includes(fileKind as D1GrantKey)) {
          const owned = await grant.previewIndividual(
            fileKind as D1GrantKey,
            read.bytes,
            { discardUnsaved: allow },
          );
          if (!reader.current(token, captured)) return;
          step = owned;
          planKind = "individual";
          apply.textContent = `Confirm replacement of ${titles[fileKind]} only and reload`;
          apply.hidden = false;
          ui.description.textContent =
            "One member is previewed against the current other members and their relationships. This cannot restore or establish a complete source bundle.";
        } else throw Error("Choose one supported grant source type.");
        refresh();
      } catch (error) {
        if (reader.current(token, captured)) {
          reader.revoke();
          say(textError(error));
          refresh();
        }
      }
    })();
  };
  const selectionChanged = () => {
    changedRecovery();
    refresh();
  };
  const storageChanged = (event: StorageEvent) => {
    const key =
      event.key === null
        ? null
        : grantOrder.find((key) => event.key === `charitology.${key}`);
    if (key === undefined) return;
    grant.noticeExternalChange(key);
    changedRecovery();
    refresh();
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    const state = grant.snapshot();
    if (
      !disposed &&
      (state.pending ||
        grantOrder.some((key) =>
          retainedCopyAtRisk(
            state.members[key],
            grant.protectedRawCopy(key),
            grant.observedRawCopy(key),
          ),
        ) ||
        view.snapshot().hasUnsubmittedForm)
    ) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  ui.file.addEventListener("change", fileChange);
  ui.discard.addEventListener("change", selectionChanged);
  mode.addEventListener("change", selectionChanged);
  member.addEventListener("change", selectionChanged);
  window.addEventListener("storage", storageChanged);
  window.addEventListener("beforeunload", beforeUnload);
  refresh();
  return Object.freeze({
    refresh,
    noteFileChoice() {
      if (!disposed) {
        changedRecovery();
        refresh();
      }
    },
    noteViewMutation() {
      if (!disposed) {
        ui.discard.checked = false;
        reader.revoke();
        refresh();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reader.dispose();
      try {
        view.changedRecovery();
      } catch {
        /* Tracker may already have been disposed. */
      }
      ui.file.removeEventListener("change", fileChange);
      ui.discard.removeEventListener("change", selectionChanged);
      mode.removeEventListener("change", selectionChanged);
      member.removeEventListener("change", selectionChanged);
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("beforeunload", beforeUnload);
      editor.inert = originalInert;
      ui.panel.remove();
    },
  });
}
