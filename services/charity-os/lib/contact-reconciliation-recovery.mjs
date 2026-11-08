/** CRM immutable report recovery only. No clock, ID, authority or transaction. */
import { isProxy } from "node:util/types";
import { learningFreeze } from "./learning-transport.mjs";
import { ContactReconciliationReportError, inspectContactReconciliationRecovery,
  isContactReconciliationRecoveryFamily, contactReconciliationNativeReports,
  planRestoredContactReconciliationReportRow, contactReconciliationRestoreSummary } from "./contact-reconciliation-report.mjs";
import { restoreContactReconciliationReports as restoreStoredReports } from "./contact-reconciliation-store.mjs";

export { isContactReconciliationRecoveryFamily, contactReconciliationRestoreSummary };
export const restoredContactReconciliationReports = inspectContactReconciliationRecovery;
export const exportContactReconciliationReports = contactReconciliationNativeReports;

/** Pure destination metadata projection, used by the existing actual SQL
 * composite measurer. It supplies no role/member or pretend database client. */
export function planRestoredContactReconciliationReports(backup, destination) {
  const history = inspectContactReconciliationRecovery(backup);
  if (!history.present) return learningFreeze({ present: false, reports: [] });
  return learningFreeze({ present: true, reports: history.reports.map(row => planRestoredContactReconciliationReportRow(row, destination)) });
}

/** Caller passes its ACTUAL freshly verified member through this context.
 * Never manufacture an owner to satisfy a guard. The store always checks an
 * occupied reserved destination, including a CRM-free source; absence needs no
 * new domain clock (createdAtExact:null). Caller owns one outer transaction. */
export async function restoreContactReconciliationReports(c, backup, context) {
  const fail = () => { throw new ContactReconciliationReportError("contact_report_restore_context"); };
  if (!context || typeof context !== "object" || isProxy(context) || Array.isArray(context) || Object.getPrototypeOf(context) !== Object.prototype) fail();
  const keys = Reflect.ownKeys(context), expected = ["orgId", "member", "createdAtExact"];
  if (keys.length !== expected.length || !keys.every(k => typeof k === "string" && expected.includes(k))) fail();
  const values = {};
  for (const key of expected) {
    const d = Object.getOwnPropertyDescriptor(context, key); if (!d?.enumerable || !Object.hasOwn(d, "value")) fail(); values[key] = d.value;
  }
  return restoreStoredReports(c, { org: values.orgId, member: values.member, backup, createdAtExact: values.createdAtExact });
}
