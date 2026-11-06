# Reproducible model bundles: implementation contract proposal

October 28, 2026 UTC. AI-assisted engineering proposal, awaiting root review and freeze. This file specifies a bounded local software release; it does not assert implementation, numerical acceptance, a real intervention estimate, independent review or publication. Do not implement against an earlier private draft or silently change this contract while implementations are split.

The preserved inputs are the private proposal SHA-256 `d26fcb01a55fffa0043a1571f5c04eac58c16b313af2b07621ec16bb4a883430`, independent review `adb47343b3f56c69cb338e25700096f36c3d92ab6e7cfe573fdcd91ac67fbf85`, review receipt `90013659a2815e47bb19eeea5727913f5f9b115aa4bfe0670d52c4c79cf007e4`, actual-module probe `4e4f8f5db57e6b8f006fd3b6dee4934434544136e547147971ab74250f34f50a` and probe source `bc5d0d669f5cf6bb8b0f531874d2eacf5e14af18d0fc8cfa1cecbfcbcdba3c59`. They remain unchanged. This complete proposal resolves their numerical, file-I/O, graph, mismatch-provenance, lifecycle and encoding findings. Its equations and source metadata are still a design, not a test result. Proposed Amendment 1, integrated below and specified in section 16, closes the owned comparison/draft commands and delegates the existing calculator Run action to the same guarded engine; it awaits the same root freeze as this complete document.

## 1. Smallest complete release and retained boundaries

Add a voluntary browser-local bundle desk beside the existing Cost-Effectiveness Model Kit. The complete flow is: explicitly copy the current form or author a new draft → inspect raw and normalized inputs → document one outcome, USD basis, periods, assumptions and source descriptions → calculate with a known frozen engine → freeze an immutable local version → download one selected JSON bundle → choose that actual file in a fresh desk → inspect and independently recalculate it → deliberately copy to a new local model. Separate full backup/restore includes the complete local graph and unfinished writing. Failed writes retain the exact candidate for Retry; stale tabs refuse; Clear and Undo require fresh explicit authority. A read-only CLI verifies one explicitly chosen bundle with the same allowlisted engine.

The release does not add arbitrary equations, correlated inputs, causal graphs, spreadsheets, currency conversion, moral weights, QALY/DALY conversion, harms calculation, pooled analysis, named-charity ratings, a backend or an upload. Reproduction means agreement with a declared numerical calculation on this runtime. It is not measured impact, source truth, empirical replication, independent scientific review or a ranking. The original mega list's wider public estimate and reviewed-model coverage remains open.

The following existing contracts remain unchanged:

1. `charitology.ce-models`, accessed by D1 as `ce-models`, and each original `{id,name,unit,discount,seed,savedAt,values}` entry. Its native v1 format deliberately accepts unfinished numeric strings and legacy parseable timestamps. No new field, migration, timestamp repair, old-key scan, automatic read/write or deletion is introduced by the bundle desk.
2. The existing calculator's `models.ts`, `montecarlo.ts` and `format.ts` bytes, amount stripping, seed conversion, saved-name matching, illustrative example, D1 controls and ordinary CSV schema/convention. Its component Run action delegates the original raw strings to the pinned guarded engine through section 16's compatibility wrapper; it no longer calls the old unguarded run/sensitivity functions. Its CSV remains the last successful complete run's human inspection export, including stale-last-run behavior, columns `section,item,low,likely,high,value,unit` and filename convention. It is not a reproducible import or a formula-neutralized R3 export. The separate bundle-copy action always captures the current raw form and makes its own fresh guarded run.
3. R3 artifact/results, R4 review qualification, fixed publication families, research/publication/OS keys and all other native files. A local bundle can be deliberately recorded as an existing R3 artifact descriptor; this does not run it or create an empirical result. No private model becomes an accepted public edition basis.

Calculator integration consists only of section 16's guarded Run compatibility wrapper and an explicit same-tab `Copy current inputs to a bundle draft` callback, installed after D1 initialization succeeds. It returns detached current raw strings and the current form generation on the user's click. It supplies no saved-library ID, old timestamp, storage access, previous CSV or write authority. The consumer checks the generation again after every await. Failure to initialize leaves this action unavailable without changing the old tool.

## 2. Inspected baseline and verified defects

The actual current files were reread; these hashes equal the earlier reviewed arithmetic baseline:

| Source | SHA-256 |
| --- | --- |
| `src/lib/client/models.ts` | `dc3b74c3239175c9551fbf2b993f7b5d911adcce963ab147384c6a17ba864015` |
| `src/lib/client/montecarlo.ts` | `deda9cccee58317fd0a7e40df371d93f44ae46f1c0a949b6fecf7c0d742e4203` |
| `src/lib/client/format.ts` | `e552755beb998fbd9c9f0d14ef79689011016ed1dd263eb34cc0b8f39c66a6e9` |
| `src/components/tools/cost-effectiveness-model-kit.astro` | `2486e5a51aed2607bf03c39c680867b75f0503e6d2dc31200bdb4d09166dfab7` |

The private probe ran these actual compiled modules under Node `v24.22.1`, not a future engine. It established:

- Positive discount share `1e-17` makes `1/(1+r)` round to 1 and the original duration become NaN. The old run misclassifies 5,000 draws as no outcome.
- Finite people/effect `1e308` produce infinite outcomes and false zero costs.
- Constant cost `1e-120`, people/effect `1e120`, works/years 1 and anyway/discount 0 produce finite outcome `1e240` but cost/outcome 0. The strict decimal raw strings fit 128 characters; a length cap does not fix this.
- `triangular(0.25,0,5e-201,1e-200)` returns 0 because a positive multiplication before `sqrt` becomes 0. At seed 42, the old model produces 2,464 artificial no-outcome draws. This is not a legitimate low-zero boundary draw.
- A 325-character legacy decimal parses to positive `1e-323` percent, then `/100` becomes 0. A normalized-rate check alone misses this loss.
- Actual zero works at a sensitivity endpoint legitimately produces no outcome and an unbounded sensitivity swing. Type-7 `[1,Infinity]` at 0.5 legitimately inherits Infinity. Neither is an arithmetic overflow.

The new guarded engine and the delegated compatibility Run must refuse the defective cases without changing their old native strings, saved library or frozen old math/format sources. These probes are regression inputs, not source evidence about a real program.

## 3. Frozen engine and hash closure

The only first-release engine is `charitology-ce-triangular-js-v1`, version 1. Its immutable source inventory is exactly these three UTF-8 files:

```text
src/lib/model-bundles/interpretations/v1/arithmetic.mjs
src/lib/model-bundles/interpretations/v1/encoding.mjs
src/lib/model-bundles/interpretations/v1/random.mjs
```

`arithmetic.mjs` owns raw normalization, input admission, discounting, outcomes, cost, run and sensitivity. `random.mjs` owns Mulberry32, guarded triangular sampling and type-7 quantiles. `encoding.mjs` owns this engine's canonical scalar/run/array encoding and hashes. Dependencies within that inventory use exact relative static imports; no transitive project helper, current calculator import, URL, caller callback or dynamically chosen file may influence numerical/reference bytes. Platform ECMAScript binary64, `Math.sqrt`, `Math.pow`, typed arrays and SHA-256 are the named runtime dependencies. UI/CLI orchestration and scheduling do not change arithmetic or supply alternate validators/math.

The closed engine object is `{definition,definitionHash,files}`. Definition has exactly:

```ts
type EngineDefinition = {
 id:"charitology-ce-triangular-js-v1"; version:1;
 language:"ecmascript-binary64";
 rangedOrder:["cost","people","works","effect","years","anyway"];
 draws:5000; prng:"mulberry32-v1";
 distribution:"triangular-inverse-cdf-v1"; quantile:"type7-infinity-v1";
 equation:"expected-one-outcome-geometric-years-v1";
 drawConsumption:"six-in-order-including-constants";
 sorting:"separate-ascending-cost-and-outcome";
 sensitivity:"one-at-a-time-mode-v1";
 numericalPolicy:"guarded-finite-intermediates-v1";
 sourceFiles:FilePin[]; goldenVectorsHash:Hash;
};
type FilePin = {path:string;byteLength:number;sha256:Hash};
type EngineFile = FilePin & {rawUtf8:string};
type KnownEngine = {definition:EngineDefinition;definitionHash:Hash;files:EngineFile[]};
```

Both file arrays are the exact three paths in lexical order, with matching metadata. Check actual UTF-8 bytes/length/hash and exact known definition; never evaluate, import, compile, fetch or write supplied source text. The outside static registry pins these frozen bytes and descriptor. The files contain no registry/definition self-hash. The complete engine object is bounded by 128 KiB. Code licensing is the fixed MIT source notice, separate from any source/model data rights.

Golden fixtures are engine-neutral. Their exact DTO is `{format:"charitology-model-golden",version:1,cases:GoldenCase[]}`, at most 40 cases and 128 KiB canonical JSON. A run case is `{kind:"run",id:Id,input:Input,raw:Raw|null,expected:Omit<RecordedRun,"inputHash">}`; a refusal case is `{kind:"refusal",id:Id,raw:Raw|null,input:Input|null,issue:NumericalIssue}` with exactly one raw/input present. A run case's optional raw must normalize to its input. Expected values include numerical summaries/sensitivity/counts and complete-array hashes, but exclude `definitionHash`, `inputHash`, run/content/version hashes and any value depending on the descriptor. Compute the golden hash, then definition hash, then dependent input/run hashes. Otherwise definition → golden → expected input hash → definition would create a hash cycle. The checked-in golden fixture is not a real intervention artifact. Exact source/definition/golden hashes are calculated only after the implementation freezes; this plan invents none.

Keep this registered v1 interpretation permanently. A rescaled sampler, `expm1`/`log1p` discount formula, reordered multiplication, different draw count or portable-math replacement needs a different engine/descriptor and golden vectors. Do not dispatch old files to the current calculator. Exact runtime agreement is checked in actual Node and Chrome; IEEE-754 and a seed alone do not guarantee all implementations round `sqrt`/`pow` identically. No tolerance or rounding-to-match is accepted in v1. A mismatch is displayed honestly.

