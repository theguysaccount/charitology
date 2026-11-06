// Generated only by scripts/generate-model-engine-registry.mjs --create.
// Candidate v1 interpretation. Existing bytes are never silently replaced.
export const ENGINE = {
  "definition": {
    "id": "charitology-ce-triangular-js-v1",
    "version": 1,
    "language": "ecmascript-binary64",
    "rangedOrder": [
      "cost",
      "people",
      "works",
      "effect",
      "years",
      "anyway"
    ],
    "draws": 5000,
    "prng": "mulberry32-v1",
    "distribution": "triangular-inverse-cdf-v1",
    "quantile": "type7-infinity-v1",
    "equation": "expected-one-outcome-geometric-years-v1",
    "drawConsumption": "six-in-order-including-constants",
    "sorting": "separate-ascending-cost-and-outcome",
    "sensitivity": "one-at-a-time-mode-v1",
    "numericalPolicy": "guarded-finite-intermediates-v1",
    "sourceFiles": [
      {
        "path": "src/lib/model-bundles/interpretations/v1/arithmetic.mjs",
        "byteLength": 12005,
        "sha256": "b7c48885f919ed1c6287a6a430b8d1bb5b54d1c273db831e0959aad2c476f63a"
      },
      {
        "path": "src/lib/model-bundles/interpretations/v1/encoding.mjs",
        "byteLength": 6904,
        "sha256": "b53be55bbe01cc88ddb0b0657c80b22a2387afc69bd6f312d52f4a5fc70091a5"
      },
      {
        "path": "src/lib/model-bundles/interpretations/v1/random.mjs",
        "byteLength": 9075,
        "sha256": "5393a30d75b30ba7e0d11e3e6915b9b1dc64ff1d62889e4631a5b9bf9462fd2e"
      }
    ],
    "goldenVectorsHash": "ff19a5fe1b56a0452a225ae801fadeff54d30441683dc705197973943896d527"
  },
  "definitionHash": "3826f798e0dc55defdd59cbdfd697a5eef40931f99dd3181abe12c5d8a28f30e",
  "files": [
    {
      "path": "src/lib/model-bundles/interpretations/v1/arithmetic.mjs",
      "byteLength": 12005,
      "sha256": "b7c48885f919ed1c6287a6a430b8d1bb5b54d1c273db831e0959aad2c476f63a",
      "rawUtf8": "/* MIT License. Copyright (c) 2026 Charitology contributors.\n * Permission is hereby granted, free of charge, to any person obtaining a copy\n * of this software and associated documentation files (the \"Software\"), to deal\n * in the Software without restriction, including without limitation the rights\n * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n * copies of the Software, and to permit persons to whom the Software is\n * furnished to do so, subject to the following conditions:\n * The above copyright notice and this permission notice shall be included in all\n * copies or substantial portions of the Software.\n * THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n * SOFTWARE.\n */\nimport { ROWS, mulberry32, triangular, quantile, failNumeric, finiteResult, multiply, divide } from './random.mjs';\nexport { ROWS, NumericalError, isNumericalIssue } from './random.mjs';\n\nconst PARTS = ['low', 'likely', 'high'];\nconst PERCENT = ['works', 'anyway'];\nconst STRICT = /^[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)$/;\nconst ownedEvaluations = new WeakMap();\n\nexport class AdmissionError extends Error {\n  constructor(field, reason) {\n    super('Invalid model input.');\n    this.name = 'AdmissionError';\n    this.code = 'invalid-input';\n    this.field = field;\n    this.reason = reason;\n  }\n}\nconst invalid = (field, reason) => { throw new AdmissionError(field, reason); };\nfunction record(value, keys, field) {\n  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)\n    invalid(field, 'shape');\n  const ds = Object.getOwnPropertyDescriptors(value), all = Reflect.ownKeys(value);\n  if (all.length !== keys.length || keys.some(k => !Object.hasOwn(ds, k) || !Object.hasOwn(ds[k], 'value') || ds[k].enumerable !== true) ||\n    all.some(k => typeof k !== 'string' || !keys.includes(k))) invalid(field, 'shape');\n}\nfunction triple(value, field) {\n  if (!Array.isArray(value) || value.length !== 3 || Object.getPrototypeOf(value) !== Array.prototype)\n    invalid(field, 'shape');\n  const keys = Reflect.ownKeys(value), ds = Object.getOwnPropertyDescriptors(value);\n  if (keys.length !== 4 || ['0', '1', '2', 'length'].some(k => !Object.hasOwn(ds, k) || !Object.hasOwn(ds[k], 'value')) ||\n    ['0', '1', '2'].some(k => ds[k].enumerable !== true))\n    invalid(field, 'shape');\n}\nfunction rowBounds(row, values, percent) {\n  const [low, mode, high] = values;\n  if (values.some(v => !Number.isFinite(v) || Object.is(v, -0) || v < 0)) invalid(row, 'range');\n  if (!(low <= mode && mode <= high)) invalid(row, 'order');\n  if ((row === 'cost' || row === 'people') && !(low > 0)) invalid(row, 'positive');\n  if (row === 'works' && high > (percent ? 100 : 1) || row === 'anyway' && high > (percent ? 99 : 0.99))\n    invalid(row, 'range');\n  if (['works', 'effect', 'years'].includes(row) && !(mode > 0)) invalid(row, 'positive-mode');\n}\nfunction seedValue(seed) {\n  if (!Number.isInteger(seed) || seed < 1 || seed > 4294967295) invalid('seed', 'range');\n  return seed;\n}\nfunction text(value, field) {\n  if (typeof value !== 'string' || value.length > 16384) invalid(field, 'text');\n  return value;\n}\n\n/** Input-only admission never invokes a string-stripping parser or repairs -0. */\nexport function validateInput(input) {\n  record(input, ['values', 'discount', 'seed', 'draws'], 'input');\n  record(input.values, ROWS, 'input');\n  const values = {};\n  for (const row of ROWS) {\n    triple(input.values[row], row);\n    const v = input.values[row].slice();\n    rowBounds(row, v, false);\n    values[row] = Object.freeze(v);\n  }\n  if (typeof input.discount !== 'number' || !Number.isFinite(input.discount) ||\n    Object.is(input.discount, -0) || input.discount < 0 || input.discount >= 1) invalid('discount', 'range');\n  if (input.draws !== 5000) invalid('input', 'draw-count');\n  return Object.freeze({ values: Object.freeze(values), discount: input.discount, seed: seedValue(input.seed), draws: 5000 });\n}\n\nfunction parseNumber(raw, parser, field, path) {\n  text(raw, field);\n  const trimmed = raw.trim();\n  if (!trimmed || parser === 'legacy-amount-strip-v1' && !/[0-9]/.test(trimmed)) invalid(field, 'number');\n  let token = trimmed;\n  if (parser === 'strict-decimal-v1') {\n    if (token.length > 128 || !STRICT.test(token)) invalid(field, 'number');\n  } else token = token.replace(/[^0-9.\\-]/g, '');\n  const parsed = Number(token);\n  if (Number.isNaN(parsed)) invalid(field, 'number');\n  if (!Number.isFinite(parsed)) failNumeric('numeric-overflow', path, { kind: 'normalization' });\n  if (parsed === 0 && /[1-9]/.test(token)) failNumeric('numeric-underflow', path, { kind: 'normalization' });\n  return parsed === 0 ? 0 : parsed;\n}\nfunction percent(value, path) {\n  return divide(value, 100, path, { kind: 'normalization' });\n}\n\n/** Labels are opaque writing here; Content admission owns bundle metadata limits. */\nexport function normalizeRaw(raw) {\n  record(raw, ['parser', 'name', 'unit', 'values', 'discount', 'seed'], 'raw');\n  if (!['strict-decimal-v1', 'legacy-amount-strip-v1'].includes(raw.parser)) invalid('raw', 'parser');\n  text(raw.name, 'raw'); text(raw.unit, 'raw');\n  record(raw.values, ROWS, 'raw');\n  const values = {};\n  for (const row of ROWS) {\n    triple(raw.values[row], row);\n    const parsed = raw.values[row].map((v, i) => parseNumber(v, raw.parser, row, `raw.values.${row}.${PARTS[i]}`));\n    rowBounds(row, parsed, true);\n    values[row] = PERCENT.includes(row) ? parsed.map((v, i) => percent(v, `raw.values.${row}.${PARTS[i]}`)) : parsed;\n  }\n  const discount = parseNumber(raw.discount, raw.parser, 'discount', 'raw.discount');\n  if (!(discount >= 0 && discount < 100)) invalid('discount', 'range');\n  text(raw.seed, 'seed');\n  const token = raw.seed.trim();\n  if (raw.parser === 'strict-decimal-v1' && !/^[1-9][0-9]{0,9}$/.test(token)) invalid('seed', 'number');\n  const seed = seedValue(Number(token));\n  return validateInput({ values, discount: percent(discount, 'raw.discount'), seed, draws: 5000 });\n}\n\nexport function discountedYears(years, rate, context = { kind: 'likely' }) {\n  if (!Number.isFinite(years) || years < 0 || !Number.isFinite(rate) || rate < 0 || rate >= 1)\n    failNumeric('numeric-domain', 'discount.duration', context);\n  if (years === 0) return 0;\n  if (rate === 0) return years;\n  const base = finiteResult(1 + rate, 'discount.base', context);\n  const v = divide(1, base, 'discount.v', context);\n  if (!(v > 0 && v < 1)) failNumeric('numeric-domain', 'discount.v', context);\n  const denominator = finiteResult(1 - v, 'discount.denominator', context);\n  if (!(denominator > 0)) failNumeric('numeric-domain', 'discount.denominator', context);\n  const power = finiteResult(Math.pow(v, years), 'discount.power', context);\n  if (power === 0) failNumeric('numeric-underflow', 'discount.power', context);\n  if (!(power > 0 && power < 1)) failNumeric('numeric-domain', 'discount.power', context);\n  const numerator = finiteResult(1 - power, 'discount.numerator', context);\n  if (!(numerator > 0)) failNumeric('numeric-domain', 'discount.numerator', context);\n  const duration = divide(numerator, denominator, 'discount.duration', context);\n  if (!(duration > 0)) failNumeric('numeric-domain', 'discount.duration', context);\n  return duration;\n}\n\nfunction pointAt(point, discount, context) {\n  // Association is intentional: an earlier overflow cannot be hidden by later zero.\n  const peopleWorks = multiply(point.people, point.works, 'outcome.people-works', context);\n  const effect = multiply(peopleWorks, point.effect, 'outcome.effect', context);\n  const duration = discountedYears(point.years, discount, context);\n  const overDuration = multiply(effect, duration, 'outcome.duration', context);\n  const counterfactual = finiteResult(1 - point.anyway, 'outcome.counterfactual', context);\n  const outcome = multiply(overDuration, counterfactual, 'outcome.result', context);\n  if (outcome === 0) {\n    if (!(point.works === 0 || point.effect === 0 || duration === 0))\n      failNumeric('numeric-underflow', 'outcome.result', context);\n    return { cost: Infinity, outcome: 0 };\n  }\n  const cost = divide(point.cost, outcome, 'cost.ratio', context);\n  if (!(cost > 0)) failNumeric('numeric-domain', 'cost.ratio', context);\n  return { cost, outcome };\n}\nconst finite = value => Object.freeze({ kind: 'finite', value });\nconst costValue = value => value === Infinity ? Object.freeze({ kind: 'no-outcome' }) : finite(value);\nconst summarize = (values, series) => Object.freeze({\n  median: (series === 'costs' ? costValue : finite)(quantile(values, 0.5, series)),\n  p5: (series === 'costs' ? costValue : finite)(quantile(values, 0.05, series)),\n  p95: (series === 'costs' ? costValue : finite)(quantile(values, 0.95, series)),\n});\n\nexport function evaluateInput(value) {\n  const input = validateInput(value), random = mulberry32(input.seed);\n  const costs = new Float64Array(5000), outcomes = new Float64Array(5000), point = {};\n  let none = 0;\n  for (let i = 0; i < 5000; i++) {\n    const context = { kind: 'draw', index: i };\n    for (const row of ROWS) point[row] = triangular(random(), ...input.values[row], row, context);\n    const evaluated = pointAt(point, input.discount, context);\n    costs[i] = evaluated.cost; outcomes[i] = evaluated.outcome;\n    if (evaluated.outcome === 0) none++;\n  }\n  costs.sort(); outcomes.sort();\n  const cost = summarize(costs, 'costs'), outcome = summarize(outcomes, 'outcomes');\n  const mode = Object.fromEntries(ROWS.map(row => [row, input.values[row][1]]));\n  const likelyPoint = pointAt(mode, input.discount, { kind: 'likely' });\n  if (!(likelyPoint.outcome > 0 && Number.isFinite(likelyPoint.cost)))\n    failNumeric('numeric-domain', 'cost.ratio', { kind: 'likely' });\n  const likely = Object.freeze({ cost: finite(likelyPoint.cost), outcome: finite(likelyPoint.outcome) });\n  const rows = ROWS.map(row => {\n    const atLow = pointAt({ ...mode, [row]: input.values[row][0] }, input.discount,\n      { kind: 'sensitivity', row, endpoint: 'low' }).cost;\n    const atHigh = pointAt({ ...mode, [row]: input.values[row][2] }, input.discount,\n      { kind: 'sensitivity', row, endpoint: 'high' }).cost;\n    const lo = Math.min(atLow, atHigh), hi = Math.max(atLow, atHigh);\n    const swing = hi === lo ? 0 : hi === Infinity ? Infinity :\n      finiteResult(hi - lo, `sensitivity.${row}.swing`, { kind: 'sensitivity', row, endpoint: 'swing' });\n    return { key: row, atLow, atHigh, lo, hi, swing };\n  });\n  rows.sort((a, b) => b.swing - a.swing || ROWS.indexOf(a.key) - ROWS.indexOf(b.key));\n  const sensitivity = Object.freeze({ base: finite(likelyPoint.cost), rows: Object.freeze(rows.map(r => Object.freeze({\n    key: r.key, atLow: costValue(r.atLow), atHigh: costValue(r.atHigh), lo: costValue(r.lo), hi: costValue(r.hi),\n    swing: r.swing === Infinity ? Object.freeze({ kind: 'unbounded' }) : finite(r.swing),\n  }))) });\n  const data = Object.freeze({ draws: 5000, seed: input.seed, none, cost, outcome, likely, sensitivity,\n    numericalPolicy: 'guarded-finite-intermediates-v1' });\n  const evaluation = Object.freeze({ ...data, costs: costs.slice(), outcomes: outcomes.slice() });\n  ownedEvaluations.set(evaluation, { input, data, costs, outcomes });\n  return evaluation;\n}\n\n/** Detached copies from engine-owned data; mutation of public arrays is inert. */\nexport function snapshotEvaluation(evaluation) {\n  const found = ownedEvaluations.get(evaluation);\n  if (!found) throw new TypeError('An owned engine evaluation is required.');\n  return { input: found.input, data: found.data, costs: found.costs.slice(), outcomes: found.outcomes.slice() };\n}\n"
    },
    {
      "path": "src/lib/model-bundles/interpretations/v1/encoding.mjs",
      "byteLength": 6904,
      "sha256": "b53be55bbe01cc88ddb0b0657c80b22a2387afc69bd6f312d52f4a5fc70091a5",
      "rawUtf8": "/* MIT License. Copyright (c) 2026 Charitology contributors.\n * Permission is hereby granted, free of charge, to any person obtaining a copy\n * of this software and associated documentation files (the \"Software\"), to deal\n * in the Software without restriction, including without limitation the rights\n * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n * copies of the Software, and to permit persons to whom the Software is\n * furnished to do so, subject to the following conditions:\n * The above copyright notice and this permission notice shall be included in all\n * copies or substantial portions of the Software.\n * THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n * SOFTWARE.\n */\nimport { validateInput, snapshotEvaluation } from './arithmetic.mjs';\n\nconst utf8 = new TextEncoder();\nconst KINDS = Object.freeze(['engine', 'golden', 'input', 'run', 'content', 'version',\n  'selected', 'backup', 'state', 'draws', 'proposal', 'review']);\nconst unsafe = new Set(['__proto__', 'prototype', 'constructor']);\nconst bad = () => { throw new TypeError('Invalid engine canonical value.'); };\n\nfunction validString(value) {\n  if (value.length > 2097152) bad();\n  for (let i = 0; i < value.length; i++) {\n    const c = value.charCodeAt(i);\n    if (c >= 0xd800 && c <= 0xdbff) {\n      const next = value.charCodeAt(++i);\n      if (!(next >= 0xdc00 && next <= 0xdfff)) bad();\n    } else if (c >= 0xdc00 && c <= 0xdfff) bad();\n  }\n}\n\n/** Exact ECMAScript code-unit key sort and JSON number/string spelling. */\nexport function canonical(value) {\n  const ancestors = new Set();\n  let nodes = 0, bytes = 0;\n  const emit = text => {\n    bytes += utf8.encode(text).byteLength;\n    if (bytes > 2097152) bad();\n    return text;\n  };\n  function visit(v, depth) {\n    if (++nodes > 100000 || depth > 32) bad();\n    if (v === null) return emit('null');\n    if (typeof v === 'boolean') return emit(v ? 'true' : 'false');\n    if (typeof v === 'number') {\n      if (!Number.isFinite(v) || Object.is(v, -0)) bad();\n      return emit(JSON.stringify(v));\n    }\n    if (typeof v === 'string') { validString(v); return emit(JSON.stringify(v)); }\n    if (typeof v !== 'object' || ancestors.has(v)) bad();\n    ancestors.add(v);\n    const ds = Object.getOwnPropertyDescriptors(v), keys = Reflect.ownKeys(v);\n    if (keys.some(k => typeof k !== 'string' || !Object.hasOwn(ds[k], 'value') ||\n      (k !== 'length' || !Array.isArray(v)) && ds[k].enumerable !== true)) bad();\n    let result;\n    if (Array.isArray(v)) {\n      if (Object.getPrototypeOf(v) !== Array.prototype || !Number.isSafeInteger(v.length) ||\n        v.length > 100000 || keys.length !== v.length + 1) bad();\n      const parts = [];\n      emit('[');\n      for (let i = 0; i < v.length; i++) {\n        if (!Object.hasOwn(ds, String(i))) bad();\n        if (i) emit(',');\n        parts.push(visit(ds[String(i)].value, depth + 1));\n      }\n      emit(']'); result = '[' + parts.join(',') + ']';\n    } else {\n      if (Object.getPrototypeOf(v) !== Object.prototype || keys.some(k => unsafe.has(k))) bad();\n      keys.sort();\n      const parts = [];\n      emit('{');\n      for (const key of keys) {\n        validString(key);\n        if (parts.length) emit(',');\n        const k = emit(JSON.stringify(key)); emit(':');\n        parts.push(k + ':' + visit(ds[key].value, depth + 1));\n      }\n      emit('}'); result = '{' + parts.join(',') + '}';\n    }\n    ancestors.delete(v);\n    return result;\n  }\n  return visit(value, 0);\n}\n\nexport async function sha256(bytes) {\n  if (!(bytes instanceof Uint8Array)) throw new TypeError('Engine hash bytes are required.');\n  const detached = new Uint8Array(bytes);\n  if (!globalThis.crypto?.subtle) throw new Error('Platform SHA-256 is unavailable.');\n  const digest = await globalThis.crypto.subtle.digest('SHA-256', detached);\n  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');\n}\n\nexport function hashValue(kind, value) {\n  if (!KINDS.includes(kind)) throw new TypeError('Invalid engine hash kind.');\n  return sha256(utf8.encode(`charitology-model-bundles/v1/${kind}\\n${canonical(value)}\\n`));\n}\n\nfunction enginePin(value) {\n  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype ||\n    Reflect.ownKeys(value).length !== 3) throw new TypeError('Invalid engine pin.');\n  const ds = Object.getOwnPropertyDescriptors(value);\n  if (['id', 'version', 'definitionHash'].some(k => !Object.hasOwn(ds, k) || !Object.hasOwn(ds[k], 'value')) ||\n    value.id !== 'charitology-ce-triangular-js-v1' || value.version !== 1 ||\n    typeof value.definitionHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.definitionHash))\n    throw new TypeError('Invalid engine pin.');\n  return { id: value.id, version: 1, definitionHash: value.definitionHash };\n}\n\nexport function inputHash(pin, value) {\n  return hashValue('input', { enginePin: enginePin(pin), input: validateInput(value) });\n}\n\nexport function encodeArray(series, values) {\n  if (!['costs', 'outcomes'].includes(series) || !(values instanceof Float64Array) ||\n    Object.getPrototypeOf(values) !== Float64Array.prototype || values.length !== 5000)\n    throw new TypeError('Invalid engine array.');\n  const prefix = utf8.encode(`charitology-ce-array-v1\\n${series}\\n`);\n  const bytes = new Uint8Array(prefix.byteLength + 40000), view = new DataView(bytes.buffer);\n  bytes.set(prefix);\n  let prior = -1;\n  for (let i = 0; i < 5000; i++) {\n    const v = values[i];\n    if (!(Number.isFinite(v) && v >= 0 || series === 'costs' && v === Infinity) ||\n      series === 'costs' && v === 0 || v < prior) throw new TypeError('Invalid engine array value.');\n    view.setFloat64(prefix.byteLength + 8 * i, v === 0 ? 0 : v, false);\n    prior = v;\n  }\n  return bytes;\n}\nexport function hashArray(series, values) { return sha256(encodeArray(series, values)); }\n\n/** Uses retained engine-owned arrays, never caller-mutated display copies. */\nexport async function makeRecordedRun(pin, value, evaluation) {\n  const checked = validateInput(value), snapshot = snapshotEvaluation(evaluation);\n  if (canonical(checked) !== canonical(snapshot.input)) throw new TypeError('Evaluation input differs.');\n  const [fingerprint, costsSha256, outcomesSha256] = await Promise.all([\n    inputHash(pin, checked), hashArray('costs', snapshot.costs), hashArray('outcomes', snapshot.outcomes),\n  ]);\n  return Object.freeze({ inputHash: fingerprint, ...snapshot.data, costsSha256, outcomesSha256 });\n}\n"
    },
    {
      "path": "src/lib/model-bundles/interpretations/v1/random.mjs",
      "byteLength": 9075,
      "sha256": "5393a30d75b30ba7e0d11e3e6915b9b1dc64ff1d62889e4631a5b9bf9462fd2e",
      "rawUtf8": "/* MIT License. Copyright (c) 2026 Charitology contributors.\n * Permission is hereby granted, free of charge, to any person obtaining a copy\n * of this software and associated documentation files (the \"Software\"), to deal\n * in the Software without restriction, including without limitation the rights\n * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n * copies of the Software, and to permit persons to whom the Software is\n * furnished to do so, subject to the following conditions:\n * The above copyright notice and this permission notice shall be included in all\n * copies or substantial portions of the Software.\n * THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n * SOFTWARE.\n */\n\nexport const ROWS = Object.freeze(['cost', 'people', 'works', 'effect', 'years', 'anyway']);\nconst CODES = ['numeric-underflow', 'numeric-overflow', 'numeric-domain'];\nconst PARTS = ['low', 'likely', 'high'];\nconst SAMPLE = ['u', 'span', 'mode-low', 'high-mode', 'split', 'left-scale', 'left-product',\n  'right-weight', 'right-scale', 'right-product', 'root', 'result'];\nconst DISCOUNT = ['base', 'v', 'power', 'numerator', 'denominator', 'duration'];\nconst OUTCOME = ['people-works', 'effect', 'duration', 'counterfactual', 'result'];\nconst QUANTILE = ['difference', 'fractional-product', 'result'];\nconst ownKeys = (v, expected) => v !== null && typeof v === 'object' &&\n  Object.getPrototypeOf(v) === Object.prototype &&\n  Reflect.ownKeys(v).length === expected.length && expected.every(k =>\n    Object.getOwnPropertyDescriptor(v, k)?.get === undefined &&\n    Object.getOwnPropertyDescriptor(v, k)?.set === undefined && Object.hasOwn(v, k));\n\nfunction issueShape(code, path, context) {\n  if (!CODES.includes(code) || typeof path !== 'string' || path.length > 128) return null;\n  const p = path.split('.');\n  let phase;\n  if (p[0] === 'raw' && (path === 'raw.discount' ||\n    p.length === 4 && p[1] === 'values' && ROWS.includes(p[2]) && PARTS.includes(p[3]))) phase = 'normalize';\n  else if (p.length === 3 && p[0] === 'sample' && ROWS.includes(p[1]) && SAMPLE.includes(p[2])) phase = 'sample';\n  else if (p.length === 2 && p[0] === 'discount' && DISCOUNT.includes(p[1])) phase = 'discount';\n  else if (p.length === 2 && p[0] === 'outcome' && OUTCOME.includes(p[1])) phase = 'outcome';\n  else if (path === 'cost.ratio') phase = 'cost';\n  else if (p.length === 3 && p[0] === 'quantile' && ['costs', 'outcomes'].includes(p[1]) && QUANTILE.includes(p[2])) phase = 'quantile';\n  else if (p.length === 3 && p[0] === 'sensitivity' && ROWS.includes(p[1]) && p[2] === 'swing') phase = 'sensitivity';\n  else return null;\n  let valid = false;\n  if (ownKeys(context, ['kind']) && context.kind === 'normalization') valid = phase === 'normalize';\n  else if (ownKeys(context, ['kind', 'index']) && context.kind === 'draw') valid =\n    Number.isInteger(context.index) && context.index >= 0 && context.index < 5000 &&\n    ['sample', 'discount', 'outcome', 'cost'].includes(phase);\n  else if (ownKeys(context, ['kind']) && context.kind === 'likely') valid =\n    ['discount', 'outcome', 'cost'].includes(phase);\n  else if (ownKeys(context, ['kind', 'row', 'endpoint']) && context.kind === 'sensitivity' && ROWS.includes(context.row)) valid =\n    context.endpoint === 'swing' ? phase === 'sensitivity' && context.row === p[1] :\n      ['low', 'high'].includes(context.endpoint) && ['discount', 'outcome', 'cost'].includes(phase);\n  else if (ownKeys(context, ['kind', 'series', 'q']) && context.kind === 'quantile') valid =\n    phase === 'quantile' && context.series === p[1] && [0.05, 0.5, 0.95].includes(context.q);\n  if (!valid) return null;\n  return Object.freeze({ code, phase, path, context: Object.freeze({ ...context }) });\n}\n\nexport class NumericalError extends Error {\n  constructor(code, path, context) {\n    super('The numerical calculation is outside the supported range.');\n    this.name = 'NumericalError';\n    const issue = issueShape(code, path, context);\n    if (!issue) throw new TypeError('Invalid internal numerical issue.');\n    Object.defineProperty(this, 'issue', { value: issue, enumerable: true });\n  }\n}\n\nexport function isNumericalIssue(value) {\n  if (!ownKeys(value, ['code', 'phase', 'path', 'context'])) return false;\n  const checked = issueShape(value.code, value.path, value.context);\n  return checked !== null && checked.phase === value.phase;\n}\n\nexport function failNumeric(code, path, context) { throw new NumericalError(code, path, context); }\nexport function finiteResult(value, path, context) {\n  if (!Number.isFinite(value)) failNumeric(Number.isNaN(value) ? 'numeric-domain' : 'numeric-overflow', path, context);\n  return value === 0 ? 0 : value;\n}\nexport function multiply(a, b, path, context) {\n  const value = finiteResult(a * b, path, context);\n  if (a > 0 && b > 0 && value === 0) failNumeric('numeric-underflow', path, context);\n  return value;\n}\nexport function divide(a, b, path, context) {\n  const value = finiteResult(a / b, path, context);\n  if (a > 0 && b > 0 && value === 0) failNumeric('numeric-underflow', path, context);\n  return value;\n}\n\n/** Original unsigned Mulberry32; all six draws are consumed by arithmetic.mjs. */\nexport function mulberry32(seed) {\n  if (!Number.isInteger(seed) || seed < 1 || seed > 4294967295) throw new TypeError('Invalid engine seed.');\n  let a = seed >>> 0;\n  return () => {\n    a = (a + 0x6d2b79f5) >>> 0;\n    let t = a;\n    t = Math.imul(t ^ (t >>> 15), t | 1);\n    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);\n    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;\n  };\n}\n\nexport function triangular(u, low, mode, high, row, context) {\n  if (!ROWS.includes(row)) throw new TypeError('Invalid engine row.');\n  const path = part => `sample.${row}.${part}`;\n  if (!Number.isFinite(u) || u < 0 || u >= 1) failNumeric('numeric-domain', path('u'), context);\n  if (![low, mode, high].every(v => Number.isFinite(v) && v >= 0) || low > mode || mode > high)\n    failNumeric('numeric-domain', path('span'), context);\n  if (high === low) return low === 0 ? 0 : low;\n  const span = finiteResult(high - low, path('span'), context);\n  const left = finiteResult(mode - low, path('mode-low'), context);\n  const right = finiteResult(high - mode, path('high-mode'), context);\n  const split = divide(left, span, path('split'), context);\n  if (split < 0 || split > 1 || mode > low && mode < high && !(split > 0 && split < 1))\n    failNumeric('numeric-domain', path('split'), context);\n  let value;\n  if (u < split) {\n    const scale = multiply(u, span, path('left-scale'), context);\n    const product = multiply(scale, left, path('left-product'), context);\n    const root = finiteResult(Math.sqrt(product), path('root'), context);\n    value = finiteResult(low + root, path('result'), context);\n  } else {\n    const weight = finiteResult(1 - u, path('right-weight'), context);\n    const scale = multiply(weight, span, path('right-scale'), context);\n    const product = multiply(scale, right, path('right-product'), context);\n    const root = finiteResult(Math.sqrt(product), path('root'), context);\n    value = finiteResult(high - root, path('result'), context);\n  }\n  if (value < low || value > high) failNumeric('numeric-domain', path('result'), context);\n  if (value === 0 && !(low === 0 && u === 0)) failNumeric('numeric-underflow', path('result'), context);\n  return value;\n}\n\n/** Type7 with a dedicated +Infinity cost sentinel, never a nonfinite outcome. */\nexport function quantile(sorted, q, series) {\n  if (!['costs', 'outcomes'].includes(series) || ![0.05, 0.5, 0.95].includes(q))\n    throw new TypeError('Invalid engine quantile.');\n  const context = { kind: 'quantile', series, q }, path = part => `quantile.${series}.${part}`;\n  if (!(sorted instanceof Float64Array) || sorted.length < 1 || sorted.length > 5000)\n    failNumeric('numeric-domain', path('result'), context);\n  let prior = -1;\n  for (const v of sorted) {\n    if (!(Number.isFinite(v) && v >= 0 || series === 'costs' && v === Infinity) ||\n      series === 'costs' && v === 0 || v < prior) failNumeric('numeric-domain', path('result'), context);\n    prior = v;\n  }\n  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.min(sorted.length - 1, lo + 1);\n  const a = sorted[lo], b = sorted[hi];\n  if (pos === lo || a === b) return a === 0 ? 0 : a;\n  if (b === Infinity) return Infinity;\n  const difference = finiteResult(b - a, path('difference'), context);\n  const part = multiply(difference, pos - lo, path('fractional-product'), context);\n  const value = finiteResult(a + part, path('result'), context);\n  if (value < a || value > b) failNumeric('numeric-domain', path('result'), context);\n  return value;\n}\n"
    }
  ]
};
export const GOLDEN = {
  "format": "charitology-model-golden",
  "version": 1,
  "cases": [
    {
      "kind": "run",
      "id": "ordinary-seed-1",
      "input": {
        "values": {
          "cost": [
            100,
            200,
            500
          ],
          "people": [
            10,
            20,
            40
          ],
          "works": [
            0.2,
            0.6,
            0.9
          ],
          "effect": [
            0.1,
            1,
            2
          ],
          "years": [
            0.5,
            1,
            3
          ],
          "anyway": [
            0,
            0.1,
            0.5
          ]
        },
        "discount": 0.03,
        "seed": 1,
        "draws": 5000
      },
      "raw": {
        "parser": "strict-decimal-v1",
        "name": "Illustrative numerical fixture",
        "unit": "fictional outcome",
        "values": {
          "cost": [
            "100",
            "200",
            "500"
          ],
          "people": [
            "10",
            "20",
            "40"
          ],
          "works": [
            "20",
            "60",
            "90"
          ],
          "effect": [
            "0.1",
            "1",
            "2"
          ],
          "years": [
            "0.5",
            "1",
            "3"
          ],
          "anyway": [
            "0",
            "10",
            "50"
          ]
        },
        "discount": "3",
        "seed": "1"
      },
      "expected": {
        "draws": 5000,
        "seed": 1,
        "none": 0,
        "cost": {
          "median": {
            "kind": "finite",
            "value": 19.45432046347664
          },
          "p5": {
            "kind": "finite",
            "value": 5.841870873584707
          },
          "p95": {
            "kind": "finite",
            "value": 76.01506012061621
          }
        },
        "outcome": {
          "median": {
            "kind": "finite",
            "value": 13.141176005429216
          },
          "p5": {
            "kind": "finite",
            "value": 3.669760831642208
          },
          "p95": {
            "kind": "finite",
            "value": 37.6455947998321
          }
        },
        "likely": {
          "cost": {
            "kind": "finite",
            "value": 18.51851851851852
          },
          "outcome": {
            "kind": "finite",
            "value": 10.8
          }
        },
        "sensitivity": {
          "base": {
            "kind": "finite",
            "value": 18.51851851851852
          },
          "rows": [
            {
              "key": "effect",
              "atLow": {
                "kind": "finite",
                "value": 185.18518518518513
              },
              "atHigh": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "lo": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "hi": {
                "kind": "finite",
                "value": 185.18518518518513
              },
              "swing": {
                "kind": "finite",
                "value": 175.92592592592587
              }
            },
            {
              "key": "works",
              "atLow": {
                "kind": "finite",
                "value": 55.55555555555556
              },
              "atHigh": {
                "kind": "finite",
                "value": 12.345679012345679
              },
              "lo": {
                "kind": "finite",
                "value": 12.345679012345679
              },
              "hi": {
                "kind": "finite",
                "value": 55.55555555555556
              },
              "swing": {
                "kind": "finite",
                "value": 43.20987654320988
              }
            },
            {
              "key": "cost",
              "atLow": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "atHigh": {
                "kind": "finite",
                "value": 46.29629629629629
              },
              "lo": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "hi": {
                "kind": "finite",
                "value": 46.29629629629629
              },
              "swing": {
                "kind": "finite",
                "value": 37.03703703703703
              }
            },
            {
              "key": "years",
              "atLow": {
                "kind": "finite",
                "value": 36.76535700304249
              },
              "atHigh": {
                "kind": "finite",
                "value": 6.356173378723446
              },
              "lo": {
                "kind": "finite",
                "value": 6.356173378723446
              },
              "hi": {
                "kind": "finite",
                "value": 36.76535700304249
              },
              "swing": {
                "kind": "finite",
                "value": 30.40918362431904
              }
            },
            {
              "key": "people",
              "atLow": {
                "kind": "finite",
                "value": 37.03703703703704
              },
              "atHigh": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "lo": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "hi": {
                "kind": "finite",
                "value": 37.03703703703704
              },
              "swing": {
                "kind": "finite",
                "value": 27.77777777777778
              }
            },
            {
              "key": "anyway",
              "atLow": {
                "kind": "finite",
                "value": 16.666666666666668
              },
              "atHigh": {
                "kind": "finite",
                "value": 33.333333333333336
              },
              "lo": {
                "kind": "finite",
                "value": 16.666666666666668
              },
              "hi": {
                "kind": "finite",
                "value": 33.333333333333336
              },
              "swing": {
                "kind": "finite",
                "value": 16.666666666666668
              }
            }
          ]
        },
        "costsSha256": "06d3b5f2e4c07bc515f056aeabba39c60f60d1d9b83e0d54f6fc2c004fc74e8a",
        "outcomesSha256": "4a65dfbb56835274f62f4251f44c1fbdfd349c7cec91f16a898383fb5fb7cc97",
        "numericalPolicy": "guarded-finite-intermediates-v1"
      }
    },
    {
      "kind": "run",
      "id": "ordinary-seed-42",
      "input": {
        "values": {
          "cost": [
            100,
            200,
            500
          ],
          "people": [
            10,
            20,
            40
          ],
          "works": [
            0.2,
            0.6,
            0.9
          ],
          "effect": [
            0.1,
            1,
            2
          ],
          "years": [
            0.5,
            1,
            3
          ],
          "anyway": [
            0,
            0.1,
            0.5
          ]
        },
        "discount": 0.03,
        "seed": 42,
        "draws": 5000
      },
      "raw": {
        "parser": "strict-decimal-v1",
        "name": "Illustrative numerical fixture",
        "unit": "fictional outcome",
        "values": {
          "cost": [
            "100",
            "200",
            "500"
          ],
          "people": [
            "10",
            "20",
            "40"
          ],
          "works": [
            "20",
            "60",
            "90"
          ],
          "effect": [
            "0.1",
            "1",
            "2"
          ],
          "years": [
            "0.5",
            "1",
            "3"
          ],
          "anyway": [
            "0",
            "10",
            "50"
          ]
        },
        "discount": "3",
        "seed": "42"
      },
      "expected": {
        "draws": 5000,
        "seed": 42,
        "none": 0,
        "cost": {
          "median": {
            "kind": "finite",
            "value": 18.67177314954123
          },
          "p5": {
            "kind": "finite",
            "value": 5.803718275982337
          },
          "p95": {
            "kind": "finite",
            "value": 81.74179828482208
          }
        },
        "outcome": {
          "median": {
            "kind": "finite",
            "value": 13.67315717656894
          },
          "p5": {
            "kind": "finite",
            "value": 3.586768895000968
          },
          "p95": {
            "kind": "finite",
            "value": 38.372963382492614
          }
        },
        "likely": {
          "cost": {
            "kind": "finite",
            "value": 18.51851851851852
          },
          "outcome": {
            "kind": "finite",
            "value": 10.8
          }
        },
        "sensitivity": {
          "base": {
            "kind": "finite",
            "value": 18.51851851851852
          },
          "rows": [
            {
              "key": "effect",
              "atLow": {
                "kind": "finite",
                "value": 185.18518518518513
              },
              "atHigh": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "lo": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "hi": {
                "kind": "finite",
                "value": 185.18518518518513
              },
              "swing": {
                "kind": "finite",
                "value": 175.92592592592587
              }
            },
            {
              "key": "works",
              "atLow": {
                "kind": "finite",
                "value": 55.55555555555556
              },
              "atHigh": {
                "kind": "finite",
                "value": 12.345679012345679
              },
              "lo": {
                "kind": "finite",
                "value": 12.345679012345679
              },
              "hi": {
                "kind": "finite",
                "value": 55.55555555555556
              },
              "swing": {
                "kind": "finite",
                "value": 43.20987654320988
              }
            },
            {
              "key": "cost",
              "atLow": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "atHigh": {
                "kind": "finite",
                "value": 46.29629629629629
              },
              "lo": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "hi": {
                "kind": "finite",
                "value": 46.29629629629629
              },
              "swing": {
                "kind": "finite",
                "value": 37.03703703703703
              }
            },
            {
              "key": "years",
              "atLow": {
                "kind": "finite",
                "value": 36.76535700304249
              },
              "atHigh": {
                "kind": "finite",
                "value": 6.356173378723446
              },
              "lo": {
                "kind": "finite",
                "value": 6.356173378723446
              },
              "hi": {
                "kind": "finite",
                "value": 36.76535700304249
              },
              "swing": {
                "kind": "finite",
                "value": 30.40918362431904
              }
            },
            {
              "key": "people",
              "atLow": {
                "kind": "finite",
                "value": 37.03703703703704
              },
              "atHigh": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "lo": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "hi": {
                "kind": "finite",
                "value": 37.03703703703704
              },
              "swing": {
                "kind": "finite",
                "value": 27.77777777777778
              }
            },
            {
              "key": "anyway",
              "atLow": {
                "kind": "finite",
                "value": 16.666666666666668
              },
              "atHigh": {
                "kind": "finite",
                "value": 33.333333333333336
              },
              "lo": {
                "kind": "finite",
                "value": 16.666666666666668
              },
              "hi": {
                "kind": "finite",
                "value": 33.333333333333336
              },
              "swing": {
                "kind": "finite",
                "value": 16.666666666666668
              }
            }
          ]
        },
        "costsSha256": "99c086c30b8af68f8e098a79c8135f9a9ea4531a687624b3f8491a2f3dfdbacb",
        "outcomesSha256": "14617be2047727459de9f8ebb49e04c460eb2f8b658b6ddfeba86ebc58e7b55f",
        "numericalPolicy": "guarded-finite-intermediates-v1"
      }
    },
    {
      "kind": "run",
      "id": "ordinary-seed-4294967295",
      "input": {
        "values": {
          "cost": [
            100,
            200,
            500
          ],
          "people": [
            10,
            20,
            40
          ],
          "works": [
            0.2,
            0.6,
            0.9
          ],
          "effect": [
            0.1,
            1,
            2
          ],
          "years": [
            0.5,
            1,
            3
          ],
          "anyway": [
            0,
            0.1,
            0.5
          ]
        },
        "discount": 0.03,
        "seed": 4294967295,
        "draws": 5000
      },
      "raw": {
        "parser": "strict-decimal-v1",
        "name": "Illustrative numerical fixture",
        "unit": "fictional outcome",
        "values": {
          "cost": [
            "100",
            "200",
            "500"
          ],
          "people": [
            "10",
            "20",
            "40"
          ],
          "works": [
            "20",
            "60",
            "90"
          ],
          "effect": [
            "0.1",
            "1",
            "2"
          ],
          "years": [
            "0.5",
            "1",
            "3"
          ],
          "anyway": [
            "0",
            "10",
            "50"
          ]
        },
        "discount": "3",
        "seed": "4294967295"
      },
      "expected": {
        "draws": 5000,
        "seed": 4294967295,
        "none": 0,
        "cost": {
          "median": {
            "kind": "finite",
            "value": 18.38226300226583
          },
          "p5": {
            "kind": "finite",
            "value": 5.666233342532147
          },
          "p95": {
            "kind": "finite",
            "value": 71.55592823210836
          }
        },
        "outcome": {
          "median": {
            "kind": "finite",
            "value": 13.69098230935716
          },
          "p5": {
            "kind": "finite",
            "value": 3.8921619874224747
          },
          "p95": {
            "kind": "finite",
            "value": 38.75936577691576
          }
        },
        "likely": {
          "cost": {
            "kind": "finite",
            "value": 18.51851851851852
          },
          "outcome": {
            "kind": "finite",
            "value": 10.8
          }
        },
        "sensitivity": {
          "base": {
            "kind": "finite",
            "value": 18.51851851851852
          },
          "rows": [
            {
              "key": "effect",
              "atLow": {
                "kind": "finite",
                "value": 185.18518518518513
              },
              "atHigh": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "lo": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "hi": {
                "kind": "finite",
                "value": 185.18518518518513
              },
              "swing": {
                "kind": "finite",
                "value": 175.92592592592587
              }
            },
            {
              "key": "works",
              "atLow": {
                "kind": "finite",
                "value": 55.55555555555556
              },
              "atHigh": {
                "kind": "finite",
                "value": 12.345679012345679
              },
              "lo": {
                "kind": "finite",
                "value": 12.345679012345679
              },
              "hi": {
                "kind": "finite",
                "value": 55.55555555555556
              },
              "swing": {
                "kind": "finite",
                "value": 43.20987654320988
              }
            },
            {
              "key": "cost",
              "atLow": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "atHigh": {
                "kind": "finite",
                "value": 46.29629629629629
              },
              "lo": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "hi": {
                "kind": "finite",
                "value": 46.29629629629629
              },
              "swing": {
                "kind": "finite",
                "value": 37.03703703703703
              }
            },
            {
              "key": "years",
              "atLow": {
                "kind": "finite",
                "value": 36.76535700304249
              },
              "atHigh": {
                "kind": "finite",
                "value": 6.356173378723446
              },
              "lo": {
                "kind": "finite",
                "value": 6.356173378723446
              },
              "hi": {
                "kind": "finite",
                "value": 36.76535700304249
              },
              "swing": {
                "kind": "finite",
                "value": 30.40918362431904
              }
            },
            {
              "key": "people",
              "atLow": {
                "kind": "finite",
                "value": 37.03703703703704
              },
              "atHigh": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "lo": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "hi": {
                "kind": "finite",
                "value": 37.03703703703704
              },
              "swing": {
                "kind": "finite",
                "value": 27.77777777777778
              }
            },
            {
              "key": "anyway",
              "atLow": {
                "kind": "finite",
                "value": 16.666666666666668
              },
              "atHigh": {
                "kind": "finite",
                "value": 33.333333333333336
              },
              "lo": {
                "kind": "finite",
                "value": 16.666666666666668
              },
              "hi": {
                "kind": "finite",
                "value": 33.333333333333336
              },
              "swing": {
                "kind": "finite",
                "value": 16.666666666666668
              }
            }
          ]
        },
        "costsSha256": "d0981d015049a40afdecaf869f7d2a2e2f705c364a63ca1a9e3d01167708ccdf",
        "outcomesSha256": "6319f6ad93a4450a6f70aeeb02bb33995875029cd6cac1e2add829b33a8cc785",
        "numericalPolicy": "guarded-finite-intermediates-v1"
      }
    },
    {
      "kind": "run",
      "id": "constant-six-draws",
      "input": {
        "values": {
          "cost": [
            100,
            100,
            100
          ],
          "people": [
            10,
            10,
            10
          ],
          "works": [
            1,
            1,
            1
          ],
          "effect": [
            1,
            1,
            1
          ],
          "years": [
            1,
            1,
            1
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 0,
        "seed": 42,
        "draws": 5000
      },
      "raw": null,
      "expected": {
        "draws": 5000,
        "seed": 42,
        "none": 0,
        "cost": {
          "median": {
            "kind": "finite",
            "value": 10
          },
          "p5": {
            "kind": "finite",
            "value": 10
          },
          "p95": {
            "kind": "finite",
            "value": 10
          }
        },
        "outcome": {
          "median": {
            "kind": "finite",
            "value": 10
          },
          "p5": {
            "kind": "finite",
            "value": 10
          },
          "p95": {
            "kind": "finite",
            "value": 10
          }
        },
        "likely": {
          "cost": {
            "kind": "finite",
            "value": 10
          },
          "outcome": {
            "kind": "finite",
            "value": 10
          }
        },
        "sensitivity": {
          "base": {
            "kind": "finite",
            "value": 10
          },
          "rows": [
            {
              "key": "cost",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "people",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "works",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "effect",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "years",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "anyway",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            }
          ]
        },
        "costsSha256": "eb19233ca3da38e34600072c1d06f018927f486288f87a270d056bf0fbf20805",
        "outcomesSha256": "f51247ff234381d6e05656a71f81c6053c582431cf796d51b5a58d0fae1f72f6",
        "numericalPolicy": "guarded-finite-intermediates-v1"
      }
    },
    {
      "kind": "run",
      "id": "cost-low-mode",
      "input": {
        "values": {
          "cost": [
            100,
            100,
            500
          ],
          "people": [
            10,
            10,
            10
          ],
          "works": [
            1,
            1,
            1
          ],
          "effect": [
            1,
            1,
            1
          ],
          "years": [
            1,
            1,
            1
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 0,
        "seed": 42,
        "draws": 5000
      },
      "raw": null,
      "expected": {
        "draws": 5000,
        "seed": 42,
        "none": 0,
        "cost": {
          "median": {
            "kind": "finite",
            "value": 21.77037087731724
          },
          "p5": {
            "kind": "finite",
            "value": 11.024869742135062
          },
          "p95": {
            "kind": "finite",
            "value": 41.092264990640714
          }
        },
        "outcome": {
          "median": {
            "kind": "finite",
            "value": 10
          },
          "p5": {
            "kind": "finite",
            "value": 10
          },
          "p95": {
            "kind": "finite",
            "value": 10
          }
        },
        "likely": {
          "cost": {
            "kind": "finite",
            "value": 10
          },
          "outcome": {
            "kind": "finite",
            "value": 10
          }
        },
        "sensitivity": {
          "base": {
            "kind": "finite",
            "value": 10
          },
          "rows": [
            {
              "key": "cost",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 50
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 50
              },
              "swing": {
                "kind": "finite",
                "value": 40
              }
            },
            {
              "key": "people",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "works",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "effect",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "years",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "anyway",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            }
          ]
        },
        "costsSha256": "a129b53bc269da0ea49ee5737477bba9e5546ad274f1ed78747bdffdd53c104b",
        "outcomesSha256": "f51247ff234381d6e05656a71f81c6053c582431cf796d51b5a58d0fae1f72f6",
        "numericalPolicy": "guarded-finite-intermediates-v1"
      }
    },
    {
      "kind": "run",
      "id": "cost-high-mode",
      "input": {
        "values": {
          "cost": [
            100,
            500,
            500
          ],
          "people": [
            10,
            10,
            10
          ],
          "works": [
            1,
            1,
            1
          ],
          "effect": [
            1,
            1,
            1
          ],
          "years": [
            1,
            1,
            1
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 0,
        "seed": 42,
        "draws": 5000
      },
      "raw": null,
      "expected": {
        "draws": 5000,
        "seed": 42,
        "none": 0,
        "cost": {
          "median": {
            "kind": "finite",
            "value": 38.338807742287855
          },
          "p5": {
            "kind": "finite",
            "value": 18.996621422554696
          },
          "p95": {
            "kind": "finite",
            "value": 48.99554141209446
          }
        },
        "outcome": {
          "median": {
            "kind": "finite",
            "value": 10
          },
          "p5": {
            "kind": "finite",
            "value": 10
          },
          "p95": {
            "kind": "finite",
            "value": 10
          }
        },
        "likely": {
          "cost": {
            "kind": "finite",
            "value": 50
          },
          "outcome": {
            "kind": "finite",
            "value": 10
          }
        },
        "sensitivity": {
          "base": {
            "kind": "finite",
            "value": 50
          },
          "rows": [
            {
              "key": "cost",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 50
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 50
              },
              "swing": {
                "kind": "finite",
                "value": 40
              }
            },
            {
              "key": "people",
              "atLow": {
                "kind": "finite",
                "value": 50
              },
              "atHigh": {
                "kind": "finite",
                "value": 50
              },
              "lo": {
                "kind": "finite",
                "value": 50
              },
              "hi": {
                "kind": "finite",
                "value": 50
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "works",
              "atLow": {
                "kind": "finite",
                "value": 50
              },
              "atHigh": {
                "kind": "finite",
                "value": 50
              },
              "lo": {
                "kind": "finite",
                "value": 50
              },
              "hi": {
                "kind": "finite",
                "value": 50
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "effect",
              "atLow": {
                "kind": "finite",
                "value": 50
              },
              "atHigh": {
                "kind": "finite",
                "value": 50
              },
              "lo": {
                "kind": "finite",
                "value": 50
              },
              "hi": {
                "kind": "finite",
                "value": 50
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "years",
              "atLow": {
                "kind": "finite",
                "value": 50
              },
              "atHigh": {
                "kind": "finite",
                "value": 50
              },
              "lo": {
                "kind": "finite",
                "value": 50
              },
              "hi": {
                "kind": "finite",
                "value": 50
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "anyway",
              "atLow": {
                "kind": "finite",
                "value": 50
              },
              "atHigh": {
                "kind": "finite",
                "value": 50
              },
              "lo": {
                "kind": "finite",
                "value": 50
              },
              "hi": {
                "kind": "finite",
                "value": 50
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            }
          ]
        },
        "costsSha256": "3f1c942feb504a03ba4549333b5a78e39934b21a46754b5c6733852f65aab13e",
        "outcomesSha256": "f51247ff234381d6e05656a71f81c6053c582431cf796d51b5a58d0fae1f72f6",
        "numericalPolicy": "guarded-finite-intermediates-v1"
      }
    },
    {
      "kind": "run",
      "id": "fractional-years-undiscounted",
      "input": {
        "values": {
          "cost": [
            100,
            200,
            500
          ],
          "people": [
            10,
            20,
            40
          ],
          "works": [
            0.2,
            0.6,
            0.9
          ],
          "effect": [
            0.1,
            1,
            2
          ],
          "years": [
            0,
            0.5,
            2
          ],
          "anyway": [
            0,
            0.1,
            0.5
          ]
        },
        "discount": 0,
        "seed": 42,
        "draws": 5000
      },
      "raw": null,
      "expected": {
        "draws": 5000,
        "seed": 42,
        "none": 0,
        "cost": {
          "median": {
            "kind": "finite",
            "value": 35.37960451839561
          },
          "p5": {
            "kind": "finite",
            "value": 9.444891309329568
          },
          "p95": {
            "kind": "finite",
            "value": 211.29079199230543
          }
        },
        "outcome": {
          "median": {
            "kind": "finite",
            "value": 7.230398947394819
          },
          "p5": {
            "kind": "finite",
            "value": 1.3631351064523411
          },
          "p95": {
            "kind": "finite",
            "value": 23.642035988538016
          }
        },
        "likely": {
          "cost": {
            "kind": "finite",
            "value": 37.03703703703704
          },
          "outcome": {
            "kind": "finite",
            "value": 5.4
          }
        },
        "sensitivity": {
          "base": {
            "kind": "finite",
            "value": 37.03703703703704
          },
          "rows": [
            {
              "key": "years",
              "atLow": {
                "kind": "no-outcome"
              },
              "atHigh": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "lo": {
                "kind": "finite",
                "value": 9.25925925925926
              },
              "hi": {
                "kind": "no-outcome"
              },
              "swing": {
                "kind": "unbounded"
              }
            },
            {
              "key": "effect",
              "atLow": {
                "kind": "finite",
                "value": 370.37037037037027
              },
              "atHigh": {
                "kind": "finite",
                "value": 18.51851851851852
              },
              "lo": {
                "kind": "finite",
                "value": 18.51851851851852
              },
              "hi": {
                "kind": "finite",
                "value": 370.37037037037027
              },
              "swing": {
                "kind": "finite",
                "value": 351.85185185185173
              }
            },
            {
              "key": "works",
              "atLow": {
                "kind": "finite",
                "value": 111.11111111111111
              },
              "atHigh": {
                "kind": "finite",
                "value": 24.691358024691358
              },
              "lo": {
                "kind": "finite",
                "value": 24.691358024691358
              },
              "hi": {
                "kind": "finite",
                "value": 111.11111111111111
              },
              "swing": {
                "kind": "finite",
                "value": 86.41975308641976
              }
            },
            {
              "key": "cost",
              "atLow": {
                "kind": "finite",
                "value": 18.51851851851852
              },
              "atHigh": {
                "kind": "finite",
                "value": 92.59259259259258
              },
              "lo": {
                "kind": "finite",
                "value": 18.51851851851852
              },
              "hi": {
                "kind": "finite",
                "value": 92.59259259259258
              },
              "swing": {
                "kind": "finite",
                "value": 74.07407407407406
              }
            },
            {
              "key": "people",
              "atLow": {
                "kind": "finite",
                "value": 74.07407407407408
              },
              "atHigh": {
                "kind": "finite",
                "value": 18.51851851851852
              },
              "lo": {
                "kind": "finite",
                "value": 18.51851851851852
              },
              "hi": {
                "kind": "finite",
                "value": 74.07407407407408
              },
              "swing": {
                "kind": "finite",
                "value": 55.55555555555556
              }
            },
            {
              "key": "anyway",
              "atLow": {
                "kind": "finite",
                "value": 33.333333333333336
              },
              "atHigh": {
                "kind": "finite",
                "value": 66.66666666666667
              },
              "lo": {
                "kind": "finite",
                "value": 33.333333333333336
              },
              "hi": {
                "kind": "finite",
                "value": 66.66666666666667
              },
              "swing": {
                "kind": "finite",
                "value": 33.333333333333336
              }
            }
          ]
        },
        "costsSha256": "b2ff5b5351edc234a245115f911ca6338f4cbee869d5c8614a98d2786931ccd9",
        "outcomesSha256": "03b9c5afd7faf2c3aa383789fc2c61b1d62fdc127818689f59aad9146a341ee9",
        "numericalPolicy": "guarded-finite-intermediates-v1"
      }
    },
    {
      "kind": "run",
      "id": "finite-subnormal-costs",
      "input": {
        "values": {
          "cost": [
            2e-322,
            2e-322,
            2e-322
          ],
          "people": [
            1,
            5,
            10
          ],
          "works": [
            1,
            1,
            1
          ],
          "effect": [
            1,
            1,
            1
          ],
          "years": [
            1,
            1,
            1
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 0,
        "seed": 42,
        "draws": 5000
      },
      "raw": null,
      "expected": {
        "draws": 5000,
        "seed": 42,
        "none": 0,
        "cost": {
          "median": {
            "kind": "finite",
            "value": 4e-323
          },
          "p5": {
            "kind": "finite",
            "value": 2.5e-323
          },
          "p95": {
            "kind": "finite",
            "value": 8.4e-323
          }
        },
        "outcome": {
          "median": {
            "kind": "finite",
            "value": 5.272938762790803
          },
          "p5": {
            "kind": "finite",
            "value": 2.341020679301872
          },
          "p95": {
            "kind": "finite",
            "value": 8.474771496826817
          }
        },
        "likely": {
          "cost": {
            "kind": "finite",
            "value": 4e-323
          },
          "outcome": {
            "kind": "finite",
            "value": 5
          }
        },
        "sensitivity": {
          "base": {
            "kind": "finite",
            "value": 4e-323
          },
          "rows": [
            {
              "key": "people",
              "atLow": {
                "kind": "finite",
                "value": 2e-322
              },
              "atHigh": {
                "kind": "finite",
                "value": 2e-323
              },
              "lo": {
                "kind": "finite",
                "value": 2e-323
              },
              "hi": {
                "kind": "finite",
                "value": 2e-322
              },
              "swing": {
                "kind": "finite",
                "value": 1.8e-322
              }
            },
            {
              "key": "cost",
              "atLow": {
                "kind": "finite",
                "value": 4e-323
              },
              "atHigh": {
                "kind": "finite",
                "value": 4e-323
              },
              "lo": {
                "kind": "finite",
                "value": 4e-323
              },
              "hi": {
                "kind": "finite",
                "value": 4e-323
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "works",
              "atLow": {
                "kind": "finite",
                "value": 4e-323
              },
              "atHigh": {
                "kind": "finite",
                "value": 4e-323
              },
              "lo": {
                "kind": "finite",
                "value": 4e-323
              },
              "hi": {
                "kind": "finite",
                "value": 4e-323
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "effect",
              "atLow": {
                "kind": "finite",
                "value": 4e-323
              },
              "atHigh": {
                "kind": "finite",
                "value": 4e-323
              },
              "lo": {
                "kind": "finite",
                "value": 4e-323
              },
              "hi": {
                "kind": "finite",
                "value": 4e-323
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "years",
              "atLow": {
                "kind": "finite",
                "value": 4e-323
              },
              "atHigh": {
                "kind": "finite",
                "value": 4e-323
              },
              "lo": {
                "kind": "finite",
                "value": 4e-323
              },
              "hi": {
                "kind": "finite",
                "value": 4e-323
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "anyway",
              "atLow": {
                "kind": "finite",
                "value": 4e-323
              },
              "atHigh": {
                "kind": "finite",
                "value": 4e-323
              },
              "lo": {
                "kind": "finite",
                "value": 4e-323
              },
              "hi": {
                "kind": "finite",
                "value": 4e-323
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            }
          ]
        },
        "costsSha256": "80940a5b9fc6f535388e144bbbeb58c94294ad57425768c2cca16d97b6173c72",
        "outcomesSha256": "d5b3da2fc8370c4374475750c627ef83284650658e4d0e701eecfbeabbe4dfd9",
        "numericalPolicy": "guarded-finite-intermediates-v1"
      }
    },
    {
      "kind": "run",
      "id": "finite-subnormal-outcomes",
      "input": {
        "values": {
          "cost": [
            5e-324,
            5e-324,
            5e-324
          ],
          "people": [
            1,
            1,
            1
          ],
          "works": [
            1,
            1,
            1
          ],
          "effect": [
            5e-324,
            5e-324,
            5e-324
          ],
          "years": [
            1,
            1,
            1
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 0,
        "seed": 42,
        "draws": 5000
      },
      "raw": null,
      "expected": {
        "draws": 5000,
        "seed": 42,
        "none": 0,
        "cost": {
          "median": {
            "kind": "finite",
            "value": 1
          },
          "p5": {
            "kind": "finite",
            "value": 1
          },
          "p95": {
            "kind": "finite",
            "value": 1
          }
        },
        "outcome": {
          "median": {
            "kind": "finite",
            "value": 5e-324
          },
          "p5": {
            "kind": "finite",
            "value": 5e-324
          },
          "p95": {
            "kind": "finite",
            "value": 5e-324
          }
        },
        "likely": {
          "cost": {
            "kind": "finite",
            "value": 1
          },
          "outcome": {
            "kind": "finite",
            "value": 5e-324
          }
        },
        "sensitivity": {
          "base": {
            "kind": "finite",
            "value": 1
          },
          "rows": [
            {
              "key": "cost",
              "atLow": {
                "kind": "finite",
                "value": 1
              },
              "atHigh": {
                "kind": "finite",
                "value": 1
              },
              "lo": {
                "kind": "finite",
                "value": 1
              },
              "hi": {
                "kind": "finite",
                "value": 1
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "people",
              "atLow": {
                "kind": "finite",
                "value": 1
              },
              "atHigh": {
                "kind": "finite",
                "value": 1
              },
              "lo": {
                "kind": "finite",
                "value": 1
              },
              "hi": {
                "kind": "finite",
                "value": 1
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "works",
              "atLow": {
                "kind": "finite",
                "value": 1
              },
              "atHigh": {
                "kind": "finite",
                "value": 1
              },
              "lo": {
                "kind": "finite",
                "value": 1
              },
              "hi": {
                "kind": "finite",
                "value": 1
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "effect",
              "atLow": {
                "kind": "finite",
                "value": 1
              },
              "atHigh": {
                "kind": "finite",
                "value": 1
              },
              "lo": {
                "kind": "finite",
                "value": 1
              },
              "hi": {
                "kind": "finite",
                "value": 1
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "years",
              "atLow": {
                "kind": "finite",
                "value": 1
              },
              "atHigh": {
                "kind": "finite",
                "value": 1
              },
              "lo": {
                "kind": "finite",
                "value": 1
              },
              "hi": {
                "kind": "finite",
                "value": 1
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "anyway",
              "atLow": {
                "kind": "finite",
                "value": 1
              },
              "atHigh": {
                "kind": "finite",
                "value": 1
              },
              "lo": {
                "kind": "finite",
                "value": 1
              },
              "hi": {
                "kind": "finite",
                "value": 1
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            }
          ]
        },
        "costsSha256": "ad7d5fc693a63c162a026dfff33a3cd16c40540abd669cc1359f4b7f903bc50c",
        "outcomesSha256": "3ee315d16c60f69b668fc4f7a5290ac6f248c059cd9f9a9601195c76745a32e8",
        "numericalPolicy": "guarded-finite-intermediates-v1"
      }
    },
    {
      "kind": "run",
      "id": "genuine-zero-works",
      "input": {
        "values": {
          "cost": [
            100,
            100,
            100
          ],
          "people": [
            10,
            10,
            10
          ],
          "works": [
            0,
            1,
            1
          ],
          "effect": [
            1,
            1,
            1
          ],
          "years": [
            1,
            1,
            1
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 0,
        "seed": 3095237153,
        "draws": 5000
      },
      "raw": null,
      "expected": {
        "draws": 5000,
        "seed": 3095237153,
        "none": 1,
        "cost": {
          "median": {
            "kind": "finite",
            "value": 14.144630614309033
          },
          "p5": {
            "kind": "finite",
            "value": 10.263340414715206
          },
          "p95": {
            "kind": "finite",
            "value": 46.5933524790534
          }
        },
        "outcome": {
          "median": {
            "kind": "finite",
            "value": 7.069820632996734
          },
          "p5": {
            "kind": "finite",
            "value": 2.146228907819313
          },
          "p95": {
            "kind": "finite",
            "value": 9.743416467906574
          }
        },
        "likely": {
          "cost": {
            "kind": "finite",
            "value": 10
          },
          "outcome": {
            "kind": "finite",
            "value": 10
          }
        },
        "sensitivity": {
          "base": {
            "kind": "finite",
            "value": 10
          },
          "rows": [
            {
              "key": "works",
              "atLow": {
                "kind": "no-outcome"
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "no-outcome"
              },
              "swing": {
                "kind": "unbounded"
              }
            },
            {
              "key": "cost",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "people",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "effect",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "years",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "anyway",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            }
          ]
        },
        "costsSha256": "875492516e13599805954d0632a651446c6f57362c7c06af2204a0d0d946c7be",
        "outcomesSha256": "18151421f8f49bdd1adc061417e725f4d4036d175d882bcee8d91a1e27925963",
        "numericalPolicy": "guarded-finite-intermediates-v1"
      }
    },
    {
      "kind": "run",
      "id": "genuine-zero-effect",
      "input": {
        "values": {
          "cost": [
            100,
            100,
            100
          ],
          "people": [
            10,
            10,
            10
          ],
          "works": [
            1,
            1,
            1
          ],
          "effect": [
            0,
            1,
            1
          ],
          "years": [
            1,
            1,
            1
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 0,
        "seed": 1263671340,
        "draws": 5000
      },
      "raw": null,
      "expected": {
        "draws": 5000,
        "seed": 1263671340,
        "none": 1,
        "cost": {
          "median": {
            "kind": "finite",
            "value": 14.144630614309033
          },
          "p5": {
            "kind": "finite",
            "value": 10.263340414715206
          },
          "p95": {
            "kind": "finite",
            "value": 46.5933524790534
          }
        },
        "outcome": {
          "median": {
            "kind": "finite",
            "value": 7.069820632996734
          },
          "p5": {
            "kind": "finite",
            "value": 2.146228907819313
          },
          "p95": {
            "kind": "finite",
            "value": 9.743416467906574
          }
        },
        "likely": {
          "cost": {
            "kind": "finite",
            "value": 10
          },
          "outcome": {
            "kind": "finite",
            "value": 10
          }
        },
        "sensitivity": {
          "base": {
            "kind": "finite",
            "value": 10
          },
          "rows": [
            {
              "key": "effect",
              "atLow": {
                "kind": "no-outcome"
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "no-outcome"
              },
              "swing": {
                "kind": "unbounded"
              }
            },
            {
              "key": "cost",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "people",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "works",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "years",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "anyway",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            }
          ]
        },
        "costsSha256": "875492516e13599805954d0632a651446c6f57362c7c06af2204a0d0d946c7be",
        "outcomesSha256": "18151421f8f49bdd1adc061417e725f4d4036d175d882bcee8d91a1e27925963",
        "numericalPolicy": "guarded-finite-intermediates-v1"
      }
    },
    {
      "kind": "run",
      "id": "genuine-zero-years",
      "input": {
        "values": {
          "cost": [
            100,
            100,
            100
          ],
          "people": [
            10,
            10,
            10
          ],
          "works": [
            1,
            1,
            1
          ],
          "effect": [
            1,
            1,
            1
          ],
          "years": [
            0,
            1,
            1
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 0,
        "seed": 3727072823,
        "draws": 5000
      },
      "raw": null,
      "expected": {
        "draws": 5000,
        "seed": 3727072823,
        "none": 1,
        "cost": {
          "median": {
            "kind": "finite",
            "value": 14.144630614309033
          },
          "p5": {
            "kind": "finite",
            "value": 10.263340414715206
          },
          "p95": {
            "kind": "finite",
            "value": 46.5933524790534
          }
        },
        "outcome": {
          "median": {
            "kind": "finite",
            "value": 7.069820632996734
          },
          "p5": {
            "kind": "finite",
            "value": 2.146228907819313
          },
          "p95": {
            "kind": "finite",
            "value": 9.743416467906574
          }
        },
        "likely": {
          "cost": {
            "kind": "finite",
            "value": 10
          },
          "outcome": {
            "kind": "finite",
            "value": 10
          }
        },
        "sensitivity": {
          "base": {
            "kind": "finite",
            "value": 10
          },
          "rows": [
            {
              "key": "years",
              "atLow": {
                "kind": "no-outcome"
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "no-outcome"
              },
              "swing": {
                "kind": "unbounded"
              }
            },
            {
              "key": "cost",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "people",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "works",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "effect",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            },
            {
              "key": "anyway",
              "atLow": {
                "kind": "finite",
                "value": 10
              },
              "atHigh": {
                "kind": "finite",
                "value": 10
              },
              "lo": {
                "kind": "finite",
                "value": 10
              },
              "hi": {
                "kind": "finite",
                "value": 10
              },
              "swing": {
                "kind": "finite",
                "value": 0
              }
            }
          ]
        },
        "costsSha256": "875492516e13599805954d0632a651446c6f57362c7c06af2204a0d0d946c7be",
        "outcomesSha256": "18151421f8f49bdd1adc061417e725f4d4036d175d882bcee8d91a1e27925963",
        "numericalPolicy": "guarded-finite-intermediates-v1"
      }
    },
    {
      "kind": "refusal",
      "id": "discount-rounds-to-one",
      "raw": null,
      "input": {
        "values": {
          "cost": [
            100,
            100,
            100
          ],
          "people": [
            10,
            10,
            10
          ],
          "works": [
            1,
            1,
            1
          ],
          "effect": [
            1,
            1,
            1
          ],
          "years": [
            1,
            1,
            1
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 1e-17,
        "seed": 42,
        "draws": 5000
      },
      "issue": {
        "code": "numeric-domain",
        "phase": "discount",
        "path": "discount.v",
        "context": {
          "kind": "draw",
          "index": 0
        }
      }
    },
    {
      "kind": "refusal",
      "id": "outcome-product-overflow",
      "raw": null,
      "input": {
        "values": {
          "cost": [
            100,
            100,
            100
          ],
          "people": [
            1e+308,
            1e+308,
            1e+308
          ],
          "works": [
            1,
            1,
            1
          ],
          "effect": [
            1e+308,
            1e+308,
            1e+308
          ],
          "years": [
            1,
            1,
            1
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 0,
        "seed": 42,
        "draws": 5000
      },
      "issue": {
        "code": "numeric-overflow",
        "phase": "outcome",
        "path": "outcome.effect",
        "context": {
          "kind": "draw",
          "index": 0
        }
      }
    },
    {
      "kind": "refusal",
      "id": "positive-cost-ratio-collapse",
      "raw": null,
      "input": {
        "values": {
          "cost": [
            1e-120,
            1e-120,
            1e-120
          ],
          "people": [
            1e+120,
            1e+120,
            1e+120
          ],
          "works": [
            1,
            1,
            1
          ],
          "effect": [
            1e+120,
            1e+120,
            1e+120
          ],
          "years": [
            1,
            1,
            1
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 0,
        "seed": 42,
        "draws": 5000
      },
      "issue": {
        "code": "numeric-underflow",
        "phase": "cost",
        "path": "cost.ratio",
        "context": {
          "kind": "draw",
          "index": 0
        }
      }
    },
    {
      "kind": "refusal",
      "id": "triangle-positive-product-collapse",
      "raw": null,
      "input": {
        "values": {
          "cost": [
            100,
            100,
            100
          ],
          "people": [
            1,
            1,
            1
          ],
          "works": [
            1,
            1,
            1
          ],
          "effect": [
            0,
            5e-201,
            1e-200
          ],
          "years": [
            1,
            1,
            1
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 0,
        "seed": 42,
        "draws": 5000
      },
      "issue": {
        "code": "numeric-underflow",
        "phase": "sample",
        "path": "sample.effect.right-product",
        "context": {
          "kind": "draw",
          "index": 0
        }
      }
    },
    {
      "kind": "refusal",
      "id": "discount-positive-power-collapse",
      "raw": null,
      "input": {
        "values": {
          "cost": [
            100,
            100,
            100
          ],
          "people": [
            10,
            10,
            10
          ],
          "works": [
            1,
            1,
            1
          ],
          "effect": [
            1,
            1,
            1
          ],
          "years": [
            1e+308,
            1e+308,
            1e+308
          ],
          "anyway": [
            0,
            0,
            0
          ]
        },
        "discount": 0.5,
        "seed": 42,
        "draws": 5000
      },
      "issue": {
        "code": "numeric-underflow",
        "phase": "discount",
        "path": "discount.power",
        "context": {
          "kind": "draw",
          "index": 0
        }
      }
    },
    {
      "kind": "refusal",
      "id": "raw-positive-percent-collapse",
      "raw": {
        "parser": "legacy-amount-strip-v1",
        "name": "Illustrative numerical fixture",
        "unit": "fictional outcome",
        "values": {
          "cost": [
            "100",
            "200",
            "500"
          ],
          "people": [
            "10",
            "20",
            "40"
          ],
          "works": [
            "20",
            "60",
            "90"
          ],
          "effect": [
            "0.1",
            "1",
            "2"
          ],
          "years": [
            "0.5",
            "1",
            "3"
          ],
          "anyway": [
            "0",
            "10",
            "50"
          ]
        },
        "discount": "0.00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
        "seed": "42"
      },
      "input": null,
      "issue": {
        "code": "numeric-underflow",
        "phase": "normalize",
        "path": "raw.discount",
        "context": {
          "kind": "normalization"
        }
      }
    },
    {
      "kind": "refusal",
      "id": "raw-positive-number-collapse",
      "raw": {
        "parser": "legacy-amount-strip-v1",
        "name": "Illustrative numerical fixture",
        "unit": "fictional outcome",
        "values": {
          "cost": [
            "100",
            "200",
            "500"
          ],
          "people": [
            "10",
            "20",
            "40"
          ],
          "works": [
            "20",
            "60",
            "90"
          ],
          "effect": [
            "0.00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
            "0.00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
            "0.00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001"
          ],
          "years": [
            "0.5",
            "1",
            "3"
          ],
          "anyway": [
            "0",
            "10",
            "50"
          ]
        },
        "discount": "3",
        "seed": "42"
      },
      "input": null,
      "issue": {
        "code": "numeric-underflow",
        "phase": "normalize",
        "path": "raw.values.effect.low",
        "context": {
          "kind": "normalization"
        }
      }
    }
  ]
};
