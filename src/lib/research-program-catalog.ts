import { getCollection } from "astro:content";
export async function researchProgramCatalog() {
  const [cases, interventions] = await Promise.all([
    getCollection("cases"),
    getCollection("interventions"),
  ]);
  return {
    cases: cases.map((entry) => ({
      id: entry.id,
      title: entry.data.title,
      summary: entry.data.summary,
      kind: entry.data.kind,
      era: entry.data.era,
      place: entry.data.place,
      depth: entry.data.depth,
      lessons: entry.data.lessons,
      sources: entry.data.sources,
      review: entry.data.review,
      href: `/record/case-studies/${entry.id}/`,
    })),
    interventions: interventions.map((entry) => ({
      id: entry.id,
      title: entry.data.title,
      summary: entry.data.summary,
      depth: entry.data.depth,
      evidence: entry.data.evidence,
      causes: entry.data.causes,
      mechanism: entry.data.mechanism,
      sources: entry.data.sources,
      review: entry.data.review,
      href: `/record/interventions/${entry.id}/`,
    })),
  };
}