## 4. Numerical contract and independent patch-design check

Normalized row order is exactly cost, people, works, effect, years, anyway. Every draw consumes six Mulberry32 values, even for constant triples; there are exactly 5,000 draws. The PRNG's unsigned increment, shifts, `Math.imul` and division by `4294967296` remain byte-pinned to the inspected algorithm. Inputs are independent triangular distributions; likely is the mode, not the mean. Works is an expected scaling factor, not a Bernoulli event simulation.

Retain the original equation and evaluation association:

```text
D(y,r) = 0                         when y === 0
       = y                         when r === 0
       = (1-pow(v,y))/(1-v)         otherwise, v=1/(1+r)
O = (((people*works)*effect)*D(years,r))*(1-anyway)
C = cost/O                         when O > 0
```

The first year is undiscounted. Fractional years use that geometric continuation, not linear partial-year proration or continuous integration. Costs are total USD and are not discounted, shifted or divided over the horizon. Discount is not sampled.

Guard at the actual operation, before a later zero factor or branch can conceal failure:

1. All admitted inputs and every finite arithmetic intermediate must remain finite. Do not allow NaN/Infinity to enter a typed array or summary except the internal dedicated cost sentinel for a genuine zero outcome.
2. Before percent conversion, retain the parsed Number. A positive parsed works/anyway/discount percent whose `/100` result is 0 refuses `numeric-underflow`, even when normalized 0 would pass the row bounds. Likewise a nonzero decimal token whose Number conversion becomes 0 refuses; raw `0`, `-0` and decimal all-zero tokens remain deliberate zero. Nonzero is determined from the actual strict token or legacy stripped token's nonzero decimal digits, never from prose.
3. Every multiplication of nonnegative finite operands is checked in its original association. If both operands are positive and the result is 0, refuse underflow; if the result is nonfinite, refuse overflow. Apply this to triangular branch products, outcome products and finite quantile interpolation products. A genuine zero operand is distinct, but does not excuse an earlier failed operation. Nonzero subnormal values are allowed; this guard detects collapse to zero, not every IEEE underflow/precision event.
4. A positive numerator/positive denominator whose quotient is 0 refuses underflow; a nonfinite quotient refuses overflow. This includes cost/outcome on every draw, the all-mode point and every sensitivity endpoint, as well as a positive triangular split. A strictly interior mode must produce a split strictly inside (0,1); endpoint modes may produce exactly 0 or 1. Do not rescale to rescue a refused expression.
5. For positive years/rate, require finite `1+r`, `0<v<1`, positive finite denominator, `0<pow(v,y)<1`, positive finite numerator and positive finite duration. Thus tiny rates rounding `v` to 1, tiny positive years rounding the power to 1, and a positive power collapsing to 0 all refuse. The tail-underflow refusal deliberately narrows the supported domain; it does not silently substitute the infinite-horizon limit.
6. Triangular sampling retains `span=high-low`, `split=(mode-low)/span` and exactly `u<split ? low+sqrt((u*span)*(mode-low)) : high-sqrt(((1-u)*span)*(high-mode))`. Require internal `0<=u<1`, finite ordered admitted endpoints and finite sample in `[low,high]`. For nonconstant nonnegative triples, a sample of 0 is legitimate only when `low===0 && u===0`; a positive-u result collapsing to 0 refuses. A constant-zero triple legitimately returns 0. These checks prevent a sampler-created zero from reaching the later outcome guard.
7. A computed outcome of 0 is successful only after all guards passed and at least one actual outcome factor is 0 (works, effect or duration; people is strictly positive and anyway is at most 0.99). Store outcome +0 and the dedicated internal cost +Infinity; increment `none`. Numerical refusal never increments `none`, returns partial success or produces a frozen version.

Ordinary binary64 rounding and absorption of a small addend into a nonzero result remain possible. This engine does not promise exact rational arithmetic, perfect conditioning or detection of all accuracy loss. Its concrete promise is unchanged specified operation order plus these finite/range/zero-collapse refusals. The independent design check is that each demonstrated defect now fails *before* the old classification point: percent loss at normalization, triangle loss before `sqrt`, product overflow before cost division, and ratio loss immediately after division. Legitimate boundary zero and no-outcome-derived Infinity take different typed branches. No known-wrong value needs a successful run or approval.

Sort cost/outcome arrays separately ascending; paired simulation indices are not retained. Type-7 uses `(n-1)*q` at fixed q 0.05/0.5/0.95; integer position/equal neighbors return the lower value. An infinite upper cost neighbor derived from genuine zero-outcome samples returns the dedicated no-outcome summary tag. Otherwise interpolate in the original association with the same guards. Outcome summaries must be finite. Sensitivity uses all other inputs at mode, exact low/high endpoints, `lo=min`, `hi=max`, swing 0 for equal endpoints, unbounded for exactly one no-outcome endpoint, otherwise guarded finite subtraction. Both no-outcome endpoints have swing 0. Sort descending swing, ties in the six-row order; unbounded ties also use that order. Every required endpoint and all-mode calculation must succeed or the entire run refuses.

Numerical errors use exactly this finite interface. No arbitrary source text is included. The phase must agree with its path prefix; normalization context is used only for raw parsing, quantile context only for its named array/q, and draw/likely/sensitivity contexts identify the calculation being evaluated. An internal inconsistency refuses rather than manufacturing a path. Errors preserve literal writing and selected bytes. A numerical refusal may produce only the owned comparison-outcome handle described in section 8; it grants no matched-result arrays, reproduced-copy authority or draws export.

```ts
type Part = "low"|"likely"|"high";
type NumericalPath = `raw.values.${Row}.${Part}`|"raw.discount"
 |`sample.${Row}.${"u"|"span"|"mode-low"|"high-mode"|"split"|"left-scale"|
   "left-product"|"right-weight"|"right-scale"|"right-product"|"root"|"result"}`
 |`discount.${"base"|"v"|"power"|"numerator"|"denominator"|"duration"}`
 |`outcome.${"people-works"|"effect"|"duration"|"counterfactual"|"result"}`
 |"cost.ratio"
 |`quantile.${"costs"|"outcomes"}.${"difference"|"fractional-product"|"result"}`
 |`sensitivity.${Row}.swing`;
type NumericalContext = {kind:"normalization"}|{kind:"draw";index:number}
 |{kind:"likely"}|{kind:"sensitivity";row:Row;endpoint:"low"|"high"|"swing"}
 |{kind:"quantile";series:"costs"|"outcomes";q:0.05|0.5|0.95};
type NumericalIssue = {code:"numeric-underflow"|"numeric-overflow"|"numeric-domain";
 phase:"normalize"|"sample"|"discount"|"outcome"|"cost"|"quantile"|"sensitivity";
 path:NumericalPath;context:NumericalContext};
```

Draw index is integer 0..4999. All issue paths are ASCII and <=128 units. Input shape/range failures are separate bounded admission errors, not successful numerical observations. The nonblank/local-date/seed rules do not need a numeric-error escape.

## 5. Closed data interfaces and canonical bytes

All properties listed below are required; nullable means explicit null. Reject extra keys, coercion, unsafe decoded keys, accessors, exotic objects, cycles and sparse/decorated arrays. File decode is fatal UTF-8 with no BOM; reject duplicate decoded object keys, nonfinite numeric tokens, trailing bytes, excess depth/work and unpaired surrogate strings. JSON strings are not NFC-normalized, trimmed or repaired. This boundary admits detached frozen JSON only; it does not claim to make arbitrary hostile JavaScript Proxies safe.

`Id` is `[a-z][a-z0-9-]{0,79}`. Hash is 64 lowercase SHA-256 characters. Canonical numbers are finite and never -0; creators explicitly normalize parsed -0 to +0 while preserving its raw token. Reject numeric -0 in an imported canonical DTO. Instant is a real canonical UTC millisecond string in 1900..2200, labeled as a local device recording/export time. Source `PartialDate` is `{precision:"year"|"month"|"day",value:string}` with exact valid `YYYY`, `YYYY-MM` or real `YYYY-MM-DD`, years 0001..9999. A Day has the same real full-day rule. Known period endpoints have identical precision and ordered values; both unknown endpoints are null. Do not infer a day, timezone or measurement period from a source/retrieval/export timestamp.

Canonical object keys sort by ECMAScript code-unit order; arrays retain semantic order. Canonical JSON uses JSON string/finite-number spelling with no whitespace. Each ordinary hash is SHA-256 of UTF-8 `charitology-model-bundles/v1/<kind>\n` + canonical value + `\n`. Kinds are the closed literals `engine`, `golden`, `input`, `run`, `content`, `version`, `selected`, `backup`, `state`, `draws`, `proposal`, `review`. Version hash excludes only its own hash; content hash covers content; envelope checksum excludes only checksum. Exported JSON is JSON.stringify(value,null,2) plus one newline, admitted again at complete byte limits. Canonical integrity and exact chosen-file bytes are different hashes.

LocalStorage holds UTF-16 strings, not original file bytes. Saved-baseline authority is exact JavaScript string equality, including code units; never a cleaned/re-serialized value. Its optional display fingerprint is SHA-256 of UTF-8 `charitology-model-bundles/v1/saved-string\n` + JSON.stringify(the exact string) + `\n`. This escaped-string encoding preserves even corrupt lone code units. Absence has savedSha256 null. A fingerprint never replaces the exact string comparison; denied reads are not absence. The references to saved strings below use this definition.

