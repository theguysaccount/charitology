#!/usr/bin/env node
/**
 * Build the 5-Country European Tax-Assignment Observatory comparative dataset
 * directly from Charitology's five SHA-256-pinned national funding-flow manifests:
 *   - Italy (5‰ / 0.5% IRPEF)
 *   - Poland (1.5% PIT)
 *   - Slovakia (2%/3% individuals + 1%/2% corporations)
 *   - Hungary (1% civil + 1% church/budget technical-number SZJA)
 *   - Slovenia (1.0% dohodnina, doubled from 0.5% in 2020)
 *
 * Zero synthetic FX conversions — native currencies (EUR, PLN, HUF) and exact
 * official counts are preserved verbatim from each national manifest.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'public/data/funding-flows/europe-tax-assignment-compare');
fs.mkdirSync(outDir, { recursive: true });

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const readJson = (rel) => {
  const buf = fs.readFileSync(path.join(root, rel));
  return { data: JSON.parse(buf.toString('utf8')), sha256: sha256(buf), bytes: buf.length, rel };
};

const it = readJson('public/data/funding-flows/italy-five-per-mille/manifest.json');
const pl = readJson('public/data/funding-flows/poland-pit-1-5-percent/manifest.json');
const sk = readJson('public/data/funding-flows/slovakia-pit-2-percent/manifest.json');
const hu = readJson('public/data/funding-flows/hungary-szja-1-percent/manifest.json');
const si = readJson('public/data/funding-flows/slovenia-dohodnina-1-percent/manifest.json');

const plLatest = pl.data.byYear[pl.data.byYear.length - 1];
const pl2022 = pl.data.byYear[0];
const siLatest = si.data.annualSeries[si.data.annualSeries.length - 1];
const si2019 = si.data.annualSeries.find((y) => y.year === 2019);
const si2020 = si.data.annualSeries.find((y) => y.year === 2020);
const si7yrCents = si.data.annualSeries.reduce((s, y) => s + y.disclosedTotalCents, 0);
const si7yrChoices = si.data.annualSeries.reduce((s, y) => s + y.disclosedTaxpayerChoices, 0);
const siJumpPct = Number((((si2020.disclosedTotalCents - si2019.disclosedTotalCents) / si2019.disclosedTotalCents) * 100).toFixed(2));
const plGrowthPct = Number((((plLatest.totalGrosze - pl2022.totalGrosze) / pl2022.totalGrosze) * 100).toFixed(2));

const systems = [
  {
    id: 'italy',
    country: 'Italy',
    schemeName: '5 per mille (5‰ IRPEF)',
    statutoryRate: '0.5% (5‰) of IRPEF',
    taxpayerPool: 'Individuals only',
    corporationsEligible: false,
    separateChurchTrack: true,
    churchTrackNote: 'Separate 8‰ (otto per mille) religious/state track runs independently from 5‰.',
    subAccountsAllowed: false,
    multiRecipientPerTaxpayer: false,
    unexpressedPoolRedistributed: true,
    latestPeriod: 'AF 2025',
    currency: 'EUR',
    latestTotalNative: Number((it.data.counts.totalDisbursableEurCents / 100).toFixed(2)),
    latestTotalDisplay: `EUR ${(it.data.counts.totalDisbursableEurCents / 1e8).toFixed(2)}M`,
    multiYearSpan: 'AF 2025 (single latest fiscal year)',
    multiYearTotalNative: Number((it.data.counts.totalDisbursableEurCents / 100).toFixed(2)),
    multiYearTotalDisplay: `EUR ${(it.data.counts.totalDisbursableEurCents / 1e8).toFixed(2)}M`,
    latestFundedRecipients: it.data.counts.fundedOrganizations,
    latestEligibleOrTotalListed: it.data.counts.includedOrganizations,
    latestTaxpayerChoices: it.data.counts.totalChoices,
    avgNativePerChoice: Number((it.data.counts.avgTotalEurPerChoiceCents / 100).toFixed(2)),
    top10SharePct: it.data.counts.top10SharePct,
    top50SharePct: it.data.counts.top50SharePct,
    top100SharePct: null,
    distinctiveFinding:
      'Redistributes EUR 82.15M in generic category-only choices proportionally by expressed choices; sub-EUR-100 payouts (8,216 entities) redistribute EUR 441.9k back into pools.',
    registryRoute: '/record/charity-index/italy/',
    fundingFlowRoute: '/record/funding-flows/italy-five-per-mille/',
    sourceManifest: '/data/funding-flows/italy-five-per-mille/manifest.json',
    sourcePublisher: it.data.publisher,
    asOf: it.data.asOf,
  },
  {
    id: 'poland',
    country: 'Poland',
    schemeName: '1.5% PIT (OPP)',
    statutoryRate: '1.5% of PIT (raised from 1.0% in 2022)',
    taxpayerPool: 'Individuals only',
    corporationsEligible: false,
    separateChurchTrack: false,
    churchTrackNote: 'No separate percentage church-tax track; religious OPPs compete inside the 1.5% list.',
    subAccountsAllowed: true,
    multiRecipientPerTaxpayer: false,
    unexpressedPoolRedistributed: false,
    latestPeriod: `Tax year ${plLatest.taxYear} (paid ${plLatest.payoutYear})`,
    currency: 'PLN',
    latestTotalNative: Number((plLatest.totalGrosze / 100).toFixed(2)),
    latestTotalDisplay: `PLN ${(plLatest.totalGrosze / 1e11).toFixed(2)}B`,
    multiYearSpan: '2022–2025 (4 tax years)',
    multiYearTotalNative: Number((pl.data.counts.total4yrGrosze / 100).toFixed(2)),
    multiYearTotalDisplay: `PLN ${(pl.data.counts.total4yrGrosze / 1e11).toFixed(2)}B`,
    latestFundedRecipients: plLatest.fundedOrgCount,
    latestEligibleOrTotalListed: plLatest.eligibleNiwCount,
    latestTaxpayerChoices: plLatest.disclosedTaxpayersTenthsK * 100,
    avgNativePerChoice: null,
    top10SharePct: plLatest.top10SharePct,
    top50SharePct: null,
    top100SharePct: plLatest.top100SharePct,
    distinctiveFinding: `Highest Top-10 concentration (${plLatest.top10SharePct}%; Top-100 ${plLatest.top100SharePct}%) driven by medical sub-account umbrella foundations; payouts grew +${plGrowthPct}% from 2022 to 2025 after the 1.0%→1.5% reform.`,
    registryRoute: '/record/charity-index/poland/',
    fundingFlowRoute: '/record/funding-flows/poland-pit-1-5-percent/',
    sourceManifest: '/data/funding-flows/poland-pit-1-5-percent/manifest.json',
    sourcePublisher: pl.data.publisher,
    asOf: pl.data.capturedOn,
  },
  {
    id: 'slovakia',
    country: 'Slovakia',
    schemeName: '2%/3% Tax Assignment (Podiel zaplatenej dane)',
    statutoryRate: '2% (3% volunteers) individuals; 1% (2% with 0.5% gift) corporations',
    taxpayerPool: 'Individuals + Corporations',
    corporationsEligible: true,
    separateChurchTrack: false,
    churchTrackNote: 'Single nonprofit assignment channel; religious nonprofits register as eligible recipients.',
    subAccountsAllowed: false,
    multiRecipientPerTaxpayer: true,
    unexpressedPoolRedistributed: false,
    latestPeriod: '2025 disbursement year',
    currency: 'EUR',
    latestTotalNative: Number((sk.data.counts.total2025EurCents / 100).toFixed(2)),
    latestTotalDisplay: `EUR ${(sk.data.counts.total2025EurCents / 1e8).toFixed(2)}M`,
    multiYearSpan: '2016–2025 (10 years)',
    multiYearTotalNative: Number((sk.data.counts.total10YearEurCents / 100).toFixed(2)),
    multiYearTotalDisplay: `EUR ${(sk.data.counts.total10YearEurCents / 1e8).toFixed(2)}M`,
    latestFundedRecipients: sk.data.counts.active2025Organizations,
    latestEligibleOrTotalListed: sk.data.counts.distinctOrganizations10y,
    latestTaxpayerChoices: null,
    avgNativePerChoice: null,
    top10SharePct: sk.data.counts.top10Share2025Pct,
    top50SharePct: sk.data.counts.top50Share2025Pct,
    top100SharePct: null,
    distinctiveFinding: `Only country in the five-country set allowing corporate income-tax assignment: named foundations (led by corporate foundations) absorbed ${sk.data.counts.namedFoundationShare2025Pct}% of 2025 payouts across EUR 782.06M over 10 years.`,
    registryRoute: '/record/charity-index/slovakia/',
    fundingFlowRoute: '/record/funding-flows/slovakia-pit-2-percent/',
    sourceManifest: '/data/funding-flows/slovakia-pit-2-percent/manifest.json',
    sourcePublisher: sk.data.publisher,
    asOf: sk.data.asOf,
  },
  {
    id: 'hungary',
    country: 'Hungary',
    schemeName: '1% + 1% SZJA',
    statutoryRate: '1.0% civil charities + separate 1.0% churches/national budget',
    taxpayerPool: 'Individuals only',
    corporationsEligible: false,
    separateChurchTrack: true,
    churchTrackNote: `Second 1% technical-number track raised HUF ${(hu.data.counts.technicalNumber2026Huf / 1e9).toFixed(2)}B from ${(hu.data.counts.technicalNumber2026Donors / 1e6).toFixed(2)}M taxpayers across ${hu.data.counts.technicalNumber2026Count} recipients in 2026.`,
    subAccountsAllowed: false,
    multiRecipientPerTaxpayer: false,
    unexpressedPoolRedistributed: false,
    latestPeriod: '2026 disbursement year (civil 1%)',
    currency: 'HUF',
    latestTotalNative: hu.data.counts.total2026CivilHuf,
    latestTotalDisplay: `HUF ${(hu.data.counts.total2026CivilHuf / 1e9).toFixed(2)}B civil (+HUF ${(hu.data.counts.technicalNumber2026Huf / 1e9).toFixed(2)}B 2nd 1%)`,
    multiYearSpan: '2024–2026 (3 years civil 1%)',
    multiYearTotalNative: hu.data.counts.total3YearCivilHuf,
    multiYearTotalDisplay: `HUF ${(hu.data.counts.total3YearCivilHuf / 1e9).toFixed(2)}B civil`,
    latestFundedRecipients: hu.data.counts.active2026CivilOrganizations,
    latestEligibleOrTotalListed: hu.data.counts.distinctCivilOrganizations3y,
    latestTaxpayerChoices: hu.data.counts.total2026CivilDonors,
    avgNativePerChoice: Math.round(hu.data.counts.total2026CivilHuf / hu.data.counts.total2026CivilDonors),
    top10SharePct: hu.data.counts.top10Share2026Pct,
    top50SharePct: hu.data.counts.top50Share2026Pct,
    top100SharePct: null,
    distinctiveFinding: `Lowest Top-10 concentration (${hu.data.counts.top10Share2026Pct}%) across ${hu.data.counts.active2026CivilOrganizations.toLocaleString('en-US')} funded civil organizations, with NAV publishing exact donor counts for every recipient.`,
    registryRoute: '/record/charity-index/hungary/',
    fundingFlowRoute: '/record/funding-flows/hungary-szja-1-percent/',
    sourceManifest: '/data/funding-flows/hungary-szja-1-percent/manifest.json',
    sourcePublisher: hu.data.publisher,
    asOf: hu.data.asOf,
  },
  {
    id: 'slovenia',
    country: 'Slovenia',
    schemeName: '1% Dohodnina (Namenitev dela dohodnine)',
    statutoryRate: '1.0% of PIT (doubled from 0.5% in 2020; up to 10 recipients)',
    taxpayerPool: 'Individuals only',
    corporationsEligible: false,
    separateChurchTrack: false,
    churchTrackNote: 'Religious communities, trade unions, and political parties compete alongside NGOs in the single 1% register.',
    subAccountsAllowed: false,
    multiRecipientPerTaxpayer: true,
    unexpressedPoolRedistributed: false,
    latestPeriod: '2025 tax-assessment year',
    currency: 'EUR',
    latestTotalNative: siLatest.disclosedTotalEur,
    latestTotalDisplay: `EUR ${(siLatest.disclosedTotalCents / 1e8).toFixed(2)}M`,
    multiYearSpan: '2019–2025 (7 years)',
    multiYearTotalNative: Number((si7yrCents / 100).toFixed(2)),
    multiYearTotalDisplay: `EUR ${(si7yrCents / 1e8).toFixed(2)}M`,
    latestFundedRecipients: siLatest.disclosedRows,
    latestEligibleOrTotalListed: siLatest.totalRows,
    latestTaxpayerChoices: siLatest.disclosedTaxpayerChoices,
    avgNativePerChoice: siLatest.avgEurPerChoice,
    top10SharePct: siLatest.top10SharePct,
    top50SharePct: siLatest.top50SharePct,
    top100SharePct: null,
    distinctiveFinding: `Doubling the cap from 0.5% to 1.0% in 2020 triggered an immediate +${siJumpPct}% payout jump (EUR 5.43M → EUR 10.68M); Top-10 share rose from ${si2019.top10SharePct}% (2019) to ${siLatest.top10SharePct}% (2025).`,
    registryRoute: '/record/charity-index/slovenia/',
    fundingFlowRoute: '/record/funding-flows/slovenia-dohodnina-1-percent/',
    sourceManifest: '/data/funding-flows/slovenia-dohodnina-1-percent/manifest.json',
    sourcePublisher: si.data.publisher,
    asOf: si.data.capturedOn,
  },
];

const payload = {
  format: 'charitology-europe-tax-assignment-compare-v1',
  asOf: '2026-11-25',
  capturedOn: '2026-11-25',
  countryCount: systems.length,
  currencyPolicy:
    'Native currencies (EUR, PLN, HUF) are preserved verbatim with zero synthetic FX conversions so cross-country comparisons focus on concentration shares, mechanism design, participation, and policy shocks.',
  policyShocks: [
    {
      country: 'Slovenia',
      year: 2020,
      reform: 'Statutory cap doubled from 0.5% to 1.0% of personal income tax (plus up to 10 recipients per taxpayer)',
      beforeNative: si2019.disclosedTotalEur,
      afterNative: si2020.disclosedTotalEur,
      currency: 'EUR',
      changePct: siJumpPct,
    },
    {
      country: 'Poland',
      year: 2023,
      reform: 'Statutory PIT assignment raised from 1.0% to 1.5% (2022–2025 trajectory across 4 payout rounds)',
      beforeNative: Number((pl2022.totalGrosze / 100).toFixed(2)),
      afterNative: Number((plLatest.totalGrosze / 100).toFixed(2)),
      currency: 'PLN',
      changePct: plGrowthPct,
    },
  ],
  systems,
};

const compBytes = Buffer.from(JSON.stringify(payload, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(outDir, 'comparison.json'), compBytes);

const escCsv = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@]/.test(s.trimStart()) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

const headers = [
  'country',
  'scheme_name',
  'statutory_rate',
  'taxpayer_pool',
  'corporations_eligible',
  'separate_church_track',
  'sub_accounts_allowed',
  'multi_recipient_per_taxpayer',
  'unexpressed_pool_redistributed',
  'latest_period',
  'currency',
  'latest_total_native',
  'multi_year_span',
  'multi_year_total_native',
  'latest_funded_recipients',
  'latest_eligible_or_listed',
  'latest_taxpayer_choices',
  'avg_native_per_choice',
  'top10_share_pct',
  'top50_share_pct',
  'top100_share_pct',
  'as_of',
];

const csvRows = [
  headers.join(','),
  ...systems.map((s) =>
    [
      s.country,
      s.schemeName,
      s.statutoryRate,
      s.taxpayerPool,
      s.corporationsEligible,
      s.separateChurchTrack,
      s.subAccountsAllowed,
      s.multiRecipientPerTaxpayer,
      s.unexpressedPoolRedistributed,
      s.latestPeriod,
      s.currency,
      s.latestTotalNative,
      s.multiYearSpan,
      s.multiYearTotalNative,
      s.latestFundedRecipients,
      s.latestEligibleOrTotalListed,
      s.latestTaxpayerChoices,
      s.avgNativePerChoice,
      s.top10SharePct,
      s.top50SharePct,
      s.top100SharePct,
      s.asOf,
    ]
      .map(escCsv)
      .join(','),
  ),
];

const csvBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csvRows.join('\r\n') + '\r\n', 'utf8')]);
fs.writeFileSync(path.join(outDir, 'europe-tax-assignment-comparison.csv'), csvBytes);

const manifest = {
  format: 'charitology-europe-tax-assignment-compare-manifest-v1',
  asOf: '2026-11-25',
  capturedOn: '2026-11-25',
  countryCount: systems.length,
  countries: systems.map((s) => s.country),
  sourceManifests: [it, pl, sk, hu, si].map((x) => ({
    path: x.rel,
    bytes: x.bytes,
    sha256: x.sha256,
  })),
  artifacts: {
    comparison: {
      path: 'comparison.json',
      bytes: compBytes.length,
      sha256: sha256(compBytes),
    },
    csv: {
      path: 'europe-tax-assignment-comparison.csv',
      bytes: csvBytes.length,
      sha256: sha256(csvBytes),
    },
  },
};

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(
  `Built European Tax-Assignment Observatory (${systems.length} countries): comparison.json=${compBytes.length} B, csv=${csvBytes.length} B`,
);
