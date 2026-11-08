/** Fixed labels shared only by Node interpretation and build presentation. */
export const PLAN_CLUSTER_PERIOD_LABEL = "Afghanistan Humanitarian Needs and Response Plan 2024 — Education";
export const PLAN_CLUSTER_UNKNOWN_REMAINDER = "Only this Afghanistan 2024 Education plan cluster is selected; other causes, countries, plans, shared/unspecified funding and years are outside this coverage.";
export const PLAN_CLUSTER_IDENTITY_COLUMNS = Object.freeze(["countryCode","id","code","year","clusterCode","cluster","startDate","endDate"]);
export const PLAN_CLUSTER_MEASURES = Object.freeze({
  requirements:Object.freeze({label:"Education plan requirements (USD)",definition:"Published requirements for the Education cluster of Afghanistan HNRP2024, not all education spending or independently measured need.",method:"Exact original requirements column of the selected OCHA FTS plan-cluster CSV row; source scope, reporting completeness and USD price/FX basis remain limited or unknown."}),
  funding:Object.freeze({label:"Reported Education plan funding (USD)",definition:"OCHA FTS reported funding attributed to the Education cluster of Afghanistan HNRP2024, not asserted to be cash paid, final spending or money reaching people.",method:"Exact original funding column of the same selected OCHA FTS plan-cluster CSV row; financial-stage decomposition, reporting completeness and USD price/FX basis remain unknown."}),
});
export const PLAN_CLUSTER_METADATA_URL = "https://data.humdata.org/api/3/action/package_show?id=b2bbb33c-2cfb-4809-8dd3-6bbdc080cbb9";
export const PLAN_CLUSTER_EXCERPT_NOTICE = "Changes: selected exact JSON field values are quoted with their original JSON paths; the complete private JSON response is not redistributed here. This excerpt records licensing evidence, not a license for the entire metadata wrapper.";
