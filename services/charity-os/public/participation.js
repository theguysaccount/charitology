const part = (value) => encodeURIComponent(String(value));
const states = {
  requested: "Awaiting a staff decision",
  waitlisted: "Waitlisted — no place reserved",
  confirmed: "Confirmation recorded",
  cancelled: "Participation cancelled",
};

export function commandIntent(makeKey = () => crypto.randomUUID()) {
  let pending = null;
  return {
    prepare(path, payload) {
      const canonical = JSON.stringify(payload);
      if (pending && (pending.path !== path || pending.canonical !== canonical))
        throw new Error(
          "The earlier response may have been interrupted. Refresh the saved participation before submitting a different change.",
        );
      if (!pending) pending = { path, canonical, key: makeKey() };
      return { ...payload, idempotencyKey: pending.key };
    },
    rejected(status) {
      if ([400, 401, 403, 404, 413, 422, 429].includes(status)) pending = null;
    },
    clear() {
      pending = null;
    },
  };
}
export function scheduleLabels(terms) {
  const zone = typeof terms?.timeZone === "string" ? terms.timeZone : null;
  const format = (value) => {
    if (!value || !zone || !Number.isFinite(Date.parse(value)))
      return "Not recorded";
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      }).format(new Date(value));
    } catch {
      return "Invalid schedule — review required";
    }
  };
  return {
    start: format(terms?.startAt),
    end: format(terms?.endAt),
    zone: zone || "Not recorded",
  };
}
export function targetChoices(value) {
  if (!Array.isArray(value) || value.length > 2000)
    throw new Error(
      "The permitted occurrence list exceeds the 2,000-record bound or could not be verified.",
    );
  return value;
}
export function consentInstant(value) {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (
    !match ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1] ||
    Number(match[2]) > 23 ||
    Number(match[3]) > 59 ||
    Number(match[4]) > 59 ||
    Number(match[6] || 0) > 23 ||
    Number(match[7] || 0) > 59
  )
    throw new Error("Use a real ISO consent instant with an explicit offset.");
  return new Date(value).toISOString();
}
function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
    else if (
      ["disabled", "required", "selected", "checked", "readOnly"].includes(key)
    )
      element[key] = Boolean(value);
    else element.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity))
    if (child !== null && child !== undefined)
      element.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return element;
}
function button(text, fn, kind = "subtle", attrs = {}) {
  return node(
    "button",
    { type: "button", class: `button ${kind}`, ...attrs, onclick: fn },
    text,
  );
}
function field(label, control, help) {
  return node(
    "div",
    { class: "field" },
    node("label", { for: control.id }, label),
    control,
    help ? node("p", { class: "fine" }, help) : null,
  );
}
function output(text = "") {
  return node("p", { class: "form-status", role: "status" }, text);
}
function writeStatus(target, text, error = false) {
  target.textContent = text;
  target.classList.toggle("error", error);
}
function labelledSchedule(terms) {
  const labels = scheduleLabels(terms);
  return node(
    "div",
    { class: "participation-schedule" },
    node("h3", {}, terms?.title || "Occurrence details"),
    node(
      "dl",
      { class: "participant-answers" },
      node("div", {}, node("dt", {}, "Starts"), node("dd", {}, labels.start)),
      node("div", {}, node("dt", {}, "Ends"), node("dd", {}, labels.end)),
      node("div", {}, node("dt", {}, "Time zone"), node("dd", {}, labels.zone)),
    ),
    terms?.participationPurpose
      ? node("p", {}, terms.participationPurpose)
      : null,
    terms?.participantInstructions
      ? node("p", { class: "fine" }, terms.participantInstructions)
      : null,
  );
}

