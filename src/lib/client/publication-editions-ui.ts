/** Private browser proposal controller. Public basis GETs only; no publishing or email actions. */
import {
  blankPublicationProposals,
  validateProposalCatalog,
  parsePublicationProposalBasis,
  publicationProposalCommandForm,
  canonicalPublicationProposalJson,
  strictPublicationProposalJson,
  preparePublicationProposalCommand,
  makePublicationProposalBackup,
  makePublicationProposalPacket,
  hashPublicationProposalSync,
  PUBLICATION_PROPOSAL_LIMITS,
  type ProposalCatalog,
  type ProposalState,
  type ProposalDraft,
  type ProposalCommand,
  type ProposalVersion,
  type ProposalBasisInput,
  type PublicationBlock,
  type Family,
} from "./publication-editions-model";
import {
  createPublicationProposalStore,
  PUBLICATION_PROPOSAL_STORAGE_KEY,
  type PublicationProposalStore,
  type ProposalRestorePreview,
  type ProposalClearPreview,
} from "./publication-editions-store";
import { download } from "./files";
import { rawStorageRecoveryDownload } from "./raw-storage-recovery";
type Form = NonNullable<ProposalDraft["form"]>;
const mounted = new WeakSet<HTMLElement>();
const clone = <T>(v: T): T => structuredClone(v),
  same = (a: unknown, b: unknown) =>
    canonicalPublicationProposalJson(a) === canonicalPublicationProposalJson(b);
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
) => {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
};
const now = () => new Date().toISOString(),
  newId = () => "proposal-" + crypto.randomUUID();
