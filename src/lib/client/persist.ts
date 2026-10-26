// Whether this browser will keep what a tool saves. store.ts never throws,
// so tools call this to tell people, up front, when their work won't
// survive a reload (private windows, blocked storage, a full quota).

import { load, remove, save } from './store';

export function canPersist(): boolean {
  const key = 'probe';
  const stamp = Date.now();
  const ok = save(key, stamp) && load<number>(key, 0) === stamp;
  remove(key);
  return ok;
}