```ts
type Id = string; type Hash = string; type Instant = string; type Day = string;
type PartialDate = {precision:"year"|"month"|"day";value:string};
type Row = "cost"|"people"|"works"|"effect"|"years"|"anyway";
type Triple<T> = [T,T,T];
type Six<T> = {cost:T;people:T;works:T;effect:T;years:T;anyway:T};
type Head = {id:Id;hash:Hash};
type EnginePin = {id:"charitology-ce-triangular-js-v1";version:1;definitionHash:Hash};
type Raw = {parser:"legacy-amount-strip-v1"|"strict-decimal-v1";
 name:string;unit:string;values:Six<Triple<string>>;discount:string;seed:string};
type Input = {values:Six<Triple<number>>;discount:number;seed:number;draws:5000};
type Finite = {kind:"finite";value:number};
type NoOutcome = {kind:"no-outcome"};
type Unbounded = {kind:"unbounded"};
type CostValue = Finite|NoOutcome;
type CostSummary = {median:CostValue;p5:CostValue;p95:CostValue};
type OutcomeSummary = {median:Finite;p5:Finite;p95:Finite};
type SensitivityRow = {key:Row;atLow:CostValue;atHigh:CostValue;
 lo:CostValue;hi:CostValue;swing:Finite|Unbounded};
type RecordedRun = {inputHash:Hash;draws:5000;seed:number;none:number;
 cost:CostSummary;outcome:OutcomeSummary;likely:{cost:Finite;outcome:Finite};
 sensitivity:{base:Finite;rows:SensitivityRow[]};
 costsSha256:Hash;outcomesSha256:Hash;
 numericalPolicy:"guarded-finite-intermediates-v1"};
type PointBasis = {kind:"user-assumption"|"source-informed";
 sourceIds:Id[];rationale:string};
type Basis = Six<{low:PointBasis;likely:PointBasis;high:PointBasis}>
 & {discount:PointBasis};
type LocalChecksum = {kind:"local-bytes";sha256:Hash;byteLength:number;hashedAt:Instant};
type SourceDescription = {id:Id;title:string;publisher:string|null;url:string|null;
 locator:string|null;published:PartialDate|null;accessedOn:Day|null;
 access:"public"|"restricted"|"not-shared"|"unknown";license:string|null;
 note:string;checksum:null|{kind:"declared";sha256:Hash}|LocalChecksum};
type SourceModel = {sourceId:Id;artifactSha256:Hash;interpretation:string};
type Content = {enginePin:EnginePin;classification:"illustrative"|"user-authored";
 title:string;purpose:string;programDescription:string;
 population:{description:string;geography:string|null;eligibility:string;timeHorizon:string};
 period:{label:string;from:PartialDate|null;to:PartialDate|null};
 outcome:{name:string;definition:string;measurement:string;scope:"one-outcome"};
 money:{currency:"USD";priceYear:number|null;basis:"nominal"|"constant-price"|"unknown";
 inclusions:string;exclusions:string;adjustment:string|null};
 assumptions:{independence:string;chanceAsScale:string;counterfactual:string;
 discountRationale:string;harmsAndSpillovers:string;sourceDepthLimit:string;other:string};
 sources:SourceDescription[];sourceModel:SourceModel|null;raw:Raw;input:Input;
 basis:Basis;run:RecordedRun;limitations:string[]};
type RunFingerprint = {inputHash:Hash;runHash:Hash;costsSha256:Hash;outcomesSha256:Hash};
type RunField = "inputHash"|"draws"|"seed"|"none"|"cost"|"outcome"|"likely"|
 "sensitivity"|"costsSha256"|"outcomesSha256"|"numericalPolicy";
type CopyObservation =
 {kind:"matched"|"mismatched";declared:RunFingerprint;recalculated:RunFingerprint;
 differences:RunField[]}
 |{kind:"arithmetic-refusal";declared:RunFingerprint;recalculated:null;
 differences:[];issue:NumericalIssue};
type Origin = null
 |{kind:"selected-bundle-copy";sourceVersionId:Id;sourceVersionHash:Hash;
 sourceContentHash:Hash;chosenFileSha256:Hash;observation:CopyObservation}
 |{kind:"local-version-copy";sourceModelId:Id;sourceVersionId:Id;
 sourceVersionHash:Hash;sourceContentHash:Hash};
type FrozenVersion = {id:Id;modelId:Id;sequence:number;previous:Head|null;
 recordedAt:Instant;amendmentReason:string|null;origin:Origin;
 content:Content;contentHash:Hash;hash:Hash};
type SelectedBundle = {format:"charitology-cost-effectiveness-bundle";schemaVersion:1;
 exportedAt:Instant;label:"User-entered model; not measured or independently reviewed.";
 engine:KnownEngine;modelVersion:FrozenVersion;
 omissions:["Other versions, unrelated models and unfinished private writing are excluded."];
 checksum:Hash};
```

`NumericalIssue` is exactly the closed numerical error shape in section 4. Finite cost values are strictly positive; finite outcome/swing values are nonnegative. All-mode cost/outcome and sensitivity base are strictly positive and base equals likely.cost. Cost summary ordering uses no-outcome above finite values. `none` is an integer 0..5000; six sensitivity keys are unique and correctly ordered. A no-outcome cost summary is allowed when the type-7 infinite-upper rule derives it, not as an overflow escape. Unbounded is legal only in sensitivity.swing with exactly one no-outcome endpoint. Structural admission checks these rules and hashes; only actual recalculation establishes numerical agreement.

Normalized cost/people lows exceed 0. All triples are finite, nonnegative and ordered low<=mode<=high; works is 0..1, anyway 0..0.99; works/effect/years modes exceed 0. Discount is 0 inclusive to 1 exclusive; seed is integer 1..4294967295. Draw count is exactly 5000. No arbitrary magnitude clamp, silent ignored row or changed draw count is admitted; arithmetic may still refuse an otherwise well-shaped input. Raw.unit.trim() exactly equals outcome.name, which is a named unit and operational definition, not a common comparability guarantee. Raw.name is the original literal calculator label and need not equal the separately authored title.

Sources are at most 20, IDs unique within that content snapshot, and source lists/point references preserve explicit order. Each point has at most three unique existing source IDs and a nonblank rationale. Source-informed requires at least one. A user assumption may explicitly cite none. An otherwise unused source requires a nonblank note explaining its background role. SourceModel, if present, references a source whose declared/local checksum equals artifactSha256 and has a nonblank interpretation; it confers no verified/real-model badge. URLs are inert citations: exact HTTPS text <=1200 units, no credentials/control characters, localhost/local-domain or IP-literal host; links render as text or safe external anchors. Nothing is fetched. No filename, path or body is retained. Access/license/checksum declarations do not prove truth or redistribution rights.

The new local-bytes creation action follows the explicit bounded file-hash lane and owns an ephemeral SourceChecksumHandle bound to source ID and exact checksum DTO. Manually typing a new local-bytes object does not prove that action: freeze requires that handle or the identical historical checksum from the exact local/imported version being copied. After draft-only restore, a new unfinished local-bytes claim needs fresh hashing or an explicit user edit to declared; no automatic conversion occurs. Imported historical local-bytes metadata is labeled the file's claim, never proof of a current local selection. The ephemeral handle permits retaining an already hashed checksum through unrelated text edits, but replacing its source ID/checksum or its file choice revokes it. Existing immutable local/imported declarations remain provenance, not verified evidence.

Currency is USD only. Price year is null or integer 1900..2200. Constant-price requires a known price year and nonblank adjustment explanation; other bases have adjustment null. No app conversion occurs. Unknown price year stays visible. All required descriptive fields can honestly describe unknowns but cannot be silently filled. Classification starts illustrative for the built-in example; user-authored does not mean real or observed.

The fixed limitations array is exactly these strings in this order:

```text
Inputs are user-entered assumptions unless their sources have been independently checked.
The six triangular inputs are sampled independently; correlation is not modeled.
Chance scales expected outcomes and is not a simulation of program success or failure.
One defined outcome is counted; unlike outcomes are not made comparable.
Harms, spillovers and outcomes outside this model are not calculated.
Discounting is an authored choice; fractional years use geometric continuation.
Five thousand draws are a finite simulation of the entered ranges.
Calculation and numerical reproduction are not observation or causal impact.
Exact reproduction depends on the pinned engine and this JavaScript runtime.
Source descriptions, checksums and local timestamps do not establish independent review.
This bundle is not a charity rating, ranking or automatic giving decision.
```

## 6. Raw normalization and complete array fingerprints

Strict decimals trim only surrounding whitespace for interpretation, retain the original string, cap the interpreted token at 128 UTF-16 units and require `^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$`. No exponents, separators, currency symbols or units. Strict seed instead matches `^[1-9][0-9]{0,9}$` plus the exact seed range. Legacy copies use the inspected digit-presence rule, `Number(raw.trim().replace(/[^0-9.\-]/g,""))` and separate `Number(raw.seed.trim())`, with the old row bounds *before* percent division, plus the new numerical refusals. Explain e.g. legacy `1e3`→13 rather than silently calling it 1000. Retain legacy mode after edits. Explicit conversion to strict creates/reviews a new all-field draft; it never reparses unchanged fields silently.

Raw/normalized agreement is mandatory on every freeze/import/backup validation. Normalize parsed -0 to +0 explicitly. Works, anyway and discount raw values are percent; normalized values are shares. Each conversion uses the original `/100` association and checks positive-to-zero collapse before proceeding. Imported normalized numbers never pass through a string-stripping parser; they must equal a fresh parse of the retained raw DTO. Draft malformed strings remain strings and do not become null or zero.

Input hash covers exactly `{enginePin,input}`. Run hash covers exactly RecordedRun. Hash each complete separately sorted array with UTF-8 prefix `charitology-ce-array-v1\n`, then `costs\n` or `outcomes\n`, then exactly 5000 IEEE-754 eight-byte big-endian values. Costs use +Infinity only for genuine zero-outcome sentinels; outcomes are finite. Encode every zero as +0. The cost/outcome hash streams are exactly 40,030/40,033 bytes. Neither chart bins, rounded summaries, formatted money nor old CSV enters a reference hash.

The selected file retains RecordedRun and both array hashes rather than 10,000 redundant values. An optional generated draws file is exactly `{format:"charitology-model-draws",schemaVersion:1,versionId,versionHash,enginePin,inputHash,costsSha256,outcomesSha256,costs:CostValue[],outcomes:Finite[],notice:"Arrays are separately sorted; paired simulation indices are absent.",checksum}`. Each array has exactly 5000 entries, derived only from a current owned successful reproduction. Checksum uses kind draws. This is not a restore/source format.

