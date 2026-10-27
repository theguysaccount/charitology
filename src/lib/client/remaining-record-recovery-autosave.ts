/** One coalesced local draft save. Raw controls remain owned by the caller. */
import {
  assertRemainingRecordControlBinding,
  REMAINING_RECORD_LIMITS,
  type RRResearchKey,
  type RRSession,
  type RRViewTracker,
  type RRViewToken,
  type RRFormId,
  type RRValueMap,
  type RRReadonly,
  type RRWriteResult,
} from "./remaining-record-recovery";
import { remainingRecordFormFields } from "./remaining-record-recovery-schemas";

export type RRAutosaveKey =
  RRResearchKey | "charitology-manuscript-v1" | "charitology-country-notes-v1";
export interface RRDraftAutosaver<K extends RRAutosaveKey> {
  noteInput(): void;
  flush(): Promise<RRWriteResult<K> | null>;
  cancel(): void;
  hasPending(): boolean;
  dispose(): void;
}
export interface RRDraftAutosaveOptions<K extends RRAutosaveKey> {
  session: RRSession<K>;
  view: RRViewTracker;
  form: RRFormId;
  readCandidate: () => RRValueMap[K] | RRReadonly<RRValueMap[K]>;
  onResult: (result: RRWriteResult<K>) => void;
  onError: (error: unknown) => void;
}
export function createRemainingRecordDraftAutosaver<K extends RRAutosaveKey>(
  options: RRDraftAutosaveOptions<K>,
): RRDraftAutosaver<K> {
  const { session, view, form, readCandidate, onResult, onError } = options;
  assertRemainingRecordControlBinding(session, view);
  if (!(
    session.key.startsWith("charitology.research-program.") ||
    session.key === "charitology-manuscript-v1" ||
    session.key === "charitology-country-notes-v1"
  ))
    throw Error(
      "Autosave is limited to research, manuscript and country drafts.",
    );
  remainingRecordFormFields(session.key, form);
  let disposed = false;
  let request = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unresolved = 0;
  let scheduled: { id: number; token: RRViewToken } | null = null;
  type Request = {
    id: number;
    token: RRViewToken;
    promise: Promise<RRWriteResult<K> | null>;
  };
  let latest: Request | null = null;
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    scheduled = null;
  };
  const owned = (operation: { id: number; token: RRViewToken }) =>
    !disposed && operation.id === request && view.isCurrent(operation.token);
  const reportError = (
    error: unknown,
    operation: { id: number; token: RRViewToken },
  ) => {
    if (!owned(operation)) return;
    try {
      onError(error);
    } catch {
      /* A notification cannot alter persistence. */
    }
  };
  function submit(expected?: {
    id: number;
    token: RRViewToken;
  }): Promise<RRWriteResult<K> | null> {
    if (disposed) return Promise.resolve(null);
    clearTimer();
    // A navigation/external notice can change the view even before a caller's
    // explicit cancel. An older debounce must never read that newer editor.
    if (expected && !owned(expected)) return Promise.resolve(null);
    const operation = { id: ++request, token: view.capture() };
    let captured;
    try {
      // Read once, synchronously, with no held engine lock. A reentrant edit
      // invalidates this read before it can become a captured save.
      const candidate = readCandidate();
      if (!owned(operation)) return Promise.resolve(null);
      try {
        captured = session.captureSave(candidate, { form });
      } finally {
        // captureSave revokes older engine authority at synchronous entry,
        // including on admission refusal. Its new token owns any error notice.
        operation.token = view.capture();
      }
    } catch (error) {
      reportError(error, operation);
      return Promise.resolve(null);
    }
    if (!owned(operation)) return Promise.resolve(null);
    unresolved++;
    // Install the request before invoking/awaiting its save. The engine's final
    // guards alone determine persistence; callbacks run only after it settles.
    const entry: Request = { ...operation, promise: Promise.resolve(null) };
    latest = entry;
    const complete = async () => {
      try {
        const result = await session.saveCaptured(captured);
        if (owned(entry) && view.isCurrent(result.view)) {
          try {
            onResult(result);
          } catch {
            /* A saved result stays saved. */
          }
        }
        return result;
      } catch (error) {
        reportError(error, entry);
        return null;
      } finally {
        unresolved--;
        if (latest === entry) latest = null;
      }
    };
    entry.promise = complete();
    return entry.promise;
  }
  return Object.freeze({
    noteInput() {
      if (disposed) return;
      // The caller already marked the exact form dirty before notifying us.
      request++;
      clearTimer();
      scheduled = { id: request, token: view.capture() };
      timer = setTimeout(() => {
        const expected = scheduled;
        timer = null;
        scheduled = null;
        if (expected) void submit(expected);
      }, REMAINING_RECORD_LIMITS.autosaveDelayMs);
    },
    flush() {
      if (disposed) return Promise.resolve(null);
      if (timer !== null)
        return scheduled ? submit(scheduled) : Promise.resolve(null);
      if (latest && owned(latest)) return latest.promise;
      return submit();
    },
    cancel() {
      request++;
      clearTimer();
      latest = null;
      // A running engine operation is not claimed to have been rolled back.
      // Callers revoke their view before navigation/cancel replaces controls.
    },
    hasPending() {
      return timer !== null || unresolved > 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      request++;
      clearTimer();
      latest = null;
    },
  });
}
