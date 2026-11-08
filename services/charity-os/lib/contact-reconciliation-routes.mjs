/** Main handler owns sign-in and CSRF. This boundary owns bounded transport,
 * fresh permission preflight and the real tenant transaction classification. */
import { fail, hash, json } from './security.mjs';
import { classifyContactReconciliationRequest, contactRequestId,
  readContactReconciliationBody, validateContactCommitRequest } from './contact-reconciliation-http.mjs';
import { currentContactReconciliationMember } from './contact-reconciliation-context.mjs';
import { inspectContactReconciliation, previewContactReconciliation,
  previewContactReconciliationReversal, acceptedContactReconciliationCommand,
  commitContactReconciliation } from './contact-reconciliation-commands.mjs';
import { listContactReconciliationReports, readContactReconciliationReport } from './contact-reconciliation-store.mjs';

const okay = value => json({ ok: true, ...value });
export async function contactReconciliationRoutes({ request, url = new URL(request.url), db, session }) {
  const route = classifyContactReconciliationRequest(url.pathname, request.method, url.search);
  if (!route) return null;
  const { orgId: org, operation } = route;
  const read = operation === 'history' || operation === 'history-detail';
  if (read && (request.body !== null || request.headers.has('transfer-encoding') ||
      request.headers.has('content-length') && request.headers.get('content-length') !== '0'))
    fail(400, 'contact_reconciliation_body', 'Read contact history without a request body.');
  const user = contactRequestId(session.user.id);
  await db.limit('contact-reconciliation-' + (read ? 'read:' : 'write:') + hash(user), read ? 120 : 60, 3600);
  // A POST body is not allocated until actual current Contacts permission passes.
  if (!read) await db.tx(user, org, c => currentContactReconciliationMember(c, { org, session }), { readOnly: true });
  if (read) return okay(await db.tx(user, org, async c => {
    const { member } = await currentContactReconciliationMember(c, { org, session });
    return operation === 'history-detail'
      ? { report: await readContactReconciliationReport(c, { org, member, id: route.reportId }) }
      : await listContactReconciliationReports(c, { org, member, ...route.history });
  }, { readOnly: true }));
  const input = await readContactReconciliationBody(request);
  const args = { org, session, input };
  // A complete comparison holds the same organization lock as mutations while
  // PostgreSQL still enforces READ ONLY on every business query in this call.
  if (operation === 'inspect') return okay(await db.tx(user, org,
    c => inspectContactReconciliation(c, args), { lock: true, readOnly: true }));
  if (operation === 'preview' || operation === 'reverse-preview') return okay(await db.tx(user, org,
    c => operation === 'preview' ? previewContactReconciliation(c, args)
      : previewContactReconciliationReversal(c, args), { lock: true }));
  validateContactCommitRequest(input);
  const accepted = await db.tx(user, org, c => acceptedContactReconciliationCommand(c, args), { readOnly: true });
  if (accepted) return okay(accepted);
  try {
    return okay(await db.tx(user, org, c => commitContactReconciliation(c, args), { lock: true }));
  } catch (error) {
    // This is a read of an already accepted result, never another mutation.
    // A client must keep its exact body/key for deliberate Retry after failure.
    try {
      const saved = await db.tx(user, org, c => acceptedContactReconciliationCommand(c, args), { readOnly: true });
      if (saved) return okay(saved);
    } catch {}
    throw error;
  }
}
