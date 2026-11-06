// Trusted orchestration only. No imported DTO can manufacture an execution lease.
const CANCELLED = Symbol('model payload cancelled');
const leases = new WeakMap();
const coordinators = new WeakSet();
export function assertModelPayloadCoordinator(value) {
  if (!value || !coordinators.has(value)) throw new TypeError('An owned model payload coordinator is required.');
  return value;
}
export function createModelPayloadCoordinator() {
  let active = null, queued = null;
  const identity = Object.freeze({});
  const current = check => { try { return check() === true; } catch { return false; } };
  async function pump() {
    if (active || !queued) return;
    const entry = queued; queued = null;
    if (!current(entry.current)) { entry.resolve(CANCELLED); void pump(); return; }
    const lease = Object.freeze({});
    const owned = { entry, lease, children: new Set(), closing: false }; active = owned; leases.set(lease, identity);
    try { entry.resolve(await entry.work(lease)); }
    catch (error) { entry.reject(error); }
    finally {
      owned.closing = true;
      // A nested worker may cancel delivery before its native SHA actually settles.
      // Retain the lease until every registered physical child has completed.
      while (owned.children.size) await Promise.allSettled([...owned.children]);
      leases.delete(lease); active = null;
      // Only settlement of the actual work releases the slot. Delivery cancellation is separate.
      void pump();
    }
  }
  const coordinator = Object.freeze({
    run(check, work, lease = undefined) {
      if (typeof check !== 'function' || typeof work !== 'function') return Promise.reject(new TypeError('Invalid model payload operation.'));
      if (lease !== undefined) {
        if (!lease || leases.get(lease) !== identity || active?.lease !== lease || active.closing)
          return Promise.reject(new TypeError('The model payload lease is no longer active.'));
        if (!current(check) || !current(active.entry.current)) return Promise.resolve(CANCELLED);
        const owned = active;
        const promise = Promise.resolve().then(() => {
          if (leases.get(lease) !== identity || active !== owned) throw new TypeError('The model payload lease is no longer active.');
          if (owned.closing || !current(check) || !current(active.entry.current)) return CANCELLED;
          return work(lease);
        });
        owned.children.add(promise);
        void promise.then(() => owned.children.delete(promise), () => owned.children.delete(promise));
        return promise;
      }
      return new Promise((resolve, reject) => {
        if (!current(check)) { resolve(CANCELLED); return; }
        if (queued) { queued.resolve(CANCELLED); queued = null; }
        queued = { current: check, work, resolve, reject }; void pump();
      });
    },
    isCancelled: value => value === CANCELLED,
    snapshot: () => Object.freeze({ busy: active !== null, queued: queued !== null }),
  });
  coordinators.add(coordinator); return coordinator;
}
