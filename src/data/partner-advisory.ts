import {
  type PartnerWorkspace,
  text,
  area,
  num,
  date,
  select,
  source,
  depth,
  workflow,
  taskFields,
} from "./partner-types";

const claimStatus = () =>
  select("evidence", "Basis of this claim", [
    "Unknown or not checked",
    "Public description only",
    "Observational evidence",
    "Causal study",
    "Mixed or disputed",
    "Hypothesis",
  ]);

export const advisoryWorkspaces: Record<string, PartnerWorkspace> = {
  "donor-advisory": {
    id: "donor-advisory",
    title: "Prepare a donor discussion",
    purpose:
      "Work from values and constraints to alternative giving scenarios, evidence questions and a follow-up plan. Keep the donor’s choices and unresolved disagreements visible.",
    limits:
      "This is a local planning notebook, not an advisory engagement, charity recommendation or tax, legal, investment or estate advice. It moves no money and submits nothing. Use a project alias and public sources; omit names, account balances, contact details and private financial records.",
    context: [
      text("name", "Plan title or project alias"),
      area("decision", "Decision to prepare and who has authority to decide"),
      area("values", "Values, moral lenses and disagreements to preserve"),
      area(
        "constraints",
        "Commitments, access needs, restrictions and nonnegotiable constraints",
      ),
      num(
        "amount",
        "Optional hypothetical planning amount; blank means unknown",
      ),
      text("currency", "Currency or planning unit", true),
      text("horizon", "Giving period and decision checkpoint"),
      area("privacy", "What may be recorded or shared, and when to delete it"),
      area(
        "conflicts",
        "Potential conflicts, referral interests and who must review them",
      ),
    ],
    sampleContext: {
      name: "Fictional giving discussion — demonstration only",
      decision:
        "Prepare alternatives for a hypothetical household discussion. No real donor, advisor or donation is involved.",
      values:
        "Explore welfare, rights, justice, care, faith and tradition, future generations, all life and flourishing. The fictional participants have not agreed on weights.",
      constraints:
        "Keep an existing hypothetical relief commitment visible; make no new payment promise. Ask what access or reporting demands an option would impose.",
      amount: "1000",
      currency: "Fictional currency units",
      horizon:
        "One illustrative giving period; agree the actual checkpoint before use.",
      privacy:
        "Use only a project alias and public evidence. Do not enter financial accounts, personal histories or contact details. Export and remove the example after exploring it.",
      conflicts:
        "No real advisor is engaged. Before seeking advice, ask about fees, commissions, referral incentives and connections to recipients.",
    },
    collections: [
      {
        key: "questions",
        label: "Intake and unresolved choices",
        singular: "intake question",
        description:
          "Start with what the donor wants to understand. A recorded answer is the user’s account, not independent verification or consent from other decision-makers.",
        fields: [
          text("title", "Question"),
          select("topic", "Topic", [
            "Values and disagreement",
            "Timing",
            "Near and far",
            "Restrictions and flexibility",
            "Decision authority",
            "Privacy and access",
            "Professional referral",
          ]),
          area("answer", "Current answer, including unknowns"),
          area("alternatives", "Other perspectives or choices still open"),
          area(
            "next",
            "What would resolve the question, and whose input is needed",
          ),
          workflow(),
        ],
        sample: [
          {
            title: "Fictional question: give now or retain flexibility?",
            topic: "Timing",
            answer:
              "The demonstration has no agreed timing. The amount is hypothetical and no obligation has been made.",
            alternatives:
              "Discuss an immediate gift, staged gifts and keeping an uncommitted reserve. Do not assume one timing rule fits every moral view or practical constraint.",
            next: "Ask the fictional decision-makers to state why they favor each option, what they might forgo and what would change their view.",
            status: "Draft",
          },
        ],
      },
      {
        key: "options",
        label: "Alternative giving scenarios",
        singular: "scenario",
        description:
          "Scenarios are alternatives, not allocations to add together. No score, optimal portfolio, payout rule or named-charity ranking is calculated.",
        fields: [
          text("title", "Scenario title"),
          area(
            "mechanism",
            "Proposed activity, who may benefit and how change might happen",
          ),
          depth(),
          text("place", "Near/far scope and reason for choosing it"),
          num(
            "amount",
            "Hypothetical amount for this scenario; blank means unknown",
          ),
          text("timing", "Timing and conditions before committing"),
          area("fit", "How it fits the stated values and constraints"),
          area(
            "tradeoffs",
            "What it displaces, possible harms and the strongest objection",
          ),
          area("unknowns", "Missing evidence and what could change the choice"),
          workflow(),
        ],
        sample: [
          {
            title: "Fictional scenario A: support immediate relief",
            mechanism:
              "An unnamed, hypothetical relief activity. No result, recipient or cost-effectiveness claim has been checked.",
            depth: "0 Relief",
            place:
              "Local scope in this example; record the donor’s reason rather than assuming proximity is enough.",
            amount: "1000",
            timing:
              "Illustrative gift this period, only after the donor’s own checks and approval.",
            fit: "A starting point for discussing care and immediate need, alongside the other moral lenses.",
            tradeoffs:
              "Would use the same hypothetical budget as scenario B. Ask whose needs remain outside the chosen scope.",
            unknowns:
              "Need a defined activity, public sources, a credible outcome account and a conversation about reporting burden.",
            status: "Needs evidence",
          },
          {
            title:
              "Fictional scenario B: investigate prevention before deciding",
            mechanism:
              "An unnamed prevention activity considered as an alternative to scenario A. This is a planning hypothesis.",
            depth: "2 Prevention",
            place:
              "Location open; compare relevant local and distant evidence before deciding.",
            amount: "1000",
            timing:
              "No gift commitment; set an evidence-search deadline before revisiting the choice.",
            fit: "Offers a discussion of future welfare, rights, justice and uncertainty. Prevention is not automatically better than relief.",
            tradeoffs:
              "Delay may forgo immediate benefits. An expected future benefit may not occur; record the rival case for acting now.",
            unknowns:
              "Need a causal mechanism, population, credible comparison and evidence about transfer to the proposed setting.",
            status: "Needs evidence",
          },
        ],
      },
      {
        key: "evidence",
        label: "Evidence and due-diligence questions",
        singular: "evidence note",
        description:
          "Attach a specific claim to its source and scope. A public report does not verify an entire organization. No private due-diligence files belong here.",
        fields: [
          text("title", "Claim or question"),
          text("scenario", "Related scenario"),
          source(),
          claimStatus(),
          area(
            "finding",
            "What the source supports, or what remains to be found",
          ),
          area(
            "limits",
            "Population, period, counterfactual, conflicts and transfer limits",
          ),
          date("checked", "Date you checked the source", true),
          area("next", "Next check or question for a qualified reviewer"),
        ],
        sample: [
          {
            title: "Fictional evidence task: define an outcome",
            scenario: "Both fictional scenarios",
            evidence: "Unknown or not checked",
            finding:
              "No evidence source is supplied by this demonstration. Do not present the sample as a funding recommendation.",
            limits:
              "An activity count alone would not establish what changed because of a gift. Ask what happens without the additional funding and whose perspective is missing.",
            next: "Find and read the relevant public primary source. Record what it actually supports and leave unanswered questions open.",
          },
        ],
      },
      {
        key: "followup",
        label: "Decisions and follow-up",
        singular: "decision checkpoint",
        description:
          "Record a decision in the user’s own words and how it will be revisited. “Recorded decision” is a local label; it is no payment authorization, advisor approval or external commitment.",
        fields: [
          text("title", "Decision or checkpoint"),
          area(
            "decision",
            "Choice, reasons and dissent; state explicitly if still undecided",
          ),
          area(
            "conditions",
            "Evidence or professional checks required before action",
          ),
          text("owner", "Responsible role, without a personal name"),
          date("date", "Next review date", true),
          area(
            "learning",
            "Feedback sought, possible unwanted effects and change/stop rule",
          ),
          workflow(),
        ],
        sample: [
          {
            title: "Fictional checkpoint: compare before committing",
            decision:
              "Undecided. Preserve both sample scenarios and the case for each; no money has moved.",
            conditions:
              "Resolve decision authority, privacy and conflicts. Refer any real tax, legal, investment or estate question to an appropriate qualified professional.",
            owner: "Giving-plan owner",
            learning:
              "Ask whether the process reflected the donor’s values and imposed proportionate requests on recipients. Revisit if evidence, constraints or affected people’s feedback changes.",
            status: "Draft",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Use the donor’s reasons",
        text: "Begin with the decision, values and constraints, then ask what a fair alternative would look like. Keep disagreement visible across welfare, rights, justice, care, faith and tradition, future generations, all life and flourishing. Depth describes the activity; it does not decide what the donor ought to value.",
      },
      {
        title: "Separate evidence from scenarios",
        text: "Read a source before recording a claim. Distinguish the effect of an intervention from the additional effect of this gift. Keep uncertain outcomes, restrictions, timing and opportunity costs visible. A scenario amount is a planning input, not a measured benefit or commitment.",
      },
      {
        title: "Prepare a discussion packet",
        text: "Export the context, questions, alternatives, evidence notes and follow-up together. Remove private information and check each factual statement before sharing. Ask a prospective advisor about independence, competence, fees, conflicts and the scope of their engagement.",
      },
      {
        title: "Return to the decision",
        text: "Record who may decide, what evidence is sufficient to act and when the choice will be reviewed. Seek feedback on whether the donor felt steered. The notebook can prepare that discussion; it cannot supply professional advice or consent on anyone’s behalf.",
      },
    ],
    readiness: [
      {
        title: "Qualified people and a defined engagement",
        reason:
          "A real service needs trained advisors, a legal home, clear responsibilities and appropriate qualified referrals for tax, legal, investment and estate questions.",
      },
      {
        title: "Independent funding and conflict rules",
        reason:
          "Publish fees, referral interests, commissions and other conflicts. Agree how advice remains independent before offering an engagement.",
      },
      {
        title: "Privacy, consent and challenge",
        reason:
          "Agree who may participate, what may be recorded, retention, access and how a donor can challenge advice without pressure.",
      },
      {
        title: "Protocol testing and public learning",
        reason:
          "The charter’s volunteer pilot, anonymized feedback and independent review remain work for actual partners. A completed notebook does not complete that pilot.",
      },
    ],
  },
  "nonprofit-advisory": {
    id: "nonprofit-advisory",
    title: "Build an organization learning plan",
    purpose:
      "Define a decision, diagnose evidence and full-cost gaps, plan proportionate improvements and record what would change the organization’s course.",
    limits:
      "This self-guided local workspace provides planning prompts, not a consulting engagement, financial audit, evaluation finding or certification. Enter role names and aggregate public information only. Do not enter beneficiary records, personnel details, medical information or confidential funder documents.",
    context: [
      text("name", "Project alias"),
      text(
        "activity",
        "Activity and population in scope, without personal details",
      ),
      area("decision", "Decision the learning plan must inform"),
      area("change", "Proposed change pathway, from resources to outcomes"),
      area("baseline", "What might happen without the activity or change"),
      area("capacity", "Staff time, skills, access and reporting constraints"),
      area(
        "voice",
        "How affected people could shape the questions and challenge conclusions",
      ),
      area("privacy", "Public-information boundary, access and retention plan"),
      text("period", "Planning period and review checkpoint"),
    ],
    sampleContext: {
      name: "Fictional community learning project — demonstration only",
      activity:
        "An unnamed, hypothetical community workshop activity. No organization or participant is described.",
      decision:
        "Decide whether a small hypothetical team should continue, change or stop an activity after a pilot.",
      change:
        "Resources support accessible workshops; participants may gain useful skills and use them later. Each link is a hypothesis in this example.",
      baseline:
        "Unknown. Participants may find other ways to learn, and wider changes may affect the same outcome.",
      capacity:
        "Plan only the smallest useful evidence check. No real staff capacity or evaluation budget has been agreed.",
      voice:
        "Before a real pilot, invite voluntary input in accessible formats and document who is missing without recording personal identities.",
      privacy:
        "This notebook contains fictional or aggregate public information only. Agree consent and secure data handling outside it before any data collection.",
      period: "One fictional pilot, with a review date to be agreed.",
    },
    collections: [
      {
        key: "diagnostics",
        label: "Diagnostic questions",
        singular: "diagnostic note",
        description:
          "Inspect the system around an activity. A gap in this notebook does not prove that an organization lacks the practice, and no organizational score is produced.",
        fields: [
          text("title", "Decision-relevant question"),
          select("area", "Area", [
            "Outcomes and causal pathway",
            "Evidence and comparison",
            "Full costs and capacity",
            "Voice and access",
            "Reporting burden",
            "Governance and incentives",
          ]),
          area("current", "Current practice and basis for describing it"),
          area("gap", "Unknowns, rival explanations or constraints"),
          area(
            "consequence",
            "How this affects the decision and who might bear the cost",
          ),
          depth(),
          workflow(),
        ],
        sample: [
          {
            title: "Fictional diagnostic: participation is not the outcome",
            area: "Outcomes and causal pathway",
            current:
              "The sample activity has only a proposed attendance count; no real observations exist.",
            gap: "Whether participants use a skill later is unknown. Attendance would not establish that the workshop caused a later change.",
            consequence:
              "Choosing expansion from attendance alone could miss accessibility barriers, alternative explanations and staff burden. Define the decision before requesting more data.",
            depth: "1 Repair",
            status: "Needs evidence",
          },
        ],
      },
      {
        key: "evidence",
        label: "Evidence and full-cost notebook",
        singular: "evidence note",
        description:
          "Keep effects, outputs and costs separate. Cost entries need a period, currency and allocation basis; overhead shares are not an outcome score.",
        fields: [
          text("title", "Evidence question or cost item"),
          select("type", "Record type", [
            "Outcome evidence",
            "Output description",
            "Cost or capacity assumption",
            "Feedback and access",
            "Rival explanation",
          ]),
          text("measure", "Measure, unit, denominator and period"),
          area("finding", "Finding or assumption, explicitly stating unknowns"),
          source(),
          claimStatus(),
          area(
            "method",
            "Source, comparison or allocation method; whose time and costs count",
          ),
          area(
            "limits",
            "Missing costs, bias, consent and limits on interpretation",
          ),
          date("checked", "Source checked on", true),
        ],
        sample: [
          {
            title: "Fictional cost note: make support time visible",
            type: "Cost or capacity assumption",
            measure:
              "Staff hours per fictional workshop, including preparation, access support, delivery and follow-up; amount unknown.",
            finding:
              "No time or cost estimate has been measured. Do not substitute zero for the missing amount.",
            evidence: "Hypothesis",
            method:
              "Ask which resources the decision changes and which shared resources it relies on. State a period and transparent allocation basis before comparing costs.",
            limits:
              "Staff estimates, volunteer time, shared systems and evaluation burden remain unknown. No financial statement or audit is implied.",
          },
        ],
      },
      {
        key: "actions",
        label: "Proportionate action plan",
        singular: "action",
        description:
          "Choose changes that serve a stated decision. Record the burden and an observable completion criterion; a local “Done” label is not an independent sign-off.",
        fields: [
          text("title", "Action"),
          text("diagnostic", "Diagnostic question addressed"),
          text("owner", "Responsible role"),
          date("date", "Review date", true),
          area(
            "steps",
            "Smallest feasible next step, dependencies and support needed",
          ),
          area(
            "burden",
            "Time, cost, access and reporting burden; what will be stopped to make room",
          ),
          area("complete", "Completion evidence and who should review it"),
          select("status", "Task status", [
            "To do",
            "In progress",
            "Blocked",
            "Done",
          ]),
        ],
        sample: [
          {
            title: "Fictional action: agree one useful learning question",
            diagnostic:
              "Fictional diagnostic: participation is not the outcome",
            owner: "Program and learning roles",
            steps:
              "Draft an outcome question and discuss whether it would change a real decision. Ask affected people what matters and what would be burdensome before choosing a method.",
            burden:
              "No collection request is authorized. Set a realistic staff-time limit and remove a lower-priority reporting request if needed.",
            complete:
              "A written decision question, an agreed outcome definition and documented unresolved views. Review by the team and relevant community representatives is still needed.",
            status: "To do",
          },
        ],
      },
      {
        key: "learning",
        label: "Learning and adaptation checkpoints",
        singular: "learning checkpoint",
        description:
          "Plan what evidence would support continuing, adapting or stopping. Before/after differences and positive feedback alone do not establish causation.",
        fields: [
          text("title", "Learning decision"),
          text("outcome", "Outcome, population, unit and time horizon"),
          area(
            "method",
            "Proportionate method, comparison and alternative explanations",
          ),
          area(
            "rule",
            "What would support continuing, changing or stopping; how uncertainty affects the rule",
          ),
          area(
            "feedback",
            "How aggregate feedback, disagreement and possible harm will be considered",
          ),
          area("result", "What is known now, and the next question"),
          date("date", "Review date", true),
          workflow(),
        ],
        sample: [
          {
            title: "Fictional checkpoint: usefulness after the workshop",
            outcome:
              "Use of a self-selected skill after a hypothetical workshop; population and follow-up period remain to be agreed.",
            method:
              "First check whether existing research can inform the decision. If collecting feedback is justified, agree voluntary access, comparison limits and data handling before proceeding.",
            rule: "Undecided. Set feasible thresholds with the team and affected people before looking at results; include a way to respond to harm or exclusion.",
            feedback:
              "Seek criticism as well as positive accounts. Record whose voice is missing and avoid implying that silence means satisfaction.",
            result:
              "No pilot, participant feedback or outcome measurement has occurred in this demonstration.",
            status: "Draft",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Begin with the decision",
        text: "Describe the activity and what a learning exercise would change. Distinguish resources, outputs, outcomes and the additional change caused by the work. A depth hypothesis describes the mechanism and is open to correction; it is not a grade for the organization.",
      },
      {
        title: "Choose proportionate evidence",
        text: "Look for relevant existing evidence before designing new collection. State population, period, comparison and transfer limits. Ask whether a modest check is enough for the decision or whether an evaluation partner is needed. Keep an unresolved question open rather than manufacturing a result.",
      },
      {
        title: "Show full costs and practical limits",
        text: "Describe the staff, systems, access support and shared resources that delivery depends on. Explain which costs change with the decision and how shared costs are allocated. Do not use an overhead ratio as a substitute for outcomes, or hide the burden of evaluation itself.",
      },
      {
        title: "Learn with the people affected",
        text: "Agree accessible participation, consent, safe criticism and a response process before gathering information. Export a plan for review, record disagreement and describe what would prompt adaptation. Do not place identifiable feedback or private organizational records in this browser workspace.",
      },
    ],
    readiness: [
      {
        title: "Advisors and evaluation partners",
        reason:
          "An operating service needs people with relevant methods, context and facilitation skills, with explicit limits on what they can conclude.",
      },
      {
        title: "Independent funding and ownership",
        reason:
          "Agree who funds the work, who owns the outputs and how organizations can challenge advice without pressure from advisors or funders.",
      },
      {
        title: "Capacity and safeguards",
        reason:
          "Agree proportionate staff time, accessible participation, consent, data protection and escalation before any real evaluation or feedback collection.",
      },
      {
        title: "Test the self-guided method",
        reason:
          "The charter’s trial with five small nonprofits and publication of learning require real voluntary partners and review. Loading a fictional example does not conduct that trial.",
      },
    ],
  },
  "field-verification": {
    id: "field-verification",
    title: "Prepare a field-verification protocol",
    purpose:
      "Specify what could be checked, where a conclusion would apply, what safeguards are unresolved and how findings, responses and corrective actions would be handled.",
    limits:
      "This is protocol-writing software. Charitology has conducted no field visit, interview, audit or independent verification through this workspace. User-entered findings are unverified notes. Do not collect or enter personal data, site coordinates, contact details, participant accounts or confidential documents here. A completed plan is not permission to do fieldwork.",
    context: [
      text("name", "Protocol title and version"),
      area("question", "Reported claim and verification question"),
      area(
        "scope",
        "Site types, period and boundaries; omit identifying locations",
      ),
      area(
        "sampling",
        "Sampling frame, selection rule, exclusions and limits of coverage",
      ),
      area(
        "method",
        "Checks, comparison sources and what they could establish",
      ),
      area(
        "independence",
        "Local partner roles, funding, conflicts and independence",
      ),
      area(
        "consent",
        "Consent, access, ethics review and stop conditions still required",
      ),
      area(
        "publication",
        "Aggregate publication, correction, right of response and retention plan",
      ),
      workflow(),
    ],
    sampleContext: {
      name: "Fictional service-access protocol v0.1 — no fieldwork",
      question:
        "Could a hypothetical program’s statement that a service is available during published hours be checked? No real program or claim is described.",
      scope:
        "Unnamed service-site types during an illustrative period. No site list, coordinates or personal data are included.",
      sampling:
        "Not approved. Define the full eligible site frame, selection method, nonresponse and exclusions with a local partner. A convenient visit would not establish system-wide coverage.",
      method:
        "Draft a comparison between public service descriptions and an agreed, nonintrusive check. A visit could describe that visit; it would not by itself show long-term effects.",
      independence:
        "No partner, funding or independent verifier has been engaged. Agree fair pay, competence, conflicts and community oversight before a pilot.",
      consent:
        "No access, interview, consent or ethics review is authorized. Resolve safety, consent, private feedback channels and stop rules before approaching anyone.",
      publication:
        "Only a fictional draft exists. Agree aggregation, small-group disclosure risks, response time, correction routes, access controls and deletion before collecting any real information.",
      status: "Draft",
    },
    collections: [
      {
        key: "checks",
        label: "Claim and evidence checklist",
        singular: "planned check",
        description:
          "A check must state both what it could establish and what remains outside its reach. No checklist entry means an actual site has been visited or a claim verified.",
        fields: [
          text("title", "Check identifier and title"),
          area("claim", "Specific reported claim, unit and period"),
          source(),
          area("method", "Evidence sought and how it would be checked"),
          area(
            "sampling",
            "Eligible sites, selection rule, exclusions and nonresponse",
          ),
          area(
            "limits",
            "What this check could not establish; rival explanations",
          ),
          area(
            "stop",
            "Access, consent or safety condition that stops the check",
          ),
          select("status", "Check state", [
            "Planned only",
            "Blocked pending safeguards",
            "User note entered — unverified",
            "Needs further check",
            "Closed locally",
          ]),
        ],
        sample: [
          {
            title: "Fictional C-01: availability claim — planned only",
            claim:
              "A hypothetical service is available during its published hours. There is no real source or period yet.",
            method:
              "Read the public claim, agree an observation method with a local partner and compare sources. Record failed access and uncertainty, not just completed checks.",
            sampling:
              "No eligible-site frame or sample has been agreed. Do not generalize from an accessible site.",
            limits:
              "A single observation would not establish usual availability, service quality, causal outcomes or participant experience.",
            stop: "Stop if access is unauthorized, consent is unclear, safety is uncertain or the check could expose people. A qualified local partner must resolve the protocol first.",
            status: "Blocked pending safeguards",
          },
        ],
      },
      {
        key: "findings",
        label: "Findings and uncertainty log",
        singular: "finding note",
        description:
          "Use aggregate, nonidentifying notes only. “User note entered” is never an independent finding by Charitology. Keep observations, reported accounts and interpretations separate.",
        fields: [
          text("title", "Finding identifier and title"),
          text("check", "Related check identifier"),
          select("kind", "Basis", [
            "No observation — planning example",
            "Aggregate user-entered observation",
            "Public document comparison",
            "Conflicting sources",
            "Unable to check",
          ]),
          area(
            "observed",
            "What was observed or found; explicitly state if nothing was checked",
          ),
          area(
            "interpretation",
            "Interpretation, competing explanations and confidence limits",
          ),
          area(
            "coverage",
            "Scope, missingness and who or what is not represented",
          ),
          source(),
          date("date", "Observation or source-check date", true),
          select("status", "Review state", [
            "Draft — unverified",
            "Needs evidence",
            "Awaiting response",
            "Ready for discussion",
            "Closed locally",
          ]),
        ],
        sample: [
          {
            title: "Fictional F-01: no finding yet",
            check: "Fictional C-01",
            kind: "No observation — planning example",
            observed:
              "No visit, interview or document check occurred. This row shows how an uncertainty log could be structured.",
            interpretation:
              "There is no basis to accept or reject the hypothetical claim.",
            coverage:
              "No observations or population coverage. Do not turn an empty log into a conclusion about a real program.",
            status: "Draft — unverified",
          },
        ],
      },
      {
        key: "safeguards",
        label: "Safeguards and unresolved permissions",
        singular: "safeguard",
        description:
          "This log prepares a review. Marking a safeguard complete records the user’s statement; it does not supply ethical approval, lawful authority, informed consent or safety clearance.",
        fields: [
          text("title", "Risk or permission to resolve"),
          area(
            "risk",
            "Who could bear a burden or face harm; use no identifying detail",
          ),
          area(
            "control",
            "Preventive measure, accessible alternative and escalation route",
          ),
          area("stop", "Stop rule and who may invoke it without penalty"),
          text("owner", "Responsible qualified role"),
          area(
            "evidence",
            "Evidence of review or why it remains unresolved; no confidential attachments",
          ),
          select("status", "Safeguard state", [
            "Unresolved — do not proceed",
            "Under review",
            "User records a resolution",
            "Needs recheck",
          ]),
        ],
        sample: [
          {
            title: "Fictional safeguard: private and voluntary feedback",
            risk: "People could feel that criticism threatens access to a service. No real participants have been approached.",
            control:
              "A local partner must agree voluntary, accessible participation and a safe way to decline or criticize. This notebook is not a channel for identifiable accounts.",
            stop: "Stop if voluntary participation or protection from retaliation is uncertain; any participant must be able to decline without penalty.",
            owner: "Local safeguarding and ethics review roles",
            evidence:
              "Unresolved. No ethics review, access agreement or consent procedure is in place for this fictional demonstration.",
            status: "Unresolved — do not proceed",
          },
        ],
      },
      {
        key: "responses",
        label: "Response and correction log",
        singular: "response note",
        description:
          "Plan a fair opportunity to respond and correct errors. Enter only public or explicitly shareable aggregate text; this software does not contact anyone or publish a response.",
        fields: [
          text("title", "Response or correction identifier"),
          text("finding", "Related finding identifier"),
          area(
            "question",
            "Claim, uncertainty or correction to put to the relevant role",
          ),
          area(
            "response",
            "Public/shareable response, or explicit statement that none has been sought",
          ),
          area(
            "provenance",
            "How the response is attributed and permission to quote checked; no private identities",
          ),
          area(
            "change",
            "What changes, what remains disputed and what could resolve it",
          ),
          date("date", "Agreed response checkpoint", true),
          select("status", "Response state", [
            "Not sought",
            "Planned",
            "User-entered response — unverified",
            "Correction pending",
            "Closed locally",
          ]),
        ],
        sample: [
          {
            title: "Fictional R-01: agree a response process first",
            finding: "Fictional F-01",
            question:
              "Before a real check, agree how a draft summary, uncertainty and potential errors would be shared for response.",
            response:
              "No response sought or received. No real organization has been contacted.",
            provenance:
              "No quotation or permission exists. Do not infer endorsement from a planned response step.",
            change:
              "Keep the original claim, evidence, correction and disagreement distinguishable. Silence would not mean agreement.",
            status: "Not sought",
          },
        ],
      },
      {
        key: "actions",
        label: "Corrective actions and rechecks",
        singular: "action",
        description:
          "Track a proposed change, the role responsible and the evidence needed to close it. No external task, reminder, enforcement or follow-up visit is created.",
        fields: taskFields,
        sample: [
          {
            title:
              "Fictional action: obtain local protocol review before any pilot",
            owner: "Protocol owner and local research partner",
            status: "Blocked",
            notes:
              "No partner has been engaged. Review the sampling frame, consent, safety, compensation, response process and publication risks. A browser record cannot authorize fieldwork.",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Bound the claim",
        text: "Write the exact claim, unit, population, period and evidence needed. State which sites could be selected, why any are excluded and what nonresponse would mean. Describe whether a check concerns delivery, availability, participant experience or outcomes; these are different questions.",
      },
      {
        title: "Design with local partners",
        text: "A real check needs appropriately qualified local researchers and community participation in the questions, access and interpretation. Agree fair pay, independence, conflicts, consent, ethics review, safety and the right to decline before any contact or collection.",
      },
      {
        title: "Keep evidence and conclusions separate",
        text: "Document what happened, what could not be checked, missing perspectives and competing explanations. A visit is not automatically a causal evaluation, and a small or convenient sample cannot support a broad coverage claim. Keep depth descriptions separate from quality judgments.",
      },
      {
        title: "Close a feedback loop carefully",
        text: "Agree how organizations and affected people can review errors or respond without exposing private information. Publish only an appropriate aggregate account with uncertainty, disagreement and corrections. Define a feasible corrective action and recheck, including who can challenge closure.",
      },
    ],
    readiness: [
      {
        title: "Local leadership and funding",
        reason:
          "An actual pilot requires funded local research partners, appropriate competence, fair compensation and community involvement in the protocol.",
      },
      {
        title: "Ethics, consent and safety",
        reason:
          "Resolve applicable review, permissions, voluntary participation, safeguarding and stop rules before any visit, interview or data collection.",
      },
      {
        title: "Independence and data governance",
        reason:
          "Agree conflicts, access, secure data handling, aggregation, retention and how small-group disclosure risks will be reviewed. This browser notebook cannot hold participant records.",
      },
      {
        title: "Response, correction and follow-up",
        reason:
          "Agree a fair response process, public correction route and accountable rechecks before promising an independent report. No field audit has been conducted by publishing this software.",
      },
    ],
  },
};