## 7. Local graph, exact draft and persistent copy observations

Use only new local key and exclusive Web Lock `charitology.model-bundles.v1`. There is no initial write. State is:

```ts
type ImportReceipt = {sourceVersionId:Id;sourceVersionHash:Hash;sourceContentHash:Hash;
 chosenFileSha256:Hash;localModelId:Id;localVersionId:Id};
type TextForm = {classification:string;title:string;purpose:string;programDescription:string;
 populationDescription:string;populationGeography:string;populationEligibility:string;
 populationTimeHorizon:string;periodLabel:string;periodFrom:string;periodTo:string;
 outcomeName:string;outcomeDefinition:string;outcomeMeasurement:string;
 moneyPriceYear:string;moneyBasis:string;moneyInclusions:string;moneyExclusions:string;
 moneyAdjustment:string;independence:string;chanceAsScale:string;counterfactual:string;
 discountRationale:string;harmsAndSpillovers:string;sourceDepthLimit:string;other:string;
 amendmentReason:string};
type JsonForm = {sources:string;sourceModel:string;costBasis:string;peopleBasis:string;
 worksBasis:string;effectBasis:string;yearsBasis:string;anywayBasis:string;discountBasis:string};
type EditorForm = {raw:Raw;text:TextForm;json:JsonForm};
type Draft = {mode:"new"|"amend"|"copy";modelId:Id|null;expectedHead:Head|null;
 origin:Origin;form:EditorForm;dirty:boolean};
type State = {format:"charitology-model-bundles";schemaVersion:1;id:Id;revision:number;
 createdAt:Instant;updatedAt:Instant;engines:KnownEngine[];
 models:{id:Id;title:string;currentVersionId:Id}[];
 versions:FrozenVersion[];imports:ImportReceipt[];draft:Draft};
type FullBackup = {format:"charitology-model-bundles-backup";schemaVersion:1;
 exportedAt:Instant;state:State;checksum:Hash};
```

The editor has 58 text leaves plus its parser selector, within the 64-leaf bound. Raw has 22 string leaves; TextForm has 27; JsonForm has nine. In Draft.form, each string leaf has the 16,384-unit repair-text bound and the whole form has the 512 KiB bound; stricter frozen content/raw field bounds apply when compiling Content. Its JSON subfields preserve unfinished text exactly. Parsing them only happens on explicit preview/freeze; sources/sourceModel parse their closed DTOs and each row basis parses exactly `{low,likely,high}`, while discountBasis parses one PointBasis. PeriodFrom/To are blank for null or exact PartialDate JSON; moneyPriceYear is blank for null or integer decimal. Do not invent hundreds of hidden scalar fields or rewrite malformed JSON on hydration. Live RAM can retain text too large/unrepresentable for persistence; that does not make it a valid saved state.

Owned state/model/version IDs are globally distinct. Source IDs are scoped to each content snapshot; external provenance IDs are not local write authority. Each model has exactly one contiguous sequence 1..n. Sequence 1 has previous null and amendmentReason null; later nodes point by exact ID/hash to immediately preceding same-model node and have a nonblank amendment reason. No orphan, fork, duplicate sequence, cycle or alternate head is admitted. CurrentVersionId is the final node and models.title equals its current content.title. Arrays are in deterministic order: models by ID, versions by model ID then sequence, engines by definitionHash and receipts by sourceVersionId then sourceVersionHash. No per-model/history deletion is part of v1; Clear replaces the whole local state through guarded recovery.

First local authored freeze has origin null. A selected copy root records its exact incoming version/content/file pins and an actual copy-time observation. A local-version copy root records that source's exact local pins; its source node must exist and cross-copy origin edges must be acyclic. Amendments propagate their root's exact origin unchanged. Local copying creates a new model, never changes a source current head. A selected packet can disclose an unavailable ancestor via its previous pin; that inert boundary cannot fill a missing local predecessor in a full backup. An imported version is not installed as a local owned version.

Matched/mismatched observations contain exact declared/recalculated run fingerprints. Differences are nonempty for mismatched, empty for matched, unique and in RecordedRun field order. Arithmetic-refusal has only its declared fingerprint and closed issue. These observations are immutable self-recorded historical facts, not trusted restored verification. The UI always shows them as copy-time observations alongside the *current* run fingerprint. Later edits can change local results without rewriting that original comparison. A restored matched observation never displays reproduced-on-this-browser.

Every receipt points to an existing sequence-1 local selected-copy version with matching root origin and source pins. Its chosenFileSha256 is the actual file used for that accepted copy. At most one receipt exists per source version ID; another exact version/content hash is an idempotent replay, even if a later wrapper export has a different timestamp/filename/file hash. Preserve the first actual receipt and never rewind later amendments. Same source version ID with different version/content hash refuses a conflict; new incoming IDs never join or overwrite local IDs. Copying an already copied file into an intentional separate branch uses the explicit `copy-selected-draft` command with purpose `intentional-new-branch`, not replay. It creates a draft only; a later fresh freeze creates the local root without adding a second receipt for that incoming source version.

Draft new/copy targets have modelId/expectedHead null; amend targets name an existing model and an exact retained version of it. Admission may preserve a stale expectedHead as unfinished writing, but freeze requires it to equal the current head. The UI explains stale basis and requires explicit renewed review before retargeting. Draft origin is null or the exact captured copy provenance. It is never supplied as a boolean verification flag. New selected-copy provenance is derived only by the owned `copy-selected-draft`/`copy-reproduced` commands, never accepted from a caller-constructed Draft.origin. `copy-local-draft` validates its exact source node/model pins against the complete local State and derives the origin. `save-draft` and `freeze` may retain only the exact already-admitted current draft origin; they cannot introduce or replace it. An admitted restored draft may retain its file-declared historical origin, visibly unverified, without receiving any contemporary selected-file or reproduction handle.

## 8. Inspection, reproduction and mismatch paths

`admitSelected(bytes)` validates the complete selected envelope, hashes, known inert engine, normalized/raw agreement, metadata, declared output shape and source references. It owns the original chosen bytes/hash. Admission is not reproduction and performs no write. The reader presents original source, authored assumptions, period/unit/currency, declared output and every missing previous/local-origin body as an inert boundary, labeled not yet recalculated here. Those origin pins do not resolve an absent node in a full backup or authorize a write.

`recalculate(admitted)` dispatches only the known precommitted engine. Compare every RecordedRun field plus input/array/run hashes exactly. A completed comparison grants an ephemeral WeakMap-owned comparison-outcome handle bound to file hash, version hash, engine pin, selection and editor/store generations. Its projection is exactly CopyObservation: matched, mismatched or arithmetic-refusal. Only matched retains successful arrays and may authorize reproduced copy/draws; mismatch/refusal may authorize only the acknowledged draft-only command below. A cancelled/stale job, invalid envelope or unknown engine grants no outcome handle. No serialized flag or caller-constructed `{verified:true}` is accepted. Errors/mismatches preserve file/draft and show fixed differing fields or numerical issue; no source bundle is resealed or amended.

`Copy reproduced version` requires a current matched comparison-outcome handle, explicit all-outgoing-fields review and saved-state bindings. It creates a new local model, new sequence-1 ID/time and actual recomputed run, with selected-copy provenance and receipt. An exact existing receipt yields a no-op without claiming fresh reproduction or changing a later head.

After a mismatch or arithmetic refusal, the *separate* acknowledged `copy-selected-draft` command with purpose `comparison-mismatch-or-refusal` retains admitted input/metadata and the actual copy-time observation from the matching owned handles. It creates no frozen version, receipt or reproduction badge. A later freeze must freshly calculate locally and records the root observation; display both source-declared/copy-time/current run fingerprints. Refused arithmetic needs edited admissible inputs before it can freeze. Unknown engines permit only inert errors and exact raw-file recovery, not canonical input-copy/recalculation or execution of supplied text.

Full backup validates the entire graph and declared historical outputs without rerunning up to 100 versions. Restore resets all ephemeral reproduction/preview/undo handles and reads each version as not checked here. A malformed historical run is structurally refused; a well-shaped but numerically mismatched one can be preserved as declared historical output until explicit recalculation reveals the mismatch. Neither backup nor selected file can grant contemporary authority.

## 9. Abortable browser file and computation lane

Use one owned native FileReader for the shared selected-bundle, full-backup and source-checksum lane. Do not copy R3/D1's `Promise.race(File.arrayBuffer(),timer)` and claim physical cancellation: that pattern cannot abort the native read. The actual remaining-record recovery controls provide the inspected abort-and-detach pattern and 30,000 ms limit.

Before *every* new choice, including empty, multiple, oversized/invalid choice, native `cancel`, explicit Cancel, recovery action, foreign-storage conflict or disposal: revoke its epoch, detach load/error/abort handlers, clear its timer, abort the old reader and terminate any owned calculation worker. Detach before abort so its native or retained synthetic callback cannot repaint. Reject that read's owned promise once. An old cleanup may clear only its own active handle. Keep the input able to receive a new change/cancel while work is running; clear its chooser value after snapshotting the File so the same file can be selected again. Where native cancel events are unavailable, the explicit Cancel control is the supported cancellation action; do not claim detection of an unobservable cancel.

Require exactly one File, safe integer size 0..the operation cap before reading, and a 30-second timer that aborts/detaches. On load require actual ArrayBuffer, exact equality with snapshotted File.size and actual bytes <=cap. Fatal decode and actual full DTO admission follow; MIME and extension grant no authority. Selected/backup cap is 2 MiB; checksum-file cap is 8 MiB. Hash/checksum selection does not inherit an older source ID or file. No File object/body/path enters state or a proposal.

Runs use one same-origin module worker with the fixed allowlist, not source text from a bundle. Terminate on revocation or a 30-second calculation deadline; no partial run is accepted. Worker messages bind the exact owned job/epoch/input/engine pins. Tests may control scheduling but cannot inject a production math implementation. Without an available worker, verified calculation/freeze is unavailable; the existing calculator and exact raw recovery remain available. This is preferable to silently blocking cancellation with a synchronous unbounded fallback.