export async function readPublicationBasis(
  offer: ProposalCatalog["basisOffers"][number],
  catalog: ProposalCatalog,
  fetcher: typeof fetch = fetch,
): Promise<ProposalBasisInput> {
  // Capture plain data before the first await. The caller cannot swap a route,
  // hash or catalog while a download is pending, even through this exported helper.
  const offerStamp = canonicalPublicationProposalJson(offer),
    catalogStamp = canonicalPublicationProposalJson(catalog),
    ownedCatalog = validateProposalCatalog(catalog);
  const ownedOffer = ownedCatalog.basisOffers.find(
    (o) => canonicalPublicationProposalJson(o) === offerStamp,
  );
  if (!ownedOffer)
    throw Error(
      "Choose an exact registered public basis offer before fetching.",
    );
  const assertInputs = () => {
    if (
      canonicalPublicationProposalJson(offer) !== offerStamp ||
      canonicalPublicationProposalJson(catalog) !== catalogStamp
    )
      throw Error(
        "The public offer or catalog changed during its read; review it again.",
      );
  };
  if (ownedOffer.byteLength > PUBLICATION_PROPOSAL_LIMITS.backupBytes)
    throw Error(
      "This complete public basis exceeds the 2 MiB local transfer limit. Read its public archive instead.",
    );
  const target = new URL(ownedOffer.href, location.href);
  if (
    target.origin !== location.origin ||
    target.search ||
    target.hash ||
    target.username ||
    target.password
  )
    throw Error("Use the exact offered same-origin public basis route.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Error("Public basis read timed out."));
    }, 30_000);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(target.href, {
          method: "GET",
          credentials: "omit",
          mode: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        assertInputs();
        if (!response.ok || !response.body)
          throw Error(
            "The selected public basis could not be read. Your private work is unchanged.",
          );
        const reader = response.body.getReader(),
          chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const part = await reader.read();
            assertInputs();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > PUBLICATION_PROPOSAL_LIMITS.backupBytes)
              throw Error("The public basis exceeded its bounded size.");
            chunks.push(part.value.slice());
          }
        } finally {
          void reader.cancel().catch(() => {});
        }
        const bytes = new Uint8Array(size);
        let pos = 0;
        for (const c of chunks) {
          bytes.set(c, pos);
          pos += c.length;
        }
        assertInputs();
        return parsePublicationProposalBasis(bytes, ownedCatalog);
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
export async function mountPublicationProposal(
  root: HTMLElement,
): Promise<{ store: PublicationProposalStore; dispose(): void }> {
  if (mounted.has(root)) throw Error("Proposal desk already mounted.");
  mounted.add(root);
  const host = root.querySelector<HTMLElement>(".publication-proposal-mount")!,
    script = root.querySelector<HTMLScriptElement>(
      ".publication-proposal-catalog",
    );
  if (!host || !script)
    throw Error("The proposal desk needs its fixed public catalog.");
  const catalog = validateProposalCatalog(
    strictPublicationProposalJson(script.textContent ?? "", 1_048_576),
  );
  const store = await createPublicationProposalStore({
    initialState: blankPublicationProposals(newId(), now()),
    knownCatalog: catalog,
  });
  let tab: ProposalDraft["tab"] =
      store.snapshot().state?.draft.tab ?? "recovery",
    form: ProposalDraft["form"] = clone(
      store.snapshot().state?.draft.form ?? null,
    ),
    dirty = false,
    epoch = 0,
    busy = false,
    disposed = false,
    affirm = false,
    includeNotes = false,
    versionId: string | null = null,
    message =
      "Only explicitly selected public basis files are fetched. Private work stays in this browser.";
  let basisPreview: {
      basis: ProposalBasisInput;
      epoch: number;
      generation: number;
    } | null = null,
    restorePreview: ProposalRestorePreview | null = null,
    clearPreview: ProposalClearPreview | null = null,
    recoveryRaw: Uint8Array | null = null,
    recoveryName = "",
    confirmation: "" | "discard" | "reload" | "clear" = "";
  const state = () => store.snapshot().state;
  const changed = () => {
    epoch++;
    dirty = true;
    const notice = host.querySelector<HTMLElement>(".pp-dirty");
    if (notice)
      notice.textContent =
        "Open form changes are only in this tab. Save them locally or download a backup/raw recovery.";
    affirm = false;
    for (const input of host.querySelectorAll<HTMLInputElement>("input"))
      if ((input.getAttribute("aria-label") ?? "").startsWith("I reviewed"))
        input.checked = false;
    basisPreview = null;
    restorePreview = null;
    clearPreview = null;
  };
  const binding = () => {
    const s = store.snapshot();
    if (!s.state || !s.hash)
      throw Error("Use Recovery before changing this desk.");
    return {
      expectedGeneration: s.generation,
      expectedStateHash: s.hash,
      expectedRevision: s.state.revision,
    };
  };
  const adopt = () => {
    includeNotes = false;
    form = clone(state()?.draft.form ?? null);
    dirty = false;
    epoch++;
    affirm = false;
    basisPreview = null;
    restorePreview = null;
    clearPreview = null;
    confirmation = "";
  };
  const status = el("p", "", "pe-note pp-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const disable = () => {
    for (const e of host.querySelectorAll<
      | HTMLInputElement
      | HTMLButtonElement
      | HTMLSelectElement
      | HTMLTextAreaElement
    >("input,button,select,textarea"))
      if (busy) e.disabled = true;
  };
  async function work(action: () => Promise<void>) {
    if (busy || disposed) return;
    busy = true;
    status.textContent = "Working…";
    disable();
    try {
      await action();
    } catch (e) {
      message =
        e instanceof Error
          ? e.message
          : "The operation could not complete. Your unfinished work was retained.";
      affirm = false;
    } finally {
      busy = false;
      if (!disposed) render();
    }
  }
  const button = (
    label: string,
    action: () => void | Promise<void>,
    disabled = false,
  ) => {
    const b = el("button", label);
    b.type = "button";
    b.disabled = disabled || busy;
    b.addEventListener("click", () =>
      work(async () => {
        await action();
      }),
    );
    return b;
  };
  function field(
    label: string,
    value: string,
    onInput: (value: string) => void,
    multiline = false,
  ) {
    const wrap = el("label", label),
      input = el(multiline ? "textarea" : "input") as
        HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.setAttribute("aria-label", label);
    input.addEventListener("input", () => {
      changed();
      onInput(input.value);
    });
    wrap.append(input);
    return wrap;
  }
  function select(
    label: string,
    value: string,
    choices: { id: string; label: string }[],
    onChange: (value: string) => void,
  ) {
    const wrap = el("label", label),
      s = el("select");
    s.setAttribute("aria-label", label);
    for (const o of choices) {
      const opt = el("option", o.label);
      opt.value = o.id;
      s.append(opt);
    }
    s.value = value;
    s.addEventListener("change", () => {
      changed();
      onChange(s.value);
      render();
    });
    wrap.append(s);
    return wrap;
  }
  function check(
    label: string,
    checked: boolean,
    onChange: (value: boolean) => void,
  ) {
    const wrap = el("label", "", "pe-check"),
      c = el("input");
    c.type = "checkbox";
    c.checked = checked;
    c.setAttribute("aria-label", label);
    c.addEventListener("change", () => onChange(c.checked));
    wrap.append(c, el("span", label));
    return wrap;
  }
  function begin(next: Form) {
    if (form !== null) {
      message =
        "Keep, save or explicitly discard the current unfinished form before opening another. Changing tabs keeps it.";
      return;
    }
    changed();
    form = next;
    confirmation = "";
  }
  const rawDraft = (): ProposalDraft => ({
    tab,
    proposalId:
      form?.kind === "proposal"
        ? form.targetId
        : (state()?.draft.proposalId ?? null),
    form: clone(form),
    dirty: form !== null && (dirty || state()?.draft.dirty === true),
  });
  async function mutate(command: ProposalCommand, requiredAffirm = false) {
    const e = epoch,
      s = store.snapshot(),
      raw = canonicalPublicationProposalJson(form);
    if (requiredAffirm && !affirm)
      throw Error(
        "Check the fresh acknowledgement for this exact preview or form.",
      );
    const p = await store.prepareCommand(command, binding(), {
      at: now() < s.state!.updatedAt ? s.state!.updatedAt : now(),
      makeId: newId,
    });
    const out = await store.commitPrepared(p, {
      assertUiCurrent() {
        if (
          disposed ||
          epoch !== e ||
          canonicalPublicationProposalJson(form) !== raw ||
          (requiredAffirm && !affirm)
        )
          throw Error(
            "The form changed while this operation was pending. Review it again.",
          );
        return undefined;
      },
    });
    if (!p.mutation.noOp) {
      const keepLocal =
        command.kind !== "draft.replace" &&
        out.state?.draft.form !== null &&
        !same(out.state?.draft.form, form);
      if (keepLocal) {
        epoch++;
        dirty = true;
        affirm = false;
        basisPreview = null;
        restorePreview = null;
        clearPreview = null;
      } else adopt();
      message = out.unsaved
        ? "This valid change exists only in memory. Saved bytes were not replaced. Download a backup or retry this exact save."
        : p.mutation.summary.message;
      if (keepLocal)
        message +=
          " An older saved unfinished form remains; this tab’s submitted form was retained. Save it explicitly to replace that saved form.";
    } else
      message =
        p.mutation.summary.message +
        " Your current unfinished form was retained.";
  }
  function writingCommand(): Extract<
    ProposalCommand,
    { kind: "proposal.freeze" }
  > {
    if (!form || form.kind !== "proposal") throw Error("Open a proposal form.");
    const f = form.fields;
    return {
      kind: "proposal.freeze",
      proposalId: form.targetId,
      expectedVersionId:
        form.binding.expectedVersionId === "null"
          ? null
          : form.binding.expectedVersionId,
      expectedVersionHash:
        form.binding.expectedVersionHash === "null"
          ? null
          : form.binding.expectedVersionHash,
      basisPins: strictPublicationProposalJson(f.basisPins ?? "", 65536) as any,
      selectedMembers: strictPublicationProposalJson(
        f.selectedMembers ?? "",
        65536,
      ) as any,
      title: f.title ?? "",
      summary: f.summary ?? "",
      family: f.family as Family,
      declaredPublicationDate: f.declaredPublicationDate || null,
      blocks: strictPublicationProposalJson(
        f.blocks ?? "",
        65536,
      ) as PublicationBlock[],
      correction: f.supersedes
        ? { supersedes: f.supersedes, reason: f.correctionReason ?? "" }
        : null,
      operatorNotes: f.operatorNotes ?? "",
      amendmentReason: f.amendmentReason || null,
    };
  }
  function openProposal(v: ProposalVersion | null) {
    const s = state();
    if (!s) return;
    const first = s.bases[0];
    if (!first) {
      message =
        "Retain a complete public basis in Sources before drafting a proposal.";
      tab = "sources";
      return;
    }
    const p = v ? s.proposals.find((p) => p.id === v.proposalId) : null;
    const cmd: Extract<ProposalCommand, { kind: "proposal.freeze" }> = {
      kind: "proposal.freeze",
      proposalId: p?.id ?? null,
      expectedVersionId: v?.id ?? null,
      expectedVersionHash: v?.hash ?? null,
      basisPins: v?.basisPins ?? [{ id: first.core.id, hash: first.hash }],
      selectedMembers: v?.selectedMembers ?? [],
      family: p?.family ?? first.core.family,
      title: v?.title ?? "",
      summary: v?.summary ?? "",
      declaredPublicationDate: v?.declaredPublicationDate ?? null,
      blocks: v?.blocks ?? [],
      correction: v?.correction ?? null,
      operatorNotes: v?.operatorNotes ?? "",
      amendmentReason: null,
    };
    begin(publicationProposalCommandForm(cmd, { catalogHash: catalog.hash })!);
    tab = "proposals";
  }
  function proposals(panel: HTMLElement) {
    panel.append(
      el("h3", "Your local proposals"),
      button(
        "Begin new proposal",
        () => openProposal(null),
        !store.snapshot().canWrite,
      ),
    );
    for (const p of state()?.proposals ?? []) {
      const versions = state()!.versions.filter((v) => v.proposalId === p.id),
        v = versions.at(-1)!;
      const card = el("article", "", "pe-card");
      card.append(
        el("h4", v.title),
        el(
          "p",
          `${p.family} · ${versions.length} local version(s). Draft, not published or independently reviewed.`,
        ),
        button("View " + v.title, () => {
          versionId = v.id;
          includeNotes = false;
          tab = "preview";
          changed();
        }),
        button(
          "Amend " + v.title,
          () => openProposal(v),
          !store.snapshot().canWrite,
        ),
      );
      panel.append(card);
    }
    if (form?.kind === "proposal") editor(panel);
    else if (form)
      panel.append(
        el(
          "p",
          "A public basis choice is unfinished. Complete or explicitly discard it in Sources.",
        ),
      );
  }
  function editor(panel: HTMLElement) {
    const f = form!;
    panel.append(
      el(
        "h3",
        f.targetId
          ? "Amend the current local proposal"
          : "Write a new local proposal",
      ),
    );
    for (const [key, label, multi] of [
      ["title", "Proposal title", false],
      ["summary", "Proposal summary", true],
      [
        "declaredPublicationDate",
        "Proposed publication day (optional YYYY-MM-DD)",
        false,
      ],
      [
        "operatorNotes",
        "Private operator notes (excluded from selected packets by default)",
        true,
      ],
      [
        "amendmentReason",
        "Amendment reason (required for a new version)",
        true,
      ],
    ] as const)
      panel.append(
        field(
          label,
          f.fields[key] ?? "",
          (v) => {
            f.fields[key] = v;
          },
          multi,
        ),
      );
    panel.append(
      select(
        "Publication family",
        f.fields.family ?? "letter",
        [
          "state-of-charity",
          "progress-report",
          "principles",
          "journal",
          "letter",
        ].map((id) => ({ id, label: id })),
        (v) => {
          f.fields.family = v;
        },
      ),
    );
    let pins: any[], members: any[], typedBlocks: PublicationBlock[];
    try {
      pins = strictPublicationProposalJson(
        f.fields.basisPins ?? "",
        65536,
      ) as any[];
      members = strictPublicationProposalJson(
        f.fields.selectedMembers ?? "",
        65536,
      ) as any[];
      typedBlocks = strictPublicationProposalJson(
        f.fields.blocks ?? "",
        65536,
      ) as PublicationBlock[];
      if (
        !Array.isArray(pins) ||
        !Array.isArray(members) ||
        !Array.isArray(typedBlocks)
      )
        throw Error();
      for (const pin of pins)
        if (!pin || typeof pin.id !== "string" || typeof pin.hash !== "string")
          throw Error();
      for (const member of members)
        if (
          !member ||
          typeof member.editionId !== "string" ||
          typeof member.memberId !== "string" ||
          typeof member.contentHash !== "string"
        )
          throw Error();
      for (const b of typedBlocks) {
        if (!b || !["heading", "paragraph", "list", "links"].includes(b.kind))
          throw Error();
        if (
          (b.kind === "heading" || b.kind === "paragraph") &&
          typeof b.text !== "string"
        )
          throw Error();
        if (
          b.kind === "list" &&
          (!Array.isArray(b.items) ||
            b.items.some((x) => typeof x !== "string"))
        )
          throw Error();
        if (
          b.kind === "links" &&
          (!Array.isArray(b.items) ||
            b.items.some(
              (x) =>
                !x || typeof x.label !== "string" || typeof x.url !== "string",
            ))
        )
          throw Error();
      }
    } catch {
      panel.append(
        el(
          "p",
          "This saved form contains unfinished or malformed structured fields. Repair the raw form below; its text is retained.",
          "pe-note",
        ),
        field(
          "Raw basis pins repair",
          f.fields.basisPins ?? "",
          (v) => {
            f.fields.basisPins = v;
          },
          true,
        ),
        field(
          "Raw member selection repair",
          f.fields.selectedMembers ?? "",
          (v) => {
            f.fields.selectedMembers = v;
          },
          true,
        ),
        field(
          "Raw authored blocks repair",
          f.fields.blocks ?? "",
          (v) => {
            f.fields.blocks = v;
          },
          true,
        ),
      );
      return;
    }
    panel.append(
      el("h4", "Choose retained public basis and members"),
      el(
        "p",
        "Select at most five complete bases and 100 member references. A selected packet retains full public context for each basis.",
      ),
    );
    const updateSelection = () => {
      f.fields.basisPins = canonicalPublicationProposalJson(pins);
      f.fields.selectedMembers = canonicalPublicationProposalJson(members);
      f.binding.basisHash = hashPublicationProposalSync(pins);
    };
    for (const b of state()?.bases ?? []) {
      const selected = pins.some((p) => p.id === b.core.id),
        card = el("div", "", "pe-card");
      card.append(
        check(b.core.title + " — retain complete basis", selected, (yes) => {
          changed();
          pins = yes
            ? [...pins, { id: b.core.id, hash: b.hash }].sort((a, b) =>
                a.id.localeCompare(b.id),
              )
            : pins.filter((p) => p.id !== b.core.id);
          if (!yes) members = members.filter((m) => m.editionId !== b.core.id);
          updateSelection();
          render();
        }),
      );
      if (selected) {
        for (const m of b.core.members) {
          card.append(
            check(
              "Select " + m.id + " from " + b.core.id,
              members.some(
                (s) => s.editionId === b.core.id && s.memberId === m.id,
              ),
              (yes) => {
                changed();
                members = yes
                  ? [
                      ...members,
                      {
                        editionId: b.core.id,
                        memberId: m.id,
                        contentHash: m.contentHash,
                      },
                    ]
                  : members.filter(
                      (s) =>
                        !(s.editionId === b.core.id && s.memberId === m.id),
                    );
                updateSelection();
              },
            ),
          );
        }
      }
      panel.append(card);
    }
    panel.append(
      field(
        "Corrected public edition ID (optional)",
        f.fields.supersedes ?? "",
        (v) => {
          f.fields.supersedes = v;
        },
      ),
      field(
        "Public correction reason",
        f.fields.correctionReason ?? "",
        (v) => {
          f.fields.correctionReason = v;
        },
        true,
      ),
      el("h4", "Authored blocks"),
    );
    const saveBlocks = () => {
      f.fields.blocks = canonicalPublicationProposalJson(typedBlocks);
    };
    typedBlocks.forEach((b, i) => {
      const card = el("div", "", "pe-block");
      card.append(el("h5", `${i + 1}. ${b.kind}`));
      if (b.kind === "heading" || b.kind === "paragraph")
        card.append(
          field(
            "Block " + (i + 1) + " text",
            b.text,
            (v) => {
              b.text = v;
              saveBlocks();
            },
            b.kind === "paragraph",
          ),
        );
      else if (b.kind === "list")
        card.append(
          field(
            "Block " + (i + 1) + " list (one item per line)",
            b.items.join("\n"),
            (v) => {
              b.items = v.split("\n");
              saveBlocks();
            },
            true,
          ),
        );
      else
        b.items.forEach((link, j) =>
          card.append(
            field(`Block ${i + 1} link ${j + 1} label`, link.label, (v) => {
              link.label = v;
              saveBlocks();
            }),
            field(`Block ${i + 1} link ${j + 1} HTTPS URL`, link.url, (v) => {
              link.url = v;
              saveBlocks();
            }),
          ),
        );
      if (b.kind === "links")
        card.append(
          button("Add link to block " + (i + 1), () => {
            changed();
            b.items.push({ label: "", url: "" });
            saveBlocks();
          }),
        );
      card.append(
        button("Remove block " + (i + 1), () => {
          changed();
          typedBlocks.splice(i, 1);
          saveBlocks();
        }),
        button(
          "Move block " + (i + 1) + " up",
          () => {
            changed();
            [typedBlocks[i - 1], typedBlocks[i]] = [
              typedBlocks[i],
              typedBlocks[i - 1],
            ];
            saveBlocks();
          },
          i === 0,
        ),
      );
      panel.append(card);
    });
    for (const kind of ["heading", "paragraph", "list", "links"] as const)
      panel.append(
        button("Add " + kind, () => {
          changed();
          typedBlocks.push(
            kind === "heading" || kind === "paragraph"
              ? { kind, text: "" }
              : kind === "list"
                ? { kind, items: [""] }
                : { kind, items: [{ label: "", url: "" }] },
          );
          saveBlocks();
        }),
      );
    panel.append(
      check(
        "I reviewed this exact local proposal and selected public basis. Freezing does not publish or establish independent review.",
        affirm,
        (v) => {
          affirm = v;
        },
      ),
      button(
        "Freeze reviewed local proposal",
        async () => {
          await mutate(writingCommand(), true);
          if (!form) {
            versionId = state()?.versions.at(-1)?.id ?? null;
            includeNotes = false;
            tab = "preview";
          }
        },
        !store.snapshot().canWrite,
      ),
    );
  }
  function sources(panel: HTMLElement) {
    panel.append(
      el("h3", "Retain one fixed public basis"),
      el(
        "p",
        "Only this explicit action fetches a public static file. Complete public source snapshots are retained privately with it. Choosing a basis does not qualify research or publish your work.",
      ),
    );
    const chosen = form?.kind === "basis" ? (form.fields.editionId ?? "") : "";
    panel.append(
      select(
        "Offered fixed public edition",
        chosen,
        [
          { id: "", label: "Choose an offered edition" },
          ...catalog.basisOffers.map((o) => ({
            id: o.editionId,
            label: `${o.editionId} · ${o.byteLength.toLocaleString()} bytes${o.byteLength > 2_097_152 ? " · too large for local capture" : ""}`,
          })),
        ],
        (id) => {
          if (!id) return;
          if (form && form.kind !== "basis") {
            message =
              "Keep or explicitly discard the current proposal form before choosing a basis.";
            return;
          }
          const offer = catalog.basisOffers.find((o) => o.editionId === id)!;
          form = publicationProposalCommandForm(
            {
              kind: "basis.capture",
              basis: {
                edition: { core: { id }, hash: offer.editionHash } as any,
                sources: [],
              },
            },
            { catalogHash: catalog.hash },
          );
        },
      ),
    );
    const offer = catalog.basisOffers.find((o) => o.editionId === chosen);
    panel.append(
      button(
        "Fetch selected public basis for review",
        async () => {
          if (!offer) throw Error("Choose one offered edition.");
          const e = epoch,
            g = store.snapshot().generation,
            chosenForm = canonicalPublicationProposalJson(form);
          basisPreview = null;
          affirm = false;
          const basis = await readPublicationBasis(offer, catalog);
          if (
            epoch !== e ||
            store.snapshot().generation !== g ||
            canonicalPublicationProposalJson(form) !== chosenForm
          )
            throw Error(
              "The choice changed during download; no capture was authorized.",
            );
          basisPreview = { basis, epoch: e, generation: g };
          message = `Review ${basis.edition.core.title}: ${basis.edition.core.members.length} members and ${basis.sources.length} complete public source snapshots.`;
        },
        !offer || offer.byteLength > 2_097_152 || !store.snapshot().canWrite,
      ),
    );
    if (basisPreview) {
      const b = basisPreview;
      panel.append(
        el(
          "div",
          `${b.basis.edition.core.title}\n${b.basis.edition.core.family} · capture ${b.basis.edition.core.capturedAt}\n${b.basis.edition.core.members.length} members · ${b.basis.sources.length} source snapshots\nEditorial draft; artifact descriptors are retained, not downloaded artifact bytes.`,
          "pe-note pe-text",
        ),
        el("p", b.basis.edition.hash, "pe-hash"),
        check(
          "I reviewed this complete public basis and its source scope. Retain this exact copy locally.",
          affirm,
          (v) => {
            affirm = v;
          },
        ),
        button(
          "Retain reviewed public basis",
          async () => {
            if (
              b !== basisPreview ||
              b.epoch !== epoch ||
              b.generation !== store.snapshot().generation
            )
              throw Error("Fetch and review this choice again.");
            await mutate({ kind: "basis.capture", basis: b.basis }, true);
          },
          !store.snapshot().canWrite,
        ),
      );
    }
    for (const b of state()?.bases ?? []) {
      const card = el("article", "", "pe-card");
      card.append(
        el("h4", b.core.title),
        el(
          "p",
          `${b.core.members.length} members · ${b.core.sourcePins.length} sources · ${b.core.capturedAt}`,
        ),
        el("p", b.hash, "pe-hash"),
      );
      const details = el("details");
      details.append(el("summary", "Member and source references"));
      for (const m of b.core.members)
        details.append(
          el("p", m.id + " · " + m.kind + " · " + m.contentHash, "pe-hash"),
        );
      for (const pin of b.core.sourcePins) {
        const source = state()!.sources.find((s) => s.id === pin.id)!;
        details.append(
          el("p", source.path + " · " + source.commit, "pe-hash"),
          button("Download source " + source.id, () => {
            download(source.id + ".txt", source.rawUtf8);
            message =
              "A download of the exact retained public source text was requested.";
          }),
        );
      }
      card.append(details);
      panel.append(card);
    }
  }
  function preview(panel: HTMLElement) {
    panel.append(el("h3", "Frozen local proposal history"));
    const versions = state()?.versions ?? [];
    if (!versions.length) {
      panel.append(
        el("p", "No local proposal version has been frozen.", "pe-empty"),
      );
      return;
    }
    versionId = versions.some((v) => v.id === versionId)
      ? versionId
      : versions.at(-1)!.id;
    panel.append(
      select(
        "Local proposal version",
        versionId!,
        versions.map((v) => ({
          id: v.id,
          label: `${v.title} · v${v.version}`,
        })),
        (v) => {
          versionId = v;
          includeNotes = false;
        },
      ),
    );
    const v = versions.find((v) => v.id === versionId)!;
    panel.append(
      el("h4", v.title),
      el("p", v.summary, "pe-text"),
      el(
        "p",
        `Local version ${v.version}, recorded ${v.recordedAt}. Publication day: ${v.declaredPublicationDate ?? "unknown"}.`,
      ),
      el(
        "p",
        "Draft proposal; not published or independently reviewed.",
        "pe-note",
      ),
    );
    for (const b of v.blocks) {
      if (b.kind === "heading") panel.append(el("h5", b.text));
      else if (b.kind === "paragraph") panel.append(el("p", b.text, "pe-text"));
      else if (b.kind === "list") {
        const l = el("ul");
        b.items.forEach((x) => l.append(el("li", x)));
        panel.append(l);
      } else {
        const l = el("ul");
        b.items.forEach((x) => l.append(el("li", x.label + " — " + x.url)));
        panel.append(l);
      }
    }
    panel.append(
      el("p", "Version hash: " + v.hash, "pe-hash"),
      el(
        "p",
        `${v.selectedMembers.length} selected members. Full pinned public context is included in its packet.`,
      ),
      check(
        "Include this version’s private operator notes in its selected packet",
        includeNotes,
        (v) => {
          includeNotes = v;
          epoch++;
        },
      ),
      button("Download selected proposal JSON", () => packet(v, "json")),
      button("Download selected proposal Markdown", () =>
        packet(v, "markdown"),
      ),
    );
  }
  async function packet(v: ProposalVersion, format: "json" | "markdown") {
    const e = epoch,
      s = store.snapshot(),
      selectedNotes = includeNotes,
      out = await makePublicationProposalPacket(
        s.state!,
        { versionId: v.id, includeOperatorNotes: selectedNotes },
        catalog,
      );
    if (e !== epoch || s.generation !== store.snapshot().generation)
      throw Error("Selection changed; download again.");
    download(
      v.id + "." + (format === "json" ? "json" : "md"),
      out[format],
      format === "json" ? "application/json" : "text/markdown;charset=utf-8",
    );
    message =
      "Selected proposal packet download requested. Unrelated private versions and raw forms are excluded; full pinned public context is included.";
  }
  async function backup() {
    const s = store.snapshot();
    if (!s.state || !s.hash)
      throw Error("No valid current state is available; use raw recovery.");
    const e = epoch,
      f = canonicalPublicationProposalJson(form);
    const draft = rawDraft();
    const p = await preparePublicationProposalCommand(
      s.state,
      { kind: "draft.replace", draft },
      {
        expectedStateHash: s.hash,
        expectedRevision: s.state.revision,
        at: now() < s.state.updatedAt ? s.state.updatedAt : now(),
        makeId: newId,
        knownCatalog: catalog,
      },
    );
    const text = await makePublicationProposalBackup(
      p.candidate,
      now(),
      catalog,
    );
    if (
      e !== epoch ||
      f !== canonicalPublicationProposalJson(form) ||
      s.generation !== store.snapshot().generation
    )
      throw Error("The unfinished form changed during backup. Download again.");
    download(
      "charitology-publication-proposals-backup.json",
      text,
      "application/json",
    );
    message =
      "Full private backup download requested, including all local versions, notes, retained public bases and the open raw form. Saved bytes were not changed.";
  }
  function recovery(panel: HTMLElement) {
    panel.append(
      el("h3", "Recovery"),
      el(
        "p",
        "Keep a full backup and raw recovery before replacing saved data. Restore/clear uses an owned preview and exact saved-byte checks.",
      ),
    );
    for (const [label, raw] of [
      ["Download protected original saved text", store.rawSavedCopy()],
      ["Download latest observed saved text", store.snapshot().observedRaw],
    ] as const)
      if (typeof raw === "string")
        panel.append(
          button(label, () => {
            const out = rawStorageRecoveryDownload(raw);
            download(
              label.includes("original")
                ? "publication-proposals-protected-recovery.txt"
                : "publication-proposals-observed-recovery.txt",
              out.text,
            );
            message = out.wrapped
              ? "Recovery download requested as JSON-wrapped text, preserving malformed UTF-16."
              : "Recovery text download requested; this is not a validated backup.";
          }),
        );
    const fileLabel = el("label", "Choose a full proposal backup JSON"),
      input = el("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.setAttribute("aria-label", "Choose a full proposal backup JSON");
    input.addEventListener("change", () => {
      epoch++;
      affirm = false;
      restorePreview = null;
      clearPreview = null;
      recoveryRaw = null;
      recoveryName = "";
      const file = input.files?.[0],
        e = epoch;
      if (!file) {
        render();
        return;
      }
      void work(async () => {
        if (file.size > 2_097_152)
          throw Error("Backup exceeds 2 MiB; no prior preview remains active.");
        let timer: ReturnType<typeof setTimeout> | undefined;
        const bytes = new Uint8Array(
          await Promise.race([
            file.arrayBuffer(),
            new Promise<ArrayBuffer>((_, reject) => {
              timer = setTimeout(
                () => reject(Error("File read timed out.")),
                30_000,
              );
            }),
          ]).finally(() => clearTimeout(timer)),
        );
        if (e !== epoch) throw Error("The file choice changed.");
        if (bytes.byteLength > 2_097_152)
          throw Error("Backup exceeded its byte limit.");
        const p = await store.previewRestore(bytes);
        if (e !== epoch)
          throw Error("The file choice changed during validation.");
        restorePreview = p;
        recoveryRaw = bytes;
        recoveryName = file.name;
        message = `Review replacement from ${file.name}: ${p.state.proposals.length} proposals, ${p.state.versions.length} versions. Current work remains unchanged until explicit apply.`;
      });
    });
    fileLabel.append(input);
    panel.append(fileLabel);
    if (restorePreview) {
      const p = restorePreview;
      panel.append(
        el(
          "p",
          `Replacement preview: ${recoveryName} · ${p.state.versions.length} versions.`,
          "pe-note",
        ),
        button(
          "Apply reviewed backup replacement",
          async () => {
            if (p !== restorePreview || !recoveryRaw)
              throw Error("Choose and preview the file again.");
            const out = await store.restore(p);
            adopt();
            recoveryRaw = null;
            message = out.unsaved
              ? "Replacement is only in memory; saved bytes were not replaced. Download it or retry saving."
              : "Reviewed replacement saved. Earlier undo/recovery choices are stale.";
          },
          !store.snapshot().canRecover,
        ),
      );
    }
    panel.append(
      button(
        "Review clearing this proposal desk",
        async () => {
          if (dirty || form)
            throw Error(
              "Download your work first. Explicitly discard the unfinished form, then use Save unfinished form locally before reviewing clear again.",
            );
          clearPreview = await store.previewClear(
            blankPublicationProposals(newId(), now()),
          );
          restorePreview = null;
          message =
            "Clear preview ready. It removes only this desk’s key. Download current work before applying.";
        },
        !store.snapshot().canRecover,
      ),
    );
    if (clearPreview) {
      const p = clearPreview;
      panel.append(
        button("Apply reviewed clear of this desk", async () => {
          if (p !== clearPreview) throw Error("Review a fresh clear.");
          const out = await store.clear(p);
          adopt();
          message = out.unsaved
            ? "Clear exists only in memory. Saved bytes were not removed. Download or retry the exact removal."
            : "This proposal desk key was removed. Other tools were unchanged.";
        }),
      );
    }
  }
  function render() {
    if (disposed) return;
    host.replaceChildren();
    const snapshot = store.snapshot();
    host.append(status);
    status.textContent = message;
    if (snapshot.message)
      host.append(el("p", snapshot.message, "pe-note pe-warning"));
    host.append(
      el(
        "p",
        snapshot.state
          ? `${snapshot.state.proposals.length} local proposals · ${snapshot.state.versions.length} frozen versions · ${snapshot.state.bases.length} retained public bases${snapshot.unsaved ? " · UNSAVED IN MEMORY" : ""}`
          : "Saved data is unavailable or corrupt; no blank workspace was substituted.",
        "pp-counts",
      ),
    );
    host.append(
      el(
        "p",
        dirty
          ? "Open form changes are only in this tab. Save them locally or download a backup/raw recovery."
          : form
            ? "An unfinished form is open; freezing is a separate explicit action."
            : "No unfinished form is open.",
        "pp-dirty pe-note",
      ),
    );
    const actions = el("div", "", "pe-actions");
    actions.append(
      button(
        "Save unfinished form locally",
        async () => {
          await mutate({ kind: "draft.replace", draft: rawDraft() });
        },
        !snapshot.canWrite,
      ),
      button(
        "Download full private backup with open form",
        backup,
        !snapshot.state,
      ),
      button("Download unfinished form recovery text", () => {
        download(
          "publication-proposal-unfinished-form.json",
          JSON.stringify(
            {
              format: "charitology-publication-proposal-raw-form-recovery",
              version: 1,
              form,
            },
            null,
            2,
          ) + "\n",
          "application/json",
        );
        message =
          "Raw form recovery download requested. It is not a full restore backup or a published proposal.";
      }),
      button(
        "Retry exact unsaved persistence",
        async () => {
          const out = await store.retryPersist();
          message = out.unsaved
            ? "Still unsaved; current memory and saved bytes remain separately recoverable."
            : "The exact current candidate was saved without replaying a command.";
        },
        !snapshot.canRetryPersist,
      ),
      button(
        "Undo last saved-state operation",
        async () => {
          if (dirty)
            throw Error(
              "Save your unfinished form before undo, or explicitly discard its tab-only changes and save the empty form.",
            );
          const out = await store.undo();
          adopt();
          message = out.unsaved
            ? "Undo exists only in memory; saved bytes were not replaced."
            : "Guarded undo applied.";
        },
        !snapshot.canUndo,
      ),
      button("Review reload of saved copy", () => {
        epoch++;
        affirm = false;
        basisPreview = null;
        restorePreview = null;
        clearPreview = null;
        confirmation = "reload";
      }),
      button("Discard unfinished form in this tab", () => {
        epoch++;
        affirm = false;
        basisPreview = null;
        restorePreview = null;
        clearPreview = null;
        confirmation = "discard";
      }),
    );
    host.append(actions);
    if (confirmation)
      host.append(
        el(
          "p",
          confirmation === "discard"
            ? "Discard this tab’s open form? Its saved copy remains until you explicitly save the empty form."
            : "Reload replaces this tab’s current memory/form with validated saved bytes. Download current work first.",
          "pe-note",
        ),
        button(
          confirmation === "discard"
            ? "Confirm tab-only form discard"
            : "Confirm reload and discard this tab’s unsaved work",
          async () => {
            if (confirmation === "discard") {
              form = null;
              dirty = true;
              epoch++;
              affirm = false;
              basisPreview = null;
              restorePreview = null;
              clearPreview = null;
              confirmation = "";
              message =
                "Unfinished form discarded only in this tab. Use Save unfinished form locally to persist the empty form; the saved copy is unchanged.";
            } else {
              const out = await store.reload({ discardUnsaved: true });
              basisPreview = null;
              restorePreview = null;
              clearPreview = null;
              if (out.code === "ready" || out.code === "unsupported") {
                adopt();
                message =
                  "Saved copy validated and loaded; old undo/previews were invalidated.";
              } else
                message =
                  out.message ||
                  "Saved data remains unavailable. Protected/current work was retained.";
              confirmation = "";
            }
          },
        ),
        button("Keep current tab work", () => {
          confirmation = "";
        }),
      );
    const nav = el("div", "", "pe-tabs");
    for (const t of [
      "proposals",
      "sources",
      "preview",
      "exports",
      "recovery",
    ] as const) {
      const b = button(t[0].toUpperCase() + t.slice(1), () => {
        tab = t;
        epoch++;
        affirm = false;
        basisPreview = null;
      });
      b.setAttribute("aria-pressed", String(tab === t));
      nav.append(b);
    }
    host.append(nav);
    const panel = el("div");
    if (tab === "proposals") proposals(panel);
    if (tab === "sources") sources(panel);
    if (tab === "preview") preview(panel);
    if (tab === "exports")
      panel.append(
        el("h3", "Choose the right download"),
        el(
          "p",
          "Full backups contain every private version, notes and the open raw form. Selected packets contain only the chosen local version plus its complete pinned public context; operator notes are excluded unless explicitly checked in Preview.",
        ),
        button("Download full backup", backup, !snapshot.state),
      );
    if (tab === "recovery") recovery(panel);
    host.append(panel);
    if (busy) disable();
  }
  const external = (event: StorageEvent) => {
    if (event.key !== PUBLICATION_PROPOSAL_STORAGE_KEY && event.key !== null)
      return;
    store.noticeExternalChange();
    epoch++;
    affirm = false;
    basisPreview = null;
    restorePreview = null;
    clearPreview = null;
    message =
      "Another tab changed saved data. This tab’s open form was retained. Download it and use Recovery or explicit reload.";
    if (!busy) render();
  };
  const beforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty || store.snapshot().unsaved) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("storage", external);
  window.addEventListener("beforeunload", beforeUnload);
  render();
  return {
    store,
    dispose() {
      disposed = true;
      epoch++;
      store.dispose();
      window.removeEventListener("storage", external);
      window.removeEventListener("beforeunload", beforeUnload);
    },
  };
}
