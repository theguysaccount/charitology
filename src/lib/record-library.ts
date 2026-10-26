// A common, evidence-preserving view model for the Record's reference bases.
// It reuses published entries and never computes scores or charity rankings.
import { getCollection } from "astro:content";
import { CASE_KIND, VERDICT, depthName } from "./labels";
import { hrefFor } from "./content";
import causes from "../data/causes.json";
import ecosystem from "../data/ecosystem.json";

export interface RecordSource {
  title: string;
  url: string;
  publisher?: string;
  year?: string | number;
  note?: string;
}
export interface RecordField {
  label: string;
  values: string[];
}
export interface ReferenceRecord {
  id: string;
  title: string;
  href: string;
  summary: string;
  body: string;
  review: "draft" | "reviewed";
  facets: Record<string, string[]>;
  fields: RecordField[];
  sources: RecordSource[];
  links: { label: string; href: string }[];
}
export interface RecordFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}
export interface ReferenceLibrary {
  id: string;
  title: string;
  entries: ReferenceRecord[];
  filters: RecordFilter[];
  notice: string;
  compare: boolean;
  related: { label: string; href: string }[];
}
export type ReferenceKind =
  | "encyclopedia"
  | "charity-index"
  | "interventions"
  | "case-studies"
  | "failure-archive"
  | "disagreements"
  | "traditions"
  | "myths";
const field = (
  label: string,
  value: string | string[] | undefined,
): RecordField => ({
  label,
  values: (Array.isArray(value) ? value : [value ?? "Unknown"]).filter(Boolean),
});
const reviewLabel = (value: string) =>
  value === "reviewed"
    ? "Reviewed by a contributor"
    : "Draft: human review pending";
const depthLabel = (value: string) => `${value} · ${depthName(Number(value))}`;
const uniqueSources = (list: RecordSource[]) => [
  ...new Map(list.map((source) => [source.url, source])).values(),
];