WebCrypto digest promises themselves cannot be physically aborted. Maintain one payload-work lane: invalidation revokes delivery immediately, but a timed-out/revoked nonabortable digest retains its occupied lane until it settles. Keep only the latest queued File reference; do not start another read/digest over retained old payloads or release a false one-job semaphore on timeout. A hung digest leaves the new operation unavailable with a clear reload/recovery message, not unlimited concurrent jobs. Release all owned bytes when obsolete work settles. Deadline timers are browser-scheduled bounds, not a hard real-time guarantee while the browser is suspended.

## 10. Bounded offline CLI

Expose exactly `node scripts/verify-model-bundle.mjs <one-file> [--json]`. Reject duplicate/unknown flags, URL/stdin/directory inputs and additional paths. Do not discover files, install packages, fetch sources, write source text/output files or execute code from the file. Default output and JSON report contain fixed statuses/pins/differing fields, not whole private source text.

Open the explicit final path read-only with final-component no-follow and nonblocking flags where supported; fail closed with a platform-capability message if the safe regular-file admission is unavailable. `fstat` the held handle, require regular file and initial size <=2 MiB. A preliminary stat plus unbounded readFile is prohibited. Read in <=64 KiB chunks with a hard total stop at cap+1 bytes (the extra byte detects growth), then refuse >cap. Use a 30-second abort/destroy deadline, detach listeners and close the owned handle in finally. Never read an entire growing file into an unbounded buffer.

Recheck held-file size/identity and nanosecond modification/change metadata and final path identity; refuse a detected replacement or concurrent change. The held-handle/limit checks are a cooperating-filesystem safety measure, not authenticity against privileged mutation. Hash the exact admitted bytes. Parse/admit through the same strict bounded codec and run only the static known engine in a terminable worker with a 30-second deadline. Fixed JSON parser work/engine draws are separately bounded; no caller timeout or draw argument raises them.

The JSON result is `{format:"charitology-model-verification",version:1,status:"matched"|"mismatched"|"invalid"|"unsupported"|"numeric-refusal"|"unavailable",chosenFileSha256:Hash|null,versionHash:Hash|null,enginePin:EnginePin|null,declared:RunFingerprint|null,recalculated:RunFingerprint|null,differences:RunField[],issue:NumericalIssue|null,message:string}`. No file path, user-agent or full source narrative is included. Output is <=8 KiB. Exit 0 matched; 1 mismatched; 2 invalid/unsupported; 3 numeric refusal; 4 I/O/runtime/deadline unavailable. No approximate-match status exists.

## 11. Persistence, Retry, recovery and page lifecycle

Prepare snapshots owned memory revision/hash, exact observed saved string, command/raw generation, selected file/version and expected head before awaits. Commit under the exact Web Lock rechecks all bindings, strictly admits the complete candidate and measures its complete future pretty backup before a single setItem/removeItem. Never write under a stale view or silently accept a foreign disk string. Missing is distinct from readable corrupt strings and a denied/unavailable read. Corrupt original code units remain protected for an escaped exact raw recovery download, not parsed as an empty state.

Store commands are the closed union in section 14; reload/retry are distinct session actions. IDs/times/candidate runs are generated once during preparation and retained after quota failure. Retry attempts only the same valid candidate against its saved-string baseline; it does not rerun/freeze/create another version. If a write succeeded but readback failed, label persistence unconfirmed, possibly already saved. Retry finding the exact candidate string reconciles as saved without another semantic command. A different foreign change blocks Retry without discarding the candidate or literal form. While a candidate is unresolved, block other mutations but permit raw recovery and editing; a deliberate Retry explicitly covers the original candidate, never silently includes newer form text or overwrites it on completion. Explicit dirty-confirmed reload revokes older operations and replaces memory only after a fresh read.

Restore/Clear/Undo are one-use previews bound to memory hash/generation and exact disk string; a newly observed foreign write first refuses and requires another review. Undo is available only for the most recent successful Restore or Clear, not freeze/copy/save-draft; it restores the exact owned prior complete state/absence under its saved-string precondition. It is revoked by reload, foreign change, another write or lifecycle suspension. There is no version-delete/rewind disguised as Undo. Clear removes the owned key and leaves a new empty unsaved RAM workspace; it does not touch another key.

Unsupported Web Locks or secure hashing makes persistence read-only; no lock-free fallback or auto migration. Calculations/exports are available only to the extent their required runtime/admission capabilities exist. All forms install synchronous submit interception before enabling named private controls; script-free/startup-failed HTML cannot submit private writing by GET. No constructor file read, calculation, write or old-key access occurs without the declared store opening/explicit user action.

On `pagehide.persisted`, keep the mounted controller, exact raw form, selected IDs and readable state. Revoke queued writes, previews, undo and file/reproduction authority; cancel timers/autosave and abort/terminate owned I/O/work. On `pageshow.persisted`, reread only the exact new key through the store, reconcile status/capabilities and preserve the DOM/form; do not hydrate, silently save or overwrite writing. If opening is pending, retain ownership of its initial read and set resumeCheck; after open resolves perform the resumed read *before* any first hydration, guarded by the still-current initial token. The store has no writes during opening. Nonpersisted pagehide disposes and detaches all listeners. A delayed success or error cannot replace a newer view, status or form. Final native BFCache proof remains an acceptance task.

## 12. Independent count, text and byte limits

All limits apply jointly and refuse without pruning or truncation; browser quota may be lower. Text lengths count UTF-16 code units independently of UTF-8 complete-byte limits.

| Object | Limit |
| --- | --- |
| Models / immutable versions / selected-copy receipts | 20 / 100 / 100 per state |
| Known engines / inert engine object | 1 / 128 KiB complete JSON |
| Source descriptions / source IDs per point | 20 per version / 3 unique per point |
| Selected JSON / complete pretty full backup | 2 MiB each, including every closure/checksum/time/newline |
| Raw editor / individual text leaf | 64 leaves, 512 KiB complete canonical form / 16,384 units |
| Decode depth / decoded nodes | 32 / 100,000, counted before object materialization exceeds work bound |
| Strict numeric token / legacy numeric raw field | 128 / 16,384 units |
| Title / raw name / outcome name/raw unit | 120 / 120 / 80 units |
| Required descriptive text / rationale and assumption | 2,000 / 8,000 units |
| Source title/publisher / locator / license/note | 180 / 500 / 2,000 units |
| Source URL / declared or local hash input | 1,200 units / 8 MiB file |
| Generated draws / optional proposal / raw form recovery | 1 MiB / 512 KiB / 8 MiB complete output |
| File read / calculation worker deadline | 30,000 ms each |

Nonblank is a validation predicate, not mutation. Required descriptive fields and basis rationales must contain nonwhitespace. Geography/publisher/locator/license/URL/dates and monetary adjustment use their stated null cases. Assumptions.other and source.note may be empty except required unused-source explanations. Price/basis and enum raw form leaves may be unfinished strings until explicit admission. Complete composed bounds win over per-field maxima.

Unpaired-surrogate/over-limit raw writing cannot enter a canonical selected bundle or valid saved state. Preserve it in the live form and offer an exact separate raw recovery text, using JSON.stringify of the complete raw form so lone code units become JSON escapes. Never pass that raw lone-surrogate string directly to Blob and claim exact preservation. The recovery file is headed `Unfinished model bundle form recovery; not a valid bundle or workspace backup` and includes an escaped JSON `{exportedAt,form}`. This is not accepted by any import. If complete recovery exceeds 8 MiB, refuse that download, keep the visible form and explain manual field copying; no truncation or universal unlimited-recovery promise. Existing D1 raw/native behavior is untouched.

## 13. Illustrative software versus a real source artifact

The current school-meals example and all acceptance fixtures remain illustrative. A source citation, user-authored classification, locally hashed file, frozen equation or exact reproduction does not turn them into a real-world estimate. No actual source model artifact was established by this proposal/review; do not seed one using the probe's numbers or make up a publication/review record.

A real source artifact means an actual identifiable source model document/file, with exact version/date/URL/locator, actual bytes/hash where lawfully retained, declared rights/access and a documented mapping from that artifact to these six inputs, units, population, currency basis and period. The optional sourceModel descriptor can record a user's explicit claimed mapping; the UI labels that as a user description, not Charitology verification. A published artifact needs separate inspected source/rights and public-history evidence. Reproducing this engine does not reproduce a different source's model just because its title/summary agrees.

The local software may be accepted with fictional fixtures. It cannot close the reviewed public model-coverage requirement. The first public registry remains empty unless a separate source-controlled capture is authorized and reviewed: one actual selected model artifact, permitted retained source scope, exact native/adapted mapping, immutable model/engine/version files, source→artifact lineage and public correction history. This is finite follow-on content/publication work, not permission to perform research/outreach or add a provider now. The specific real artifact and redistribution basis are unresolved inputs, stated here rather than invented. Preserve this distinction in later acceptance/HANDOFF/mega-list wording.

The first local release can export an optional Markdown proposal beside the selected JSON. Its fixed title is `User-submitted model proposal, not published or independently reviewed`. It includes exact selected-file/version/content/engine hashes, known equations, authored metadata/source list/assumptions and rights limitations, with no full backup, unrelated history, unfinished editor, local path or runtime fingerprint. Preview every outgoing field and warn that citation text may itself be private. Render authored text as JSON-escaped indented code blocks with each line prefixed four spaces; never interpolate it into Markdown headings, raw HTML, links or unescaped fences. The wrapper is <=512 KiB and refuses rather than omits fields. It creates no GitHub request/upload, publication edition or reviewer identity.

## 14. Pure and controller integration interfaces

Implement under `src/lib/model-bundles/` with the immutable inventory above, exact types/canonical/graph/registry modules, a separate client store/UI, one `ModelBundles.astro` sibling mount, narrow styles and read-only verifier. The new mount is outside the old D1 root so file/recovery/lifecycle events cannot be mistaken for edits to the old saved library. No implementation file is created by this proposal.

The public pure entry points and exact command/review/result DTOs are:

