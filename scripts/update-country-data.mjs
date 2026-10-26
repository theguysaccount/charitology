// Reproducible World Bank snapshot. Network access is explicit, never part of build.
import { writeFile } from "node:fs/promises";
const indicatorDefinitions = [
  [
    "SP.POP.TOTL",
    "Population",
    "people",
    "The number of residents; not a measure of need.",
  ],
  [
    "SP.DYN.LE00.IN",
    "Life expectancy at birth",
    "years",
    "A period estimate based on mortality patterns; not a prediction for an individual.",
  ],
  [
    "SH.DYN.MORT",
    "Under-five mortality",
    "per 1,000 live births",
    "A population rate, not the number of children who died.",
  ],
  [
    "EG.ELC.ACCS.ZS",
    "Access to electricity",
    "% of population",
    "Access does not establish reliability or affordability.",
  ],
  [
    "SH.H2O.BASW.ZS",
    "At least basic drinking water",
    "% of population",
    "Basic service is not the same as safely managed water.",
  ],
];
async function read(path) {
  const url = `https://api.worldbank.org/v2/${path}${path.includes("?") ? "&" : "?"}format=json&per_page=20000`;
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const body = await response.json();
  if (!Array.isArray(body) || !Array.isArray(body[1]) || body[0].pages > 1)
    throw new Error(`Incomplete response: ${url}`);
  return { url, meta: body[0], rows: body[1] };
}
const countryResponse = await read("country");
const countries = countryResponse.rows
  .filter((c) => c.region.id !== "NA")
  .map((c) => ({
    id: c.id,
    iso2: c.iso2Code,
    name: c.name,
    region: c.region.value,
    values: {},
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
const countryMap = new Map(countries.map((c) => [c.id, c]));
const responses = await Promise.all(
  indicatorDefinitions.map(async ([id, label, unit, note]) => {
    const response = await read(
      `country/all/indicator/${id}?date=2020:2025&footnote=y`,
    );
    const metadata = await read(`indicator/${id}`);
    for (const row of response.rows) {
      const country = countryMap.get(row.countryiso3code);
      if (!country || row.value === null || !Number.isFinite(row.value))
        continue;
      const old = country.values[id];
      if (!old || +row.date > old.year)
        country.values[id] = {
          value: row.value,
          year: +row.date,
          footnote: row.footnote || "",
          status: row.obs_status || "",
        };
    }
    return {
      id,
      label,
      unit,
      note,
      url: `https://data.worldbank.org/indicator/${id}`,
      apiUrl: response.url,
      lastUpdated: response.meta.lastupdated,
      definition: metadata.rows[0].sourceNote,
      organization: metadata.rows[0].sourceOrganization,
    };
  }),
);
const data = {
  title: "Country data profiles",
  review: "draft",
  reviewNote:
    "Statistical source transcription checked with AI assistance. Independent human review and local narrative authorship are not claimed.",
  retrieved: new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date()),
  window: "2020–2025; latest non-empty observation per indicator",
  publisher:
    "World Bank World Development Indicators and original statistical producers",
  license: "CC BY 4.0; see each indicator page for attribution",
  scope:
    "World Bank countries and economies, excluding aggregate regions. No local coauthor or recommendation is implied.",
  countrySource: countryResponse.url,
  indicators: responses,
  countries,
};
if (countries.length < 200)
  throw new Error(
    "Unexpectedly few economies; leaving previous file unchanged",
  );
await writeFile(
  new URL("../src/data/countries.json", import.meta.url),
  JSON.stringify(data, null, 2) + "\n",
);
console.log(
  `Saved ${countries.length} countries/economies and ${responses.length} indicators, ${countries.reduce((n, c) => n + Object.keys(c.values).length, 0)} observations.`,
);
