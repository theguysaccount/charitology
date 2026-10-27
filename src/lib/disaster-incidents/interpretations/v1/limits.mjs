/** Immutable bounded-issuer-note-v1 admission constants. */
export const LIMITS = Object.freeze({
  incidentIdentities: 20,
  incidents: 100,
  sources: 100,
  claims: 500,
  methods: 4,
  editions: 20,
  notes: 100,
  record: 65536,
  edition: 262144,
  registry: 262144,
  method: 32768,
  note: 8192,
  manifest: 8192,
  original: 8388608,
  originals: 33554432,
  prepared: 134217728,
  request: 8192,
  proposal: 524288,
  journal: 524288,
  closure: 4194304,
  core: 16777216,
  packet: 8388608,
  csv: 8388608,
  history: 25165824,
  derived: 67108864,
  public: 83886080,
  depth: 32,
  nodes: 200000,
  coreFiles: 845,
  derivedFiles: 60,
  files: 905,
});
export const HAZARDS = Object.freeze([
  "wildfire",
  "earthquake",
  "flood",
  "storm",
  "drought",
  "other",
  "unclassified",
]);
export const SECTORS = Object.freeze([
  "shelter",
  "water-sanitation",
  "food",
  "health",
  "livelihoods",
  "protection",
  "infrastructure",
  "other",
  "unclassified",
]);
export const ROLES = Object.freeze([
  "identity",
  "statement",
  "period",
  "geography",
  "status",
  "rights",
  "date-discrepancy",
  "access",
]);
export const DESCRIPTORS = Object.freeze({
  "maui-projects": "https://www.mauirecovers.org/recoveryprojects",
  "maui-home": "https://mauirecovers.org/",
  "maui-terms": "https://mauirecovers.org/termsandconditions",
  "ifrc-mdrtr004-final":
    "https://go-api.ifrc.org/api/DownloadFile/83904/MDRTR004far",
});
export const QUALIFIER =
  "Device-clock display only; not a verified current-time or source check.";
export const PACKET_LIMITATIONS = Object.freeze([
  "Selected factual closure only; predecessor, omitted-member and change-reference boundary pins are external provenance, not evidence or a restorable history.",
  "Original HTML/PDF/JSON bodies and private planner values are excluded.",
]);