```ts
declare const handleBrand:unique symbol;
type Opaque<T extends string> = {readonly [handleBrand]:T};
type AdmittedSelected = Opaque<"selected">;
type AdmittedBackup = Opaque<"backup">;
type ComparisonOutcome = Opaque<"comparison-outcome">;
type Prepared = Opaque<"prepared">;
type UndoHandle = Opaque<"undo">;
type SourceChecksumHandle = Opaque<"source-checksum">;
type OwnedJob = {epoch:number;formGeneration:number;storeGeneration:number;
 isCurrent:()=>boolean;signal:AbortSignal};
type OwnedContext = {job:OwnedJob;now:Instant;newModelId:Id|null;newVersionId:Id|null;
 sourceChecksums:ReadonlyMap<Id,SourceChecksumHandle>};
type Inspection = {bundle:SelectedBundle;chosenFileSha256:Hash;
 reproduction:"not-checked-here"};
interface ModelBundlePureAPI {
 admitSelected(bytes:Uint8Array):Promise<AdmittedSelected>;
 inspectSelected(value:AdmittedSelected):Readonly<Inspection>;
 recalculate(value:AdmittedSelected,owned:OwnedJob):Promise<ComparisonOutcome>;
 inspectComparison(value:ComparisonOutcome):Readonly<CopyObservation>;
 prepareCommand(state:State,command:Command,context:OwnedContext):Promise<Prepared>;
 makeSelected(state:State,versionId:Id,exportedAt:Instant):Promise<Uint8Array>;
 makeBackup(state:State,exportedAt:Instant):Promise<Uint8Array>;
 admitBackup(bytes:Uint8Array):Promise<AdmittedBackup>;
 parseBackup(bytes:Uint8Array):Promise<State>;
 makeDraws(result:ComparisonOutcome):Promise<Uint8Array>;
 makeProposal(selected:AdmittedSelected):Promise<Uint8Array>;
}

type Command = {kind:"save-draft";draft:Draft}
 |{kind:"freeze";draft:Draft}
 |{kind:"new-draft";discardCurrentDraft:true}
 |{kind:"amend-draft";sourceModelId:Id;source:Head;discardCurrentDraft:true}
 |{kind:"copy-reproduced";selected:AdmittedSelected;comparison:ComparisonOutcome}
 |{kind:"copy-selected-draft";selected:AdmittedSelected;comparison:ComparisonOutcome;
   purpose:"comparison-mismatch-or-refusal"|"intentional-new-branch";
   acknowledge:"Copy inputs to a new draft without a reproduction claim."}
 |{kind:"copy-local-draft";sourceModelId:Id;source:Head}
 |{kind:"restore";backup:AdmittedBackup;discardLocal:true}
 |{kind:"clear";discardLocal:true}
 |{kind:"undo";undo:UndoHandle};
type Review = {operation:Command["kind"];reviewHash:Hash;
 beforeStateHash:Hash;candidateStateHash:Hash|null;candidateBackupBytes:number;
 candidate:State|null;createdVersion:Head|null;chosenFileSha256:Hash|null;
 notice:"Only this exact reviewed local command is authorized."};
type StoreSnapshot = {generation:number;memory:State;
 persistence:"absent"|"saved"|"corrupt"|"unavailable"|"conflict";
 pending:"none"|"retry";savedSha256:Hash|null;message:string;
 capabilities:{canCalculate:boolean;canPersist:boolean;canReadNative:boolean}};
type StoreCode = "stale"|"foreign-save"|"unavailable"|"quota"|"invalid"|"unsupported";
type CommitResult = {kind:"saved"|"removed"|"noop";snapshot:StoreSnapshot}
 |{kind:"unconfirmed";candidateStateHash:Hash;retryAvailable:true;snapshot:StoreSnapshot}
 |{kind:"refused";code:StoreCode;message:string;snapshot:StoreSnapshot};
interface ModelBundleSession {
 snapshot():StoreSnapshot;
 preview(command:Command):Promise<{review:Review;handle:Prepared}>;
 commit(handle:Prepared):Promise<CommitResult>;
 retry():Promise<CommitResult>;
 reload(options:{discardLocal:true}):Promise<StoreSnapshot>;
 rereadStatus():Promise<StoreSnapshot>;
 rawSavedRecovery():Promise<Uint8Array|null>;
 undo():UndoHandle|null;
 dispose():void;
}
```

AdmittedSelected/AdmittedBackup/ComparisonOutcome/Prepared/UndoHandle/SourceChecksumHandle are module-owned opaque WeakMap handles; serializers/commit recheck actual ownership, current bindings and complete DTOs. ParseBackup is the detached read projection of admitBackup and cannot supply a restore handle. No structural caller handle grants a write. ComparisonOutcome's public projection is exactly CopyObservation. Only the current matched handle retains private successful arrays and supports copy-reproduced/draws. A mismatched/refusal handle cannot be converted to matched by structural mutation or reused with another selection. `makeDraws` freshly checks matched ownership/current bindings. A restore handle owns the original complete admitted backup bytes/hash, not a caller-supplied state. UndoHandle is obtainable only from a successful restore/clear on this same session and is never serialized. The UI's source hash lane returns exactly `{checksum:LocalChecksum,handle:SourceChecksumHandle}`; it takes one explicit source ID/File/OwnedJob and uses section 9's admission, with hashedAt captured once before hashing. A checksum typed into JSON supplies no such handle.

Freeze compiles the exact draft into Content, requires its fresh run and current expected head, and either appends one node or returns noop for exact current-identical content while preserving writing. Save-draft changes only draft. Copy-reproduced uses matching current selected/comparison handles with a matched observation and performs the idempotent receipt rule. Copy-selected-draft requires the exact acknowledgement, a selected/comparison pair owning the same original bytes/version/engine and current job bindings; comparison-mismatch-or-refusal permits only those two outcome kinds, while intentional-new-branch permits any completed known-engine comparison. It derives source/version/content/file pins and observation privately, copies all admitted authored metadata/raw fields into a new copy-mode draft with null modelId/expectedHead, and creates no version, model or receipt. Copy-local-draft resolves sourceModelId plus exact source Head in the current complete State, derives its local origin and creates only that draft. Both draft-copy commands require newModelId/newVersionId null, preserve their source, and refuse an unacknowledged dirty-draft replacement through a fresh all-outgoing-fields review. A later freeze allocates a fresh model/version and preserves that admitted origin exactly; no new receipt is invented by a draft freeze. No incoming Head overrides local expected-head authority. Review.reviewHash covers all other Review fields through kind review, excluding only reviewHash itself. Revision/generation are positive safe integers and refuse at their ceiling. Generation is ephemeral; state revision increments once per successful content/draft change, with no increment on Retry reconciliation or noop. New absent/corrupt/unavailable opening creates one empty valid RAM state/ID/time without saving or interpreting old strings. Corrupt/unavailable persistence has canPersist false until explicit protected recovery/review; current raw strings remain private and only rawSavedRecovery exposes their escaped recovery on deliberate action. A clear command's candidate is null because the key will be absent; candidateStateHash is null and candidateBackupBytes is 0, while its retained new RAM workspace is session-owned. Other candidate fields refer to the whole strictly valid next State. An unconfirmed clear uses its retained new RAM state hash in CommitResult and the same absent-key Retry target. Messages are fixed or safely bounded <=500 units; they contain no raw source body or arbitrary exception dump.

OwnedJob/OwnedContext are controller-owned internal inputs, never parsed from files. Context now/new IDs are generated/captured once by session preparation; only commands needing a new model/version receive nonnull IDs, each checked against the entire inventory. Fixed platform scheduler cancellation and separately injected test ID/time generators do not replace arithmetic/admission. No public file/DOM field supplies a validator, engine, state hash, success flag or lifecycle exemption. The session additionally owns exact disk/memory preconditions in its Prepared WeakMap, unavailable through a structural context. Final strict assignability fixtures implement these exact interfaces before parallel coding; splitting helpers must not add fields or behavior.

Store adapter injection is limited to exact-key storage, locks, platform hashing/readers/workers, owned ID/time generation and controlled test scheduling. Production fixes each capability and validates its results. Tests may simulate quota/read/late events and mutate queued arguments; they must not substitute admission, arithmetic, engine allowlists or actual native codecs. Freeze checks the entire candidate graph and complete backup size; export and restore share those validators.

## 15. Acceptance and release sequence