export async function buildReferenceLibrary(
  kind: ReferenceKind,
): Promise<ReferenceLibrary> {
  const conditions = new Map(
    (await getCollection("conditions")).map((entry) => [
      entry.id,
      entry.data.title,
    ]),
  );
  const causeNames = new Map(
    causes.causes.map((cause) => [cause.id, cause.name]),
  );
  const topicValues = (entry: any) =>
    (entry.data.conditions ?? []).map(
      (ref: any) => conditions.get(ref.id) ?? ref.id,
    );
  const base = (entry: any, collection: any): ReferenceRecord => ({
    id: entry.id,
    title: entry.data.title ?? entry.data.name,
    href: hrefFor(collection, entry.id),
    summary: entry.data.summary,
    body: entry.body ?? "",
    review: entry.data.review,
    facets: {
      review: [entry.data.review],
      topics: topicValues(entry),
      sources: [(entry.data.sources ?? []).length ? "cited" : "missing"],
    },
    fields: [],
    sources: uniqueSources(entry.data.sources ?? []),
    links: [],
  });
  let entries: ReferenceRecord[] = [];
  let filters: [string, string, ((value: string) => string)?][] = [];
  let title = "",
    notice = "",
    related: ReferenceLibrary["related"] = [];
  if (kind === "encyclopedia") {
    title = "Encyclopedia research shelf";
    entries = (await getCollection("encyclopedia")).map((entry) => {
      const item = base(entry, "encyclopedia");
      item.fields = [
        field(
          "Also called",
          entry.data.aliases.length
            ? entry.data.aliases
            : ["No aliases listed"],
        ),
        field(
          "System conditions",
          topicValues(entry).length
            ? topicValues(entry)
            : ["No condition linked"],
        ),
      ];
      item.facets.publisher = item.sources.map(
        (source) => source.publisher ?? "Publisher not recorded",
      );
      return item;
    });
    filters = [
      ["topics", "System condition"],
      ["review", "Review status", reviewLabel],
      [
        "sources",
        "Source record",
        (value) => (value === "cited" ? "Sources cited" : "No sources cited"),
      ],
    ];
    notice =
      "This is a working set of concepts, not a complete encyclopedia. The review label records editorial review; the number of sources is not a measure of evidence quality.";
    related = [
      { label: "Short definitions in the Lexicon", href: "/record/lexicon/" },
      { label: "Read the textbook", href: "/record/principles/" },
      { label: "Find open research questions", href: "/open-problems/" },
    ];
  } else if (kind === "charity-index") {
    title = "Charity Index research shelf";
    const interventions = new Map(
      (await getCollection("interventions")).map((entry) => [
        entry.id,
        entry.data.title,
      ]),
    );
    const propublica = ecosystem.registries.find((registry) =>
      registry.name.startsWith("ProPublica"),
    );
    const whofunds = ecosystem.registries.find((registry) =>
      registry.name.startsWith("WHOFUNDS"),
    );
    entries = (await getCollection("charities")).map((entry) => {
      const item = base(entry, "charities");
      item.facets.depth = [String(entry.data.depth)];
      item.facets.causes = entry.data.causes.map(
        (cause) => causeNames.get(cause) ?? cause,
      );
      item.fields = [
        field("Depth hypothesis", depthLabel(String(entry.data.depth))),
        field("Cause areas", item.facets.causes),
        field(
          "Classification note",
          entry.data.note ??
            "Read the cited description of the organization’s work and challenge the hypothesis if it does not fit.",
        ),
      ];
      item.links = [
        { label: "Organization website", href: entry.data.website },
        ...(propublica?.search
          ? [
              {
                label: "Search public filings",
                href: propublica.search + encodeURIComponent(entry.data.name),
              },
            ]
          : []),
        ...(whofunds?.search
          ? [
              {
                label: "Search reported funders",
                href: whofunds.search + encodeURIComponent(entry.data.name),
              },
            ]
          : []),
        ...entry.data.interventions.map((ref) => ({
          label: interventions.get(ref.id) ?? ref.id,
          href: hrefFor("interventions", ref.id),
        })),
      ];
      return item;
    });
    filters = [
      ["causes", "Cause area"],
      ["depth", "Depth hypothesis", depthLabel],
      ["review", "Review status", reviewLabel],
    ];
    notice =
      "Every depth classification is a hypothesis about the organization’s described work, not a rating, recommendation or test of effectiveness. One organization can work at several depths. Every level is needed. This small collection is not a worldwide census.";
    related = [
      { label: "Search the open registries", href: "/tools/charity-lookup/" },
      { label: "How depth is described", href: "/method/#depth" },
      {
        label: "Build a due diligence checklist",
        href: "/tools/due-diligence-checklist/",
      },
    ];
  } else if (kind === "interventions") {
    title = "Intervention research shelf";
    entries = (await getCollection("interventions")).map((entry) => {
      const item = base(entry, "interventions");
      const data = entry.data;
      item.facets = {
        ...item.facets,
        depth: [String(data.depth)],
        evidence: [data.evidence],
        causes: data.causes.map((cause) => causeNames.get(cause) ?? cause),
        cost: [data.cost ? "recorded" : "missing"],
        time: [data.timeToEffect],
      };
      const cost = data.cost
        ? `US$${data.cost.low.toLocaleString("en-US")}–${data.cost.high.toLocaleString("en-US")} per ${data.cost.outcome}`
        : "Not recorded. Unknown is not zero.";
      item.fields = [
        field("Depth", depthLabel(String(data.depth))),
        field("Evidence grade", data.evidence),
        field("Mechanism", data.mechanism),
        field("Time to effect", data.timeToEffect),
        field("Durability", data.durability),
        field("Feedback", data.feedback),
        field("Agency", data.agency),
        field("Cost estimate", cost),
        field(
          "Estimate context",
          data.cost
            ? [
                data.cost.asOf,
                data.cost.note ??
                  "Read the source for the estimate’s assumptions.",
              ]
            : ["No comparable cost estimate is recorded."],
        ),
      ];
      if (data.cost)
        item.sources = uniqueSources([...item.sources, data.cost.source]);
      item.links = [
        { label: "Use the Compare Tool", href: "/tools/compare-tool/" },
        {
          label: "Inspect a cost-effectiveness model",
          href: "/tools/cost-effectiveness-model-kit/",
        },
      ];
      return item;
    });
    filters = [
      ["causes", "Cause area"],
      ["depth", "Depth", depthLabel],
      ["evidence", "Evidence grade"],
      ["time", "Time to effect"],
      [
        "cost",
        "Cost data",
        (value) =>
          value === "recorded" ? "Estimate recorded" : "No estimate recorded",
      ],
      ["review", "Review status", reviewLabel],
    ];
    notice =
      "Grades summarize the cited evidence in each entry; they are not an independent review. Cost estimates can use different outcomes, places, years and models. Do not divide, rank or compare their amounts as though those units were interchangeable. Depth describes where work acts; it never grades it.";
    related = [
      {
        label: "Model your assumptions",
        href: "/tools/cost-effectiveness-model-kit/",
      },
      {
        label: "Read disagreements about evidence",
        href: "/record/disagreements/",
      },
      { label: "The measurement gap", href: "/diagnosis/measurement-gap/" },
    ];
  } else if (kind === "case-studies" || kind === "failure-archive") {
    const failure = kind === "failure-archive";
    title = failure
      ? "Failure and mixed-results research shelf"
      : "Historical case research shelf";
    entries = (await getCollection("cases"))
      .filter((entry) => !failure || entry.data.kind !== "success")
      .map((entry) => {
        const item = base(entry, "cases");
        item.facets = {
          ...item.facets,
          outcome: [entry.data.kind],
          depth: [String(entry.data.depth)],
          place: [entry.data.place],
        };
        item.fields = [
          field("Recorded result", CASE_KIND[entry.data.kind]),
          field("Place", entry.data.place),
          field("Period", entry.data.era),
          field("Depth", depthLabel(String(entry.data.depth))),
          field("Lessons stated in the entry", entry.data.lessons),
        ];
        return item;
      });
    filters = [
      [
        "outcome",
        "Recorded result",
        (value) => CASE_KIND[value as keyof typeof CASE_KIND],
      ],
      ["depth", "Depth", depthLabel],
      ["place", "Place"],
      ["review", "Review status", reviewLabel],
    ];
    notice = failure
      ? "These are published failures and mixed results, not a list of bad organizations. Result labels summarize a case, not everyone involved. Read the setting, evidence and response before transferring a lesson elsewhere."
      : "Historical cases record particular settings, periods and results. Their lessons are starting points for inquiry, not proof that the same approach will work elsewhere. The labels describe cases, not the worth of the people or organizations involved.";
    related = [
      {
        label: failure
          ? "Read every historical case"
          : "Read failures and mixed results",
        href: failure ? "/record/case-studies/" : "/record/failure-archive/",
      },
      {
        label: "What would show the work is failing?",
        href: "/tools/impact-measurement-toolkit/",
      },
      {
        label: "Open problem: when charity harms",
        href: "/open-problems/when-charity-harms/",
      },
    ];
  } else if (kind === "disagreements") {
    title = "Disagreement research shelf";
    entries = (await getCollection("disagreements")).map((entry) => {
      const item = base(entry, "disagreements");
      item.facets.status = [entry.data.status];
      item.fields = [
        field("Debate status", entry.data.status),
        field(
          "Positions covered",
          entry.data.positions.map((position) => position.name),
        ),
        field(
          "Positions in this entry",
          entry.data.positions.map(
            (position) => `${position.name}: ${position.claim}`,
          ),
        ),
        field("Cruxes that could change minds", entry.data.cruxes),
      ];
      return item;
    });
    filters = [
      ["status", "Debate status"],
      ["topics", "System condition"],
      ["review", "Review status", reviewLabel],
    ];
    notice =
      "Positions are summaries of arguments, not endorsements. A crux is a fact or value judgment that could change a conclusion. A debate’s status is separate from whether this entry has received human source review.";
    related = [
      { label: "Moral frameworks", href: "/method/#frameworks" },
      { label: "Study the evidence", href: "/record/evidence-library/" },
      { label: "Challenge an unresolved question", href: "/open-problems/" },
    ];
  } else if (kind === "traditions") {
    title = "Giving traditions research shelf";
    entries = (await getCollection("traditions")).map((entry) => {
      const item = base(entry, "traditions");
      item.facets.tradition = [entry.data.tradition];
      item.fields = [
        field("Tradition covered", entry.data.tradition),
        field("Origin described", entry.data.origin),
        field("Practice described", entry.data.practice),
        field("Interpretive lens", entry.data.lens),
      ];
      return item;
    });
    filters = [
      ["tradition", "Tradition covered"],
      ["review", "Review status", reviewLabel],
    ];
    notice =
      "These entries describe particular sources and practices, not every person or school within a tradition. The source lens is Charitology’s interpretation. It should be questioned and improved with people who practice the tradition; traditions are not ranked.";
    related = [
      { label: "Explore your own values", href: "/tools/values-compass/" },
      { label: "Read the moral frameworks", href: "/method/#frameworks" },
      { label: "Compare disputed questions", href: "/record/disagreements/" },
    ];
  } else {
    title = "Giving beliefs research shelf";
    entries = (await getCollection("myths")).map((entry) => {
      const item = base(entry, "myths");
      item.facets.verdict = [entry.data.verdict];
      item.fields = [
        field("Editorial verdict", VERDICT[entry.data.verdict]),
        field("Related system conditions", topicValues(entry)),
      ];
      return item;
    });
    filters = [
      [
        "verdict",
        "Editorial verdict",
        (value) => VERDICT[value as keyof typeof VERDICT],
      ],
      ["topics", "System condition"],
      ["review", "Review status", reviewLabel],
    ];
    notice =
      "A verdict applies to the belief as worded in its entry, not to people who hold it. Read what is true in the belief, its limits and the cited evidence. Editorial review status remains separate from the verdict.";
    related = [
      { label: "The Giver’s Checklist", href: "/method/#checklist" },
      { label: "Look at disputed evidence", href: "/record/disagreements/" },
      { label: "Read the Diagnosis", href: "/diagnosis/" },
    ];
  }
  entries.sort((a, b) => a.title.localeCompare(b.title));
  return {
    id: kind,
    title,
    entries,
    notice,
    compare: kind === "interventions",
    related,
    filters: filters.map(([key, label, format]) => ({
      key,
      label,
      options: [...new Set(entries.flatMap((entry) => entry.facets[key] ?? []))]
        .sort((a, b) =>
          key === "depth" ? Number(a) - Number(b) : a.localeCompare(b),
        )
        .map((value) => ({
          value,
          label: format
            ? format(value)
            : value.charAt(0).toUpperCase() + value.slice(1),
        })),
    })),
  };
}
