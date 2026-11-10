const part = encodeURIComponent;
const headings = {
  unconfigured: "Site orientation is available to set up",
  pending: "Awaiting a second staff review",
  active: "Site orientation required",
  "review-needed": "Site orientation needs review",
  verified: "Orientation verified for this shift",
  unknown: "Current completion is unknown",
  expired: "Orientation coverage has expired",
  withdrawn: "Completion was withdrawn in the register",
};
const validRevision = (value) => Number.isSafeInteger(value) && value > 0;
const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export async function staffOrientationEditor({
  orgId, shiftId, participationId = null, request, node, button, field,
  current, onDirty,
}) {
  const base = `/api/orgs/${part(orgId)}/volunteer-orientation/${part(shiftId)}`;
  const url = participationId ? `${base}/places/${part(participationId)}` : base;
  const status = node("p", { class: "form-status", role: "status" });
  const content = node("div", { class: "stack" });
  let busy = false;
  const message = (text, problem = false) => {
    status.textContent = text;
    status.className = problem ? "form-status error" : "form-status";
  };

  function view(result) {
    const item = participationId ? result?.eligibility : result?.orientation;
    if (result?.ok !== true || item?.version !== 1 || item.shiftId !== shiftId ||
        !Object.hasOwn(headings, item.state) ||
        (participationId && item.participationId !== participationId))
      throw new Error("The current orientation review could not be verified.");
    return item;
  }

  async function perform(operation, saved = false) {
    if (busy || !current()) return;
    busy = true;
    try {
      const result = view(await operation());
      if (!current()) return;
      render(result);
      onDirty(false);
      message(saved ? "Orientation review saved." : "");
    } catch (error) {
      if (current()) message(error.message || "Reload the saved orientation review.", true);
    } finally { busy = false; }
  }
  const reload = () => perform(() => request(url));
  function checkbox(label) {
    const input = node("input", { type: "checkbox" });
    input.addEventListener("change", () => onDirty(true));
    return { input, control: node("label", { class: "check-row" }, input, label) };
  }

  function render(item) {
    content.replaceChildren(node("h3", {}, headings[item.state]));
    if (!participationId) {
      content.append(node("p", { class: "fine" },
        "Use the organization’s approved site orientation register. Each confirmed volunteer needs a current record that covers the whole shift."));
      const acknowledge = checkbox(item.canApprove
        ? "I independently reviewed the organization’s authorized site orientation register and this shift."
        : "I checked the authorized register and propose site orientation for this shift.");
      if (item.canApprove || item.canPropose) {
        const approve = item.canApprove;
        const body = () => ({
          policyRevision: item.policyRevision,
          ...(approve ? {} : { sourceRevision: item.sourceRevision, termsSha256: item.termsSha256 }),
          registerAcknowledged: true,
        });
        content.append(acknowledge.control, button(approve ? "Approve requirement" : "Propose requirement", () => {
          if (!acknowledge.input.checked) { message("Acknowledge the register review first.", true); return; }
          return perform(() => request(`${base}/${approve ? "approve" : "propose"}`, {
            method: "POST", body: body(),
          }), true);
        }, "primary"));
      }
      return;
    }

    content.append(node("p", { class: "fine" },
      "Use only the status and dates from the organization’s orientation register. Keep course documents and personal details in that register."));
    if (!item.canRecord) return;
    const state = node("select", {},
      node("option", { value: "" }, "Select the recorded result"),
      node("option", { value: "complete" }, "Complete"),
      node("option", { value: "unknown" }, "Unknown"),
      node("option", { value: "withdrawn" }, "Withdrawn"));
    const revision = node("input", { type: "number", min: 1, step: 1 });
    const completed = node("input", { type: "date" });
    const validThrough = node("input", { type: "date" });
    const dates = node("div", { class: "stack", hidden: true },
      field("Completion date", completed), field("Valid through", validThrough));
    for (const input of [state, revision, completed, validThrough])
      input.addEventListener("change", () => onDirty(true));
    state.addEventListener("change", () => { dates.hidden = state.value !== "complete"; });
    const acknowledge = checkbox("I checked this exact place against the organization’s authorized register.");
    content.append(field("Register result", state), field("Revision shown in the register", revision,
      item.registerRevision ? `Last recorded source revision: ${item.registerRevision}.` : "Use the register’s version for this entry."),
      dates, acknowledge.control, button("Save register result", () => {
        const complete = state.value === "complete", registerRevision = Number(revision.value);
        if (!["complete", "unknown", "withdrawn"].includes(state.value) ||
            !validRevision(registerRevision) || !acknowledge.input.checked ||
            (complete && (!date(completed.value) || !date(validThrough.value)))) {
          message("Enter the exact register result, revision and any required dates.", true);
          return;
        }
        return perform(() => request(url, {
          method: "POST", body: {
            policyRevision: item.policyRevision, participationRevision: item.participationRevision,
            evidenceRevision: item.evidenceRevision, registerRevision, state: state.value,
            completedOn: complete ? completed.value : null,
            validThrough: complete ? validThrough.value : null, checkedRegister: true,
          },
        }), true);
      }, "primary"));
  }
  render(view(await request(url)));
  return node("div", { class: "stack" }, content, status,
    button("Reload saved orientation review", reload, "subtle"));
}