1. **Contract freeze:** root reviews this complete file, checks the exact Command/store result/error-path assignability fixtures and records the final hash. Keep private originals/review/probes unchanged. No routine numerical choice needs user permission. A disproved premise returns a precise amendment before dependent code changes.
2. **Frozen pure engine:** implement guards and three-file closure, engine-neutral vectors, registry and source checks. Compare actual legacy and guarded modules on ordinary compatible vectors before pinning. Known seed-array hashes from the private existing-module probe are compatibility checks, not invented new-engine results. Test seeds 1/42/4294967295, six calls including constants, both endpoint modes, legitimate u=0/constant zero, tiny/overflowing triangle products, positive split/sample/ratio collapse, percent/Number collapse, discount cancellation/power tail refusal, integer/fractional/zero years, type-7 finite/infinite cases and sensitivity ties/zero/unbounded. Every demonstrated bug must refuse at its named phase; arrays and no-outcome counts must never partially succeed.
3. **Closed graph/bytes:** actual production codec tests cover malformed UTF-8/BOM, decoded duplicates/unsafe keys, hostile object boundary, nonfinite/-0, depth/node/byte caps and +1; known-descriptor/source/golden tampering; exact raw/normalized agreement; period precision/leap dates; source refs; currency/price year; tagged positions; resealed false results; immutable amendment/current/ancestor no-op distinctions; cross-copy cycles; receipt/origin/head/title closure; mismatch/refusal provenance through later freeze and backup; and no descriptor/golden hash cycle. Construct actual maximum escaped/multibyte EditorForm fixtures and prove 58 leaves plus parser, independent form/output caps and raw lone-code-unit recovery. Do not rely on an invented stand-in parser.
4. **I/O/store/controller:** use two real cooperating exact-key adapters and real Web Locks where available. Test initial absence/corrupt/protected/denied states, queued argument mutation, exact saved-byte conflicts, quota Retry retaining IDs/run/time, one-use restore/Clear/Undo, stale head and no old-key writes. Hold actual FileReader/worker events through A→invalid/empty/B/native cancel/explicit Cancel/timeout/dispose, including late errors; assert native abort/handler detachment and one physical lane. Test nonabortable digest timeout without false slot release. CLI tests use actual temporary regular files: exact cap/+1, growth/replacement, FIFO/directory/symlink refusal, short/chunked reads, deadline/close, one path, unknown flags, output bounds and no writes/network. Mounted BFCache tests hold opening and writes across persisted hide/show, preserve literal fields and reconcile status without hydration. Test script-free/startup-failed forms and stale-last-run CSV versus fresh bundle capture.
5. **Actual native browser:** on an owned isolated origin, create a fictional user-assumption model with unknown price year, freeze/amend/inspect history, save real selected JSON and full backup, choose those exact files in a fresh desk, recalculate all hashes, deliberately copy and restore unfinished writing. Retain mismatch/refusal observations, test stale second tab, failed-write Retry, dirty source-switch cancel/confirm, recovery, keyboard/focus/status, 320/390 light/dark, long data, actual BFCache and no application warnings/network transmission. Check the original D1 key/native bytes unchanged and section 16's old CSV schema/ordinary-vector compatibility and last-successful behavior. Independently run the CLI on the actual saved selected file. Generated Blob, request body, synthetic callback and native Save are separate evidence. Clean only owned fictional keys/tabs/files.
6. **Release:** root runs the full required static/service/native regression gates, exact-head CI/build/link/source inventory checks and release review. Record immutable engine/runtime/Node/Chrome identities, actual saved-file hashes, public byte checks and cleanup in a new acceptance record. A first local release can claim the bounded voluntary workflow only; actual real-source public registry coverage, independent review, provider work and the whole mega list remain separately open. No production/provider/browser/commit action is authorized by this contract proposal.

The remaining explicit inputs are the reviewed final engine/source/golden hashes (which depend on implementation), root's review/freeze of these command/result/error-path types, actual Node/Chrome cross-runtime results and any later real source artifact/rights basis. None is replaced by illustrative data or a presumed passing test.


## 16. Proposed Amendment 1: guarded original Run and closed draft-copy authority

This amendment is part of the complete proposal, not implementation authorization. The relevant earlier sections have been reconciled above: comparison-outcome handles represent matched/mismatched/refused comparisons; only matched carries successful arrays/reproduced-copy authority; draft-only selected/local copy commands are closed in section 14. There is no caller-authored origin or serialized verification authority.

The existing Cost-Effectiveness Model Kit's Run action must use the same registered three-file guarded engine. Keep `src/lib/client/models.ts`, `montecarlo.ts`, `format.ts`, D1/native files, key `charitology.ce-models`, native entry shapes and actual native-admission source registry byte-for-byte unchanged. Implement the compatibility adapter in a new non-interpretation module, with component-only integration and bounded display helpers. It may import the fixed registry/engine; it cannot inject math, use the old run as a fallback after refusal, write a bundle key or infer any saved-model provenance. The current fourteen-file Learning native-admission manifest does not include those three old math/format files or this Astro component; do not falsely attribute them to that registry or regenerate its native bundle for this component-only integration. Other consumers such as the Impact Calculator remain outside this amendment and must not be reported as newly verified by these Run tests.

### Exact compatibility entry points

These are internal runtime interfaces, not import/backup DTOs. Raw strings are captured/detached verbatim before the first await. The wrapper accepts the actual old form shape, not a partially normalized model or bundle Content. It has no native ID/savedAt/storage access, no source/metadata requirements, no new nonblank label/unit requirement and no strict-decimal token rule. Existing UI label limits remain; unsupported bundle metadata/raw canonicalization never blocks ordinary Run. Preserve any literal writing that cannot become a canonical bundle in the original form; calculation does not sanitize it.

```ts
type LegacyCalculatorRaw = Omit<Raw,"parser">;
type LegacyCalculatorJob = {epoch:number;formGeneration:number;
 isCurrent:()=>boolean;signal:AbortSignal};
type LegacyField = Row|"discount"|"seed";
type LegacySummary = {median:number;p5:number;p95:number};
type LegacyRunProjection = {draws:5000;seed:number;costs:Float64Array;
 outcomes:Float64Array;cost:LegacySummary;outcome:LegacySummary;none:number};
type LegacySensitivityProjection = {base:number;rows:{key:Row;atLow:number;
 atHigh:number;lo:number;hi:number;swing:number}[]};
type LegacyCalculation =
 {kind:"success";raw:LegacyCalculatorRaw;enginePin:EnginePin;input:Input;
  recorded:RecordedRun;model:Six<Triple<number>>&{discount:number};
  run:LegacyRunProjection;sensitivity:LegacySensitivityProjection;unit:string}
 |{kind:"invalid";errors:Partial<Record<LegacyField,string>>}
 |{kind:"refused";issue:NumericalIssue}
 |{kind:"cancelled"};
type LegacyBin = {x0:number;x1:number;count:number};
type LegacyHistogram =
 {kind:"available";bins:LegacyBin[];below:number;above:number}
 |{kind:"unavailable";reason:"no-finite-cost-draws"|"numeric-display-range"};
interface LegacyCalculatorAPI {
 calculate(raw:LegacyCalculatorRaw,job:LegacyCalculatorJob):Promise<LegacyCalculation>;
 histogram(run:LegacyRunProjection):LegacyHistogram;
 formatMoney(value:number):string;
 formatNumber(value:number):string;
 formatMoneyTick(value:number,step:number):string;
}
type CalculatorCopySnapshot = {raw:LegacyCalculatorRaw;formGeneration:number};
interface CalculatorCopyProvider {
 capture():Readonly<CalculatorCopySnapshot>;
 isCurrent(formGeneration:number):boolean;
}
```

The trusted same-tab CalculatorCopyProvider is installed only after D1 initialization succeeds and revoked on ordinary disposal; its methods are never supplied by a file/DOM field. Capture returns the exact current raw form plus D1's actual nonnegative safe-integer form generation, not a saved record. The bundle mount checks isCurrent after each await and cannot obtain storage or save authority from it. Legacy job epoch is a positive safe integer; formGeneration uses that same actual nonnegative counter. Controller callbacks are checked outside numerical engine operations; they cannot alter arithmetic or admission. Each fresh Run increments/revokes its owned epoch before validation, aborts/terminates prior worker and starts only its own fixed worker with the 30,000 ms deadline. No synchronous old calculation is a timeout fallback. A stale/aborted result returns cancelled and cannot set last, status, chart, focus or CSV.

The fixed legacy normalizer uses the original digit-presence check before Number(raw.trim().replace(/[^0-9.\-]/g,"")); seed is exactly Number(raw.seed.trim()), an integer in 1..4294967295. There is no modulo wrapping/defaulting. Examples +42, 42.0, 1e3 and 0x2a remain valid seeds; amount 1e3 remains 13. Apply old row bounds before percent division; cost/people low >0, works 0..100, anyway 0..99, effect/years low >=0, ordered triples and works/effect/years mode >0. Discount is 0 inclusive to 100 exclusive before division. Then apply all guarded Number/percent/intermediate checks to the original parsed values, not the old check().model whose divisions may already have lost positive values. All-mode and each endpoint/draw must succeed together. Blank name stays literal and may display as Untitled model; unit is raw.unit.trim() or outcome, matching the old tool. No strict-parser conversion, named-outcome declaration or source form is inferred. Original row/seed errors are bounded fixed messages; numerical refusal returns only the closed NumericalIssue.

Success contains fresh owned display-array copies plus the exact input/RecordedRun; these mutable display copies confer no serializer/receipt/reproduction authority and never enter a frozen bundle without an independent fresh run/admission. Convert only dedicated no-outcome CostValue tags to +Infinity in LegacyRunProjection cost summaries; only genuine zero-outcome draw sentinels are +Infinity in its costs array; all outcome values are finite nonnegative, likely/base strictly positive. Map only the dedicated Unbounded sensitivity swing to +Infinity. All other projected values are the exact finite guarded values. The old numeric Last shape is an in-memory display/CSV compatibility projection, not an imported wire format. A caller-mutated array cannot alter a canonical engine output, comparison handle or array hash.

### Existing component lifecycle and last-successful CSV

Update all three current run callers: form submit, saved Load and confirmed Example. Each awaits its own generation-bound calculation; submit scrolls only after that current success. Any input/change, new Run, saved selection/load, example, clear, recovery/adoption, external storage notice or lifecycle suspension revokes the owned calculation before subsequent inspection/mutation. D1's early capture phase still prevents submit navigation and tracks fields during async initialization. The wrapper is not installed before successful D1 initialization. Ordinary pagehide disposes/terminates; persisted pagehide revokes/terminates pending Run while preserving D1/session/raw fields and last-successful output; pageshow only checks saved-byte status, never restarts or hydrates automatically. D1 recovery/keys keep their existing controller contract.

Do not replace last on invalid input, numerical refusal, cancellation, worker timeout or unexpected display preparation failure. Keep any previous complete output visibly stale and its CSV available, with a fixed actionable issue and current literal fields intact. On current successful arithmetic, precompute bounded display data, assign one coherent Last from the captured raw/input/run/sensitivity/unit, then render it. A chart-only unavailable result still counts as a successful complete calculation: show summaries/tables and honest chart-unavailable text. It does not drop successful mathematics, change none, fabricate a bin, erase CSV or fall back to old unguarded arithmetic. No partial new run can mix with old sensitivity or metadata.