export async function createStaffParticipationWorkspace({
  orgId,
  admin,
  request,
  loadRecords,
  isCurrent = () => true,
  onChanged = () => {},
  onDirty = () => {},
  initialTargetId = "",
  initialCandidateId = "",
  initialIntakeId = "",
}) {
  const base = `/api/orgs/${part(orgId)}/participation-targets`;
  const state = {
    targets: [],
    target: null,
    detail: null,
    rows: [],
    cursor: null,
    busy: false,
    version: 0,
    dirty: false,
    filter: "",
  };
  const root = node("div", { class: "participation-workspace" }),
    notice = output("Loading permitted occurrences…"),
    picker = node(
      "select",
      { id: "participation-target-picker" },
      node(
        "option",
        { value: "" },
        "Choose an event session or volunteer shift",
      ),
    ),
    targetHost = node("section", { class: "panel section-gap" }),
    queueHost = node("section", { class: "panel section-gap" }),
    formHost = node("section", { class: "panel section-gap", hidden: true });
  const path = (id = state.target?.targetId) => `${base}/${part(id)}`;
  function dirty(value) {
    state.dirty = value;
    onDirty(value);
  }
  const live = (version = state.version) =>
    isCurrent() && version === state.version;
  root.append(
    node(
      "div",
      { class: "page-heading" },
      node(
        "div",
        {},
        node("span", { class: "eyebrow" }, "People and places"),
        node("h1", { tabindex: "-1" }, "Participation, with a decision."),
        node(
          "p",
          {},
          "Review specific consent, preserve places and record each confirmation deliberately. A request or candidate approval is not a booking.",
        ),
      ),
    ),
    node(
      "section",
      { class: "panel" },
      field(
        "Occurrence",
        picker,
        "One person, one place, the full occurrence. Partial shifts, group bookings and automatic promotion are not supported.",
      ),
      notice,
    ),
    targetHost,
    queueHost,
    formHost,
  );
  function closeForm() {
    formHost.replaceChildren();
    formHost.hidden = true;
    dirty(false);
  }
  function startForm(title, ...children) {
    closeForm();
    formHost.hidden = false;
    formHost.append(node("h2", { tabindex: "-1" }, title), ...children);
    formHost.querySelector("h2")?.focus();
    formHost.scrollIntoView({ block: "nearest" });
  }
  function confirmDiscard(fn) {
    if (!state.dirty) {
      void fn();
      return;
    }
    const prompt = node(
      "section",
      {
        class: "notice participation-confirmation",
        role: "region",
        tabindex: "-1",
      },
      node("h3", {}, "Discard unsaved participation changes?"),
      node(
        "p",
        {},
        "The saved records are unchanged. Continue without these unsaved entries?",
      ),
    );
    const keep = button("Keep editing", () => prompt.remove());
    prompt.append(
      node(
        "div",
        { class: "actions" },
        button(
          "Discard and continue",
          () => {
            closeForm();
            prompt.remove();
            void fn();
          },
          "danger",
        ),
        keep,
      ),
    );
    formHost.append(prompt);
    prompt.focus();
  }
  async function work(fn, status = notice) {
    if (state.busy) return;
    state.busy = true;
    const controls = [
      ...root.querySelectorAll("button,input,select,textarea"),
    ].map((control) => ({ control, disabled: control.disabled }));
    for (const { control } of controls) control.disabled = true;
    try {
      await fn();
    } catch (error) {
      if (isCurrent())
        writeStatus(
          status.isConnected ? status : notice,
          error.message || "This change could not be completed.",
          true,
        );
    } finally {
      state.busy = false;
      for (const { control, disabled } of controls)
        if (control.isConnected) control.disabled = disabled;
    }
  }
  async function loadTarget(id = picker.value) {
    closeForm();
    if (!id) {
      state.target = null;
      state.detail = null;
      targetHost.replaceChildren();
      queueHost.replaceChildren();
      return;
    }
    const version = ++state.version;
    writeStatus(
      notice,
      "Reading the current occurrence and allocation ledger…",
    );
    const result = await request(path(id));
    if (!live(version)) return;
    state.detail = result;
    state.target = result.target;
    if (!state.target || state.target.targetId !== id)
      throw new Error(
        "The occurrence response is incomplete. Refresh before making a decision.",
      );
    renderTarget();
    if (state.target.mode === "unmanaged") {
      state.rows = [];
      state.cursor = null;
      renderQueue();
    } else await loadQueue(false, version);
    if (live(version))
      writeStatus(
        notice,
        "Current saved state loaded. Availability is checked again when a decision is recorded.",
      );
  }
  function renderTarget() {
    const detail = state.detail,
      target = state.target,
      terms = detail.terms || target.terms;
    const metrics = [
      [
        "Capacity",
        Number.isSafeInteger(detail.capacity) ? detail.capacity : "Unknown",
      ],
      [
        "Occupied places",
        Number.isSafeInteger(detail.occupied) ? detail.occupied : "Unknown",
      ],
      [
        "Available now",
        Number.isSafeInteger(detail.capacity) &&
        Number.isSafeInteger(detail.occupied)
          ? Math.max(0, detail.capacity - detail.occupied)
          : "Unknown",
      ],
    ];
    targetHost.replaceChildren(
      node(
        "div",
        { class: "section-header" },
        node("h2", {}, terms?.title || target.title || "Selected occurrence"),
        node(
          "span",
          { class: "tag" },
          target.mode === "managed"
            ? "Ledger managed"
            : target.mode === "paused"
              ? "Paused / reconciliation needed"
              : "Not yet adopted",
        ),
      ),
      node(
        "div",
        { class: "participation-metrics" },
        metrics.map(([label, value]) =>
          node(
            "div",
            {},
            node("span", { class: "fine" }, label),
            node("strong", {}, String(value)),
          ),
        ),
      ),
      terms
        ? labelledSchedule(terms)
        : node(
            "p",
            { class: "notice" },
            "Current independently approved public participation details are not available. Review the source record before continuing.",
          ),
      node(
        "p",
        { class: "fine" },
        `Managed version ${target.revision} · current source revision ${detail.currentSourceRevision ?? target.currentSourceRevision ?? "Unknown"}. A working-content review does not release a recorded place.`,
      ),
      node(
        "p",
        { class: "notice fine" },
        "Email updates are not enabled. Notification events remain paused; the portal is the current status view. No confirmation, cancellation or promotion here sends a message.",
      ),
    );
    if (target.recoveryBlock)
      targetHost.append(
        node(
          "p",
          { class: "notice" },
          "Recovered participation is inactive provenance. Reconcile actual operating commitments before using this target.",
        ),
      );
    const actions = node("div", { class: "actions" });
    actions.append(
      button(
        "Refresh occurrence",
        () => confirmDiscard(() => work(() => loadTarget())),
        "subtle",
      ),
    );
    if (admin)
      actions.append(
        button(
          target.mode === "unmanaged"
            ? "Preview legacy adoption"
            : "Preview reconciliation / source refresh",
          () => confirmDiscard(() => work(() => showAdoption())),
          "subtle",
        ),
      );
    if (target.mode === "managed" && !target.recoveryBlock)
      actions.append(
        button(
          "Associate a candidate",
          () => confirmDiscard(() => work(() => showCandidate())),
          "primary",
        ),
      );
    targetHost.append(actions);
  }
  async function showAdoption() {
    await loadTarget();
    if (!isCurrent()) return;
    const detail = state.detail,
      preview = detail.preview || {},
      occupants = Array.isArray(preview.occupants) ? preview.occupants : [],
      issues = Array.isArray(preview.issues) ? preview.issues : [];
    const consent = node("input", {
        id: "participation-adopt-consent",
        type: "checkbox",
        required: true,
      }),
      status = output(),
      intent = commandIntent();
    const form = node(
      "form",
      {},
      node(
        "p",
        {},
        "Adopt exactly the saved occupancy shown here. This creates no participant account, new consent, notification or extra place. Earlier unknown consent stays unknown.",
      ),
      node(
        "p",
        { class: "fine" },
        `${occupants.length} recorded legacy occupant${occupants.length === 1 ? "" : "s"} in this preview. Completed history stays occupied for the same occurrence.`,
      ),
      occupants.length
        ? node(
            "ul",
            { class: "fine" },
            occupants.map((row) =>
              node(
                "li",
                {},
                row.title ||
                  row.bookingRecordId ||
                  row.id ||
                  "Recorded occupant",
                " · consent/approval is preserved only where recorded; otherwise unknown.",
              ),
            ),
          )
        : node(
            "p",
            { class: "fine" },
            "No legacy occupancy is present in this preview.",
          ),
      issues.length
        ? node(
            "div",
            { class: "notice error" },
            issues.map((issue) =>
              node(
                "p",
                {},
                typeof issue === "string"
                  ? issue
                  : issue.message || "Reconciliation issue requires review.",
              ),
            ),
          )
        : null,
      node(
        "label",
        { class: "intake-consent", for: consent.id },
        consent,
        node(
          "span",
          {},
          "I reviewed this exact occupancy and understand that adoption does not verify earlier consent or eligibility.",
        ),
      ),
      node(
        "div",
        { class: "actions" },
        node(
          "button",
          {
            type: "submit",
            class: "button primary",
            disabled: !detail.canAdopt || !preview.legacyHash,
          },
          "Adopt this exact preview",
        ),
        button("Close preview", closeForm),
      ),
      status,
    );
    form.addEventListener("change", () => dirty(true));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state.busy || !form.reportValidity()) return;
      void work(async () => {
        if (!consent.checked)
          throw new Error(
            "Review and agree to this exact adoption preview first.",
          );
        const endpoint = `${path()}/adopt`,
          body = intent.prepare(endpoint, {
            targetRevision: detail.currentSourceRevision,
            expectedLegacyHash: preview.legacyHash,
          });
        writeStatus(
          status,
          "Rechecking the exact legacy set and source revision…",
        );
        let result;
        try {
          result = await request(endpoint, { method: "POST", body });
        } catch (error) {
          intent.rejected(error.status);
          throw error;
        }
        if (!isCurrent()) return;
        intent.clear();
        closeForm();
        onChanged();
        await loadTarget();
        writeStatus(
          notice,
          `Adoption / reconciliation recorded. ${Number.isSafeInteger(result.adopted) ? result.adopted : "The reported"} legacy entries were adopted; no consent was invented.`,
        );
      }, status);
    });
    startForm("Review exact legacy occupancy", form);
  }
  async function showCandidate() {
    const target = state.target,
      records = await loadRecords(target.moduleId);
    if (!isCurrent() || target.targetId !== state.target?.targetId) return;
    const reference = target.moduleId === "events" ? "eventId" : "shiftId",
      kind = target.moduleId === "events" ? "registration" : "assignment";
    const candidates = records.filter(
      (record) =>
        record.data?.kind === kind &&
        record.data[reference] === target.targetId &&
        record.status !== "cancelled",
    );
    const candidate = node(
        "select",
        { id: "participation-candidate", required: true },
        node("option", { value: "" }, "Choose an existing typed candidate"),
        candidates.map((record) =>
          node(
            "option",
            { value: record.id, selected: record.id === initialCandidateId },
            `${record.data.title || "Candidate"} · ${record.status} · revision ${record.revision}`,
          ),
        ),
      ),
      intake = node("input", {
        id: "participation-intake",
        value: initialIntakeId,
        maxlength: 100,
        autocomplete: "off",
      }),
      status = output(),
      intent = commandIntent();
    const form = node(
      "form",
      {},
      node(
        "p",
        {},
        "Association creates an unallocated Requested entry. It does not approve the candidate, reserve capacity or grant an account access. A full occurrence can still keep a nonallocating candidate.",
      ),
      field(
        "Saved registration or assignment",
        candidate,
        "Use the normal module editor to prepare and independently approve its saved revision.",
      ),
      field(
        "Associated reviewed intake ID (optional)",
        intake,
        "Use the exact request associated with this candidate. Do not match people by email alone.",
      ),
      node(
        "div",
        { class: "actions" },
        node(
          "button",
          {
            type: "submit",
            class: "button primary",
            disabled: !candidates.length,
          },
          "Associate as requested — reserve no place",
        ),
        button("Close", closeForm),
      ),
      status,
    );
    form.addEventListener("input", () => dirty(true));
    form.addEventListener("change", () => dirty(true));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state.busy || !form.reportValidity()) return;
      void work(async () => {
        const record = candidates.find((entry) => entry.id === candidate.value);
        if (!record) throw new Error("Choose a current saved candidate.");
        const intakeId = intake.value.trim();
        if (intakeId && !/^[A-Za-z0-9_-]{1,100}$/.test(intakeId))
          throw new Error(
            "Use the exact opaque intake request ID or leave it blank.",
          );
        const endpoint = `${path()}/participations`,
          body = intent.prepare(endpoint, {
            targetRevision: target.revision,
            candidateRevision: record.revision,
            bookingRecordId: record.id,
            ...(intakeId ? { intakeId } : {}),
          });
        writeStatus(
          status,
          "Associating the saved candidate without allocating a place…",
        );
        try {
          await request(endpoint, { method: "POST", body });
        } catch (error) {
          intent.rejected(error.status);
          throw error;
        }
        if (!isCurrent()) return;
        intent.clear();
        closeForm();
        await loadTarget();
        writeStatus(
          notice,
          "Candidate associated. No place was reserved and no message was sent.",
        );
      }, status);
    });
    startForm("Prepare a nonallocating candidate", form);
  }
  async function loadQueue(append = false, version = state.version) {
    const result = await request(
      `${path()}/participations${append && state.cursor ? `?cursor=${part(state.cursor)}` : ""}`,
    );
    if (!live(version)) return;
    if (
      !Array.isArray(result.participations) ||
      result.participations.length > 20
    )
      throw new Error(
        "The participation page could not be verified. Refresh before deciding.",
      );
    state.rows = [
      ...new Map(
        [...(append ? state.rows : []), ...result.participations].map((row) => [
          row.id,
          row,
        ]),
      ).values(),
    ];
    state.cursor = result.nextCursor || null;
    renderQueue();
  }
  function renderQueue() {
    const filter = node(
      "select",
      { id: "participation-state-filter" },
      node("option", { value: "" }, "All loaded states"),
      Object.entries(states).map(([value, label]) =>
        node("option", { value, selected: value === state.filter }, label),
      ),
    );
    filter.addEventListener("change", () => {
      state.filter = filter.value;
      renderQueue();
    });
    const rows = state.rows.filter(
      (row) => !state.filter || row.state === state.filter,
    );
    queueHost.replaceChildren(
      node(
        "div",
        { class: "section-header" },
        node("h2", {}, "Participation ledger"),
        node("span", { class: "tag" }, `${state.rows.length} loaded`),
      ),
      field("Filter loaded entries", filter),
      node(
        "p",
        { class: "fine" },
        "Only confirmed entries use places. A candidate’s workflow approval and its allocation are separate. Releasing a place never promotes a waiting person automatically.",
      ),
    );
    if (!rows.length)
      queueHost.append(
        node(
          "p",
          { class: "fine" },
          "No loaded entries match this state. Associate a saved candidate or load another page when available.",
        ),
      );
    for (const row of rows) {
      const legacy = row.source === "legacy" || row.recovered;
      const card = node(
        "article",
        { class: "participation-ledger-row" },
        node(
          "div",
          { class: "section-header" },
          node("h3", {}, `Participation ${row.id.slice(0, 8)}`),
          node("span", { class: "tag" }, states[row.state] || "Unknown state"),
        ),
        node(
          "p",
          { class: "fine" },
          `Revision ${row.revision} · candidate revision ${row.candidateRevision ?? "Unknown"} · ${row.candidateApproved ? "current candidate approval recorded" : "candidate approval requires review"}`,
        ),
        node(
          "p",
          { class: "fine" },
          row.consent
            ? `Specific participation consent recorded ${row.consent.at || "with unknown time"}${row.consent.waitlistAllowed ? "; waitlist permitted" : "; no waitlist consent"}.`
            : "Specific participation consent: unknown / not recorded.",
        ),
        legacy
          ? node(
              "p",
              { class: "notice fine" },
              "Recorded legacy / recovered occupancy. Unknown consent and approval remain unknown. Adoption did not create fresh consent or a participant account.",
            )
          : null,
        node(
          "p",
          { class: "fine" },
          "Email updates not active; outbox events remain paused.",
        ),
      );
      const actions = node("div", { class: "actions" });
      if (row.bookingRecordId)
        actions.append(
          node(
            "a",
            {
              href: `#module/${part(row.moduleId)}/${part(row.bookingRecordId)}`,
              class: "button small subtle",
            },
            "Open candidate for review",
          ),
        );
      if (["requested", "waitlisted"].includes(row.state) && !row.recovered) {
        actions.append(
          button(
            "Record offline participation consent",
            () => showOfflineConsent(row),
            "small subtle",
          ),
        );
        if (row.state === "requested") {
          actions.append(
            button(
              "Confirm one place",
              () => showDecision(row, "confirm"),
              "small primary",
            ),
          );
          actions.append(
            button(
              "Waitlist — reserve no place",
              () => showDecision(row, "waitlist"),
              "small subtle",
            ),
          );
        } else
          actions.append(
            button(
              "Review manual promotion",
              () => showDecision(row, "promote"),
              "small primary",
            ),
          );
      }
      if (row.canCancel && row.state !== "cancelled")
        actions.append(
          button(
            "Cancel participation",
            () => showDecision(row, "cancel"),
            "small danger",
          ),
        );
      card.append(actions);
      queueHost.append(card);
    }
    if (state.cursor)
      queueHost.append(
        button(
          "Load more participation entries",
          () => work(() => loadQueue(true)),
          "subtle",
        ),
      );
    queueHost.append(
      node(
        "p",
        { class: "fine" },
        "Waitlist order is recorded by the server. Review earlier eligible entries before promoting another person; a later selection requires an operational reason. No automated eligibility or priority score is used.",
      ),
    );
  }
  function showDecision(row, action) {
    if (state.busy) return;
    confirmDiscard(() => {
      const target = state.target,
        detail = state.detail,
        status = output(),
        intent = commandIntent();
      const labels = {
        confirm: ["Confirm this participation?", "Record one confirmed place"],
        waitlist: [
          "Add this person to the waitlist?",
          "Record waitlist — no place reserved",
        ],
        promote: [
          "Promote this waiting participation?",
          "Confirm manual promotion",
        ],
        cancel: ["Cancel this participation?", "Confirm cancellation"],
      };
      const reason = node("textarea", {
        id: "participation-decision-reason",
        maxlength: 300,
        required: action === "cancel",
        rows: 3,
      });
      const confirm = node("input", {
        id: "participation-decision-check",
        type: "checkbox",
        required: true,
      });
      const form = node(
        "form",
        {},
        node(
          "p",
          {},
          action === "cancel"
            ? "This cancels the participation and releases one place only if it was confirmed. It does not erase the original request or select a waiting replacement."
            : action === "waitlist"
              ? "A waitlist uses no capacity and promises no place. Current approvals, specific participation intent and separate waitlist consent are checked again."
              : "This explicitly reserves one whole-occurrence place after a final current-approval, consent, capacity, duplicate and volunteer-overlap check. Approval alone did not reserve it.",
        ),
        labelledSchedule(detail.terms || target.terms),
        node(
          "p",
          { class: "fine" },
          `Expected participation revision ${row.revision}; managed target revision ${target.revision}; candidate revision ${row.candidateRevision ?? "Unknown"}; consent revision ${row.consent?.revision || 0}.`,
        ),
        field(
          action === "promote"
            ? "Decision / reason for passing an earlier eligible entry"
            : "Decision reason",
          reason,
          "Staff-only operational explanation, at most300 characters. Do not enter screening details or sensitive histories.",
        ),
        node(
          "label",
          { class: "intake-consent", for: confirm.id },
          confirm,
          node(
            "span",
            {},
            action === "cancel"
              ? "I intend to cancel this participation, without automatically promoting another person."
              : "I reviewed the saved candidate, specific consent and occurrence. I understand this does not record attendance or send email.",
          ),
        ),
        node(
          "div",
          { class: "actions" },
          node(
            "button",
            {
              type: "submit",
              class: `button ${action === "cancel" ? "danger" : "primary"}`,
            },
            labels[action][1],
          ),
          button("Keep current state", closeForm),
        ),
        status,
      );
      form.addEventListener("input", () => dirty(true));
      form.addEventListener("change", () => dirty(true));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (state.busy || !form.reportValidity()) return;
        void work(async () => {
          if (!confirm.checked)
            throw new Error("Confirm the intended action before continuing.");
          const endpoint = `${path()}/participations/${part(row.id)}/${action}`,
            body = intent.prepare(endpoint, {
              revision: row.revision,
              targetRevision: target.revision,
              candidateRevision: row.candidateRevision,
              consentRevision: row.consent?.revision || 0,
              reason: reason.value.trim(),
            });
          writeStatus(
            status,
            "Rechecking current authority, revisions and allocation…",
          );
          try {
            await request(endpoint, { method: "POST", body });
          } catch (error) {
            intent.rejected(error.status);
            throw error;
          }
          if (!isCurrent()) return;
          intent.clear();
          closeForm();
          onChanged();
          await loadTarget();
          writeStatus(
            notice,
            action === "cancel"
              ? "Cancellation recorded. No waitlist promotion or message occurred."
              : action === "waitlist"
                ? "Waitlist recorded. No place reserved and no message sent."
                : "Confirmation recorded. Attendance is separate; email updates remain paused.",
          );
        }, status);
      });
      startForm(labels[action][0], form);
    });
  }
  function showOfflineConsent(row) {
    if (state.busy) return;
    confirmDiscard(() => {
      const target = state.target,
        detail = state.detail,
        status = output(),
        intent = commandIntent(),
        method = node("input", {
          id: "participation-consent-method",
          maxlength: 80,
          required: true,
          autocomplete: "off",
        }),
        evidence = node("input", {
          id: "participation-consent-reference",
          maxlength: 200,
          required: true,
          autocomplete: "off",
        }),
        at = node("input", {
          id: "participation-consent-at",
          required: true,
          placeholder: "2026-10-26T14:00:00-04:00",
          autocomplete: "off",
        }),
        waitlist = node("input", {
          id: "participation-offline-waitlist",
          type: "checkbox",
        }),
        consent = node("input", {
          id: "participation-offline-consent",
          type: "checkbox",
          required: true,
        });
      const withdrawal = node("input", {
        id: "participation-offline-withdrawal",
        type: "checkbox",
        required: true,
      });
      const form = node(
        "form",
        {},
        node(
          "p",
          {},
          "Record a person's specific agreement to these exact participation details from an offline channel. This is a staff-recorded assertion, not verified mailbox identity or automated verification. No account or email is created.",
        ),
        labelledSchedule(detail.terms),
        field(
          "How consent was received",
          method,
          "For example: in-person discussion or phone call. No sensitive narrative.",
        ),
        field(
          "Minimal external evidence reference",
          evidence,
          "Use an operational reference, not a transcript, case history or private document contents.",
        ),
        field("Consent instant with explicit offset", at),
        node(
          "label",
          { class: "intake-consent", for: waitlist.id },
          waitlist,
          node(
            "span",
            {},
            "The person separately agreed to remain on a waitlist without a reserved place.",
          ),
        ),
        node(
          "label",
          { class: "intake-consent", for: consent.id },
          consent,
          node(
            "span",
            {},
            "I am recording their explicit participation agreement to this exact saved schedule and purpose.",
          ),
        ),
        row.withdrawalAcknowledgementRequired
          ? node(
              "label",
              { class: "intake-consent", for: withdrawal.id },
              withdrawal,
              node(
                "span",
                {},
                "The person is making a new participation request even though they withdrew the original request.",
              ),
            )
          : null,
        node(
          "p",
          { class: "notice fine" },
          "Email updates remain off and not active in this release.",
        ),
        node(
          "div",
          { class: "actions" },
          node(
            "button",
            { type: "submit", class: "button primary" },
            "Record offline consent — reserve no place",
          ),
          button("Close", closeForm),
        ),
        status,
      );
      form.addEventListener("input", () => dirty(true));
      form.addEventListener("change", () => dirty(true));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (state.busy || !form.reportValidity()) return;
        void work(async () => {
          if (
            !consent.checked ||
            (row.withdrawalAcknowledgementRequired && !withdrawal.checked)
          )
            throw new Error(
              "Record the person's explicit agreement and any required new-request acknowledgement before continuing.",
            );
          const endpoint = `${path()}/participations/${part(row.id)}/consent`,
            body = intent.prepare(endpoint, {
              revision: row.revision,
              targetRevision: target.revision,
              sourceRevision: detail.currentSourceRevision,
              termsHash: detail.termsHash,
              consent: true,
              waitlistAllowed: waitlist.checked,
              emailUpdates: false,
              method: method.value.trim(),
              evidenceRef: evidence.value.trim(),
              consentedAt: consentInstant(at.value),
              ...(row.withdrawalAcknowledgementRequired
                ? { withdrawalAcknowledged: true }
                : {}),
            });
          writeStatus(
            status,
            "Recording the specific offline consent provenance…",
          );
          try {
            await request(endpoint, { method: "POST", body });
          } catch (error) {
            intent.rejected(error.status);
            throw error;
          }
          if (!isCurrent()) return;
          intent.clear();
          closeForm();
          await loadTarget();
          writeStatus(
            notice,
            "Offline consent recorded as a staff assertion. No place was reserved and no message was sent.",
          );
        }, status);
      });
      startForm("Record specific offline consent", form);
    });
  }
  picker.addEventListener("change", () => {
    const id = picker.value;
    picker.value = state.target?.targetId || "";
    confirmDiscard(() => {
      picker.value = id;
      return work(() => loadTarget(id));
    });
  });
  const result = await request(base);
  if (!isCurrent()) return root;
  state.targets = targetChoices(result.targets);
  picker.replaceChildren(
    node("option", { value: "" }, "Choose an event session or volunteer shift"),
    ...state.targets.map((target) =>
      node(
        "option",
        { value: target.targetId },
        `${target.title || "Occurrence"} · ${target.moduleId === "events" ? "event" : "volunteer shift"} · ${target.mode}`,
      ),
    ),
  );
  writeStatus(
    notice,
    state.targets.length
      ? `${state.targets.length} permitted occurrences. Choose one to review its current ledger.`
      : "No permitted sessions or shifts are available. Prepare a typed occurrence with approved public participation details first.",
  );
  if (
    initialTargetId &&
    state.targets.some((target) => target.targetId === initialTargetId)
  ) {
    picker.value = initialTargetId;
    await loadTarget(initialTargetId);
  }
  return root;
}