Preserve the actual CSV header order `section,item,low,likely,high,value,unit`, row order, labels, units, Method sentence and slug filename. Build every row only from that captured Last. Natural works/anyway/discount values still multiply normalized shares by100. The existing finite numeric adapter remains Number(value.toPrecision(6)); dedicated nonfinite no-outcome/unbounded compatibility values keep the existing string no outcome. Name remains raw.name.trim() or Untitled model and outcome unit uses the captured trim/fallback rule. The CSV is still a human inspection export, not a reference hash, canonical bundle, lossless array export or newly formula-neutralized R3 file. Ordinary compatible successful vectors must yield the exact pre-amendment CSV bytes/filename; newly refused invalid numerics produce no new CSV and retain the prior successful bytes. A newly supported finite extreme may serialize scientific numeric text through the unchanged finite adapter rather than be misclassified as zero.

### Scientific formatting and bounded chart-only refusal

New component-local helpers use old formatting for ordinary values while keeping all positive finite values visibly nonzero. If an old number/money/tick label would contain numeric digits that are all zero for a positive input, use value.toExponential(6) (prefix $ for money); do not render $0, 0, no outcome or unlimited for a positive finite quantity. Zero remains 0/$0. The only Infinity projections retain the old explicit no-outcome/unbounded labels in their appropriate context. Preserve underlying numbers and numerical fingerprints; labels do not repair or round reference values. Format failures produce an explicit bounded display message, never an uncaught exception or fabricated result.

Histogram remains a view of the finite-cost draws with the existing 0.005/0.995 clipping and target28 policy for ordinary inputs. Its helper is display-only, outside the immutable numerical/reference inventory; q=0.005/0.995 do not enter RecordedRun. Before constructing bins or invoking a chart renderer require finite ordered bounds, finite strictly positive nonconstant step, finite start/end/index arithmetic and a positive safe-integer bin count <=128. A constant single-point range may use one finite zero-width bin. Validate every generated edge/count, count sum and finite draw membership; stop loops/allocation at128 bins, use at most32 ticks and no unbounded floating-step loop. No finite draws returns no-finite-cost-draws; other degenerate/nonfinite step/index/coordinate/tick arithmetic returns numeric-display-range, with an empty cleared histogram and fixed text explaining that the chart cannot represent this numerical range while the numbers/CSV remain available. Do not call the old histogram/niceTicks first and catch an allocation/hang afterward. Sensitivity charts use the same bounded finite-coordinate/tick checks; when unsafe or an unbounded endpoint cannot be drawn honestly, retain an ordered text/table of all exact endpoint/swing labels and state that its chart is unavailable. Successful calculations remain successful.

The actual independent current-module fixture cost=[2e-322,2e-322,2e-322], people=[1,5,10], works/effect/years=[1,1,1], anyway=[0,0,0], discount=0, seed42 has 5000 finite positive costs/none0, median4e-323. Existing niceStep becomes0, histogram throws and old formatters show zero. This is a required future guarded-wrapper/display acceptance fixture, not a claim that the unimplemented guarded engine already passed it. Its fixed summary quantile neighbors are equal, so their direct equal-neighbor branch is not a reason to invent an interpolation underflow refusal. Require finite-positive scientific labels, bounded chart-only fallback and an available fresh CSV if the actual complete guarded run succeeds.

### Amendment acceptance

Add actual strict interface/command assignability and runtime negative tests, not declaration shims. Test matched/mismatched/refusal outcome ownership, wrong selected/outcome pairing, caller-origin forgery, acknowledgement/purpose, dirty replacement, stale handles, intentional branch without receipt, later freeze retaining copy-time observation and restored unverified draft provenance. Verify copy-reproduced/draws reject every nonmatched outcome.

Run the original actual compiled math and new engine/wrapper side by side on ordinary compatible fixtures for seeds1/42/4294967295, both triangular endpoint modes, positive discount and undiscounted cases, legitimate zero low endpoints, actual no-outcome and unbounded sensitivity. Compare normalized values, all5000 separately sorted costs/outcomes by the fixed IEEE encoding, none, exact summaries/sensitivity, field labels and CSV bytes/filename. Include legacy amount1e3 and all four seed spellings, blank labels/units, negative-effect refusal and the original known tiny-rate/product/ratio/triangle/percent failures. The latter must visibly refuse through the guarded wrapper while preserving raw/native bytes and last-successful CSV. Preserve previous-module probe hashes as compatibility evidence, never rewrite them to bless a mismatch.

Actual mounted/browser tests cover all three async callers, old/new result races, input/load/example/clear/recovery during held worker, timeout, BFCache and disposed/late callbacks, no warning/uncaught errors, keyboard focus and stale labeling. Add the subnormal fixture, very large finite display range, constant/no-finite-bin fallback and bounded chart/tick work. The existing D1 native/key and fourteen-file Learning registry digests remain exact; demonstrate no new key/network request or saved-name/library behavior change. Root reviews the complete amended contract and records its new SHA before implementation is split.

## 17. Root amendment 2: explicit draft navigation and reserved creation IDs

The root reviewed and authorized this amendment on October 28, 2026 UTC after pure-command implementation exposed two missing cases in the frozen proposal `ebdc49a3b76e28e49851f3686e24a0013dbf7164afffc93fc0d8c60e8f71b8c3`. It changes no numerical interpretation, native format, existing saved key or engine pin. The two new closed commands in section 14 are draft-only navigation; they grant no frozen-version, receipt or reproduction authority.

`new-draft` deliberately replaces the current unfinished draft with a fresh blank authored form, mode `new`, null model ID, null expected head and null origin. It preserves the workspace ID, all models, versions, engines and receipts. `amend-draft` resolves `sourceModelId` and the exact `source` ID/hash against the current owned model head. Historical or foreign heads refuse; deliberate historical copying remains `copy-local-draft`. It derives an amend-mode form from that exact content, with an empty amendment reason and the source's exact retained root origin. It sets that owned model ID and exact current expected head. No caller-authored origin is accepted. Both commands require literal `discardCurrentDraft:true`, a fresh all-outgoing-fields review and explicit dirty-draft replacement confirmation in the UI. They allocate no model/version IDs. They change only the draft and ordinary state revision/update time, never amend a frozen node or erase model history. Save-draft/freeze continue to retain only the already admitted draft origin; these explicit navigation commands supply the previously missing legitimate way to change draft mode/origin.

Creation IDs in OwnedContext are reserved once during preparation for a command that can create them, before asynchronous work. A new/copy-mode freeze and copy-reproduced may receive both new IDs; an amend-mode freeze receives only a new version ID. Exact-current-content freeze and exact first-receipt replay may resolve to no-op after inspection/calculation; their reserved IDs are then unused and never persisted or exposed as created authority. Noncreating commands, including all draft-navigation/copy commands, require both IDs null. A real append still requires its needed unique IDs. No-op does not increment revision, rewind a later head, recalculate Retry or overwrite live unfinished form text. The worker, graph, complete backup and exact receipt checks remain mandatory at their existing boundaries.

Required tests cover amending an authored, selected-copy and local-copy root without caller-origin forgery; stale or historical head refusal; explicit new-draft after a copied draft; dirty replacement review; null-ID requirements; once-reserved IDs ignored on a genuine no-op; and rejection of missing/extra/colliding IDs on a real append. The original proposal and amendment-1 receipts remain separate evidence. This amendment authorizes implementation of these two cases, not a claim of completed browser acceptance or publication.

## 18. Root amendment 3: immutable reference vectors and measured runtime qualification

The root authorizes this correction after actual Linux CI at `c233fcbb68da9ebc8606407d3406e7b236e7d3c9` established exact source equality but different costs/outcomes array hashes for the three ordinary seeds. All other retained golden fields matched. The actual runtime was Linux x64, Node 24.22.1, V8 13.6.233.17-node.58. Official Node 24.21.0 on macOS arm64 passes the unchanged reference vectors; a Node-version-only cause is not established. Standard-library exponentiation is implementation-approximated, but its exact contribution to these observed differences remains an inference.

Preserve the three v1 interpretation source files, the full existing golden fixture, registry bytes, engine definition hash and golden hash exactly. Do not regenerate, re-sign, tolerate, round, discard arrays or replace a frozen observation. This amendment introduces no new arithmetic interpretation, bundle field, receipt authority or saved key. Exact per-selected-run comparison remains mandatory. A Linux fresh run may match its own retained exact result; the ordinary macOS result must report its actual differing array fields on Linux. Neither case is a universal cross-platform reproduction claim.

Keep `--check` strict: it recomputes every reference case and refuses any difference. Add a separately named readonly `--check-integrity` that checks exact retained source pins, fixed v1 hashes, definition/fixture closure and the exact retained generated representation without claiming runtime numerical conformance. Neither check may write existing v1 members. Initial-only `--create` continues to refuse any existing member. Unknown arguments refuse.

Add a closed, versioned **CI observation fixture** for the actual measured runtime differences. This fixture is test evidence only; it must not join engine definitions, bundle admissions, result matching, source checks, worker inputs, copy authority or user exports. Each known profile records exact platform/architecture/Node/V8 metadata and the complete expected comparison with all nineteen reference cases. The observed Linux profile permits only the exact six array-hash fields measured above; every summary, refusal, input, other fingerprint and source pin must still agree. An extra, missing or changed difference or unknown profile fails qualification with an actionable message. Preserve strict reference assertions for the measured macOS profile. Do not present the Linux characterization as nineteen reproduced reference cases.

The normal Linux check must run integrity **and** exact runtime characterization, with the CI Node version pinned to the measured release. Add a separately verified macOS arm64 CI check of the strict nineteen reference vectors using that same Node release; verify the official runner label before configuring it. Ordinary local checks must explain an uncharacterized runtime rather than silently blessing it. Retain actual legacy-versus-guarded calculations and all 5,000-element comparisons on both tested profiles. Existing structural registry tests remain; only assumptions of universally identical reference arrays may be separated into the two explicit evidence assertions.

Add a real selected-bundle fixture for the macOS ordinary calculation and exercise the actual Linux CLI: it must report the exact array-field mismatch, while a fresh Linux-authored file must match locally. Matching copies/draws remain unavailable after a mismatch. No tolerance, fingerprint exception or runtime profile may turn a mismatched source file into a reproduced copy. Update product documentation and acceptance to distinguish immutable reference vectors, measured runtime qualification and exact local comparison. A future portable power implementation requires a new separately reviewed engine version.
