import publicationRegistry from '../data/publication-editions/registry.json' with { type: 'json' };
import { observationEditionSymbols, publicationSymbols } from './list-identities.ts';
import ledgerManifest from '../data/research-ledger/manifest.json' with { type: 'json' };

// Original line symbols for the public site. Reuse a symbol when two links
// lead to the same work. Keep identity separate from evidence and status.
export const symbols = {
  compass: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19ZM16.5 7.5l-3 6-6 3 3-6 6-3Z',
  lens: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM15 15l5.5 5.5M6.5 10h2l1.5-2.5 1.5 5 1-2.5h1',
  layers: 'M2.5 8 12 3l9.5 5-9.5 5-9.5-5Zm0 4.5 9.5 5 9.5-5m-19 4.5 9.5 5 9.5-5',
  orbit: 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5 19c-3-3 8-17 13-15s-4 17-11 16c-4 0-3-4 0-9s9-8 12-6',
  tools: 'm4 20 8-8m1-1 5 5 2 2-2 2-7-7M3 4l4-1 2 2-1 3-3 1-2-2 1-3ZM17 3l-2 3 3 3 3-2a5 5 0 0 1-6 6',
  archive: 'M3 5h18v4H3zM5 9v12h14V9m-9 4h4m-4 4h4',
  hands: 'M2.5 13 6 9l4 1 2 2-2 2-3-1m14.5 0L18 9l-4 1-4 4 3 3 3-1 2 2 3.5-5ZM8 18l3 3 3-2',
  question: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19ZM9.3 9a2.8 2.8 0 1 1 4.1 2.5c-1 .6-1.4 1-1.4 2.4m0 3.2h.01',
  book: 'M3 4h4c2 0 4 1 5 3 1-2 3-3 5-3h4v15h-5c-2 0-3 1-4 2-1-1-2-2-4-2H3zM12 7v14',
  flask: 'M9 3h6m-5 0v7L4 19q-1 2 2 2h12q3 0 2-2l-6-9V3M7 15h10m-7 3h.01m4-1h.01',
  flaskCheck: 'M8 3h7m-5 0v7l-5 8q-1 3 2 3h11q2 0 1-3l-5-8V3M9 15l2 2 4-4',
  steps: 'M3 20v-5h5v-4h5V7h5V3h3m-8 17h8V7',
  chart: 'M3 3v18h18M7 17v-4m5 4V7m5 10V4',
  dial: 'M3 17a9 9 0 0 1 18 0H3Zm9-1 4-6M7 13l1 1m4-6v2m6 4 1-.5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l4 2',
  history: 'M3 11a9 9 0 1 1 3 8M3 5v6h6m3-5v6l4 2',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Zm3 5h6m-6 4h6',
  document: 'M5 3h10l4 4v14H5zM15 3v5h4M8 12h8m-8 4h8',
  notes: 'M6 3h13v18H6zM3 7h5m-5 5h5m-5 5h5m3-9h5m-5 4h5',
  checks: 'M6 5H4v16h16V5h-2M8 3h8v4H8zM7 12l1.5 1.5L11 11m2 2h4m-10 4 1.5 1.5L11 16m2 2h4',
  compare: 'M3 5h7v14H3zm11 0h7v14h-7M5.5 9h2m-2 4h2m9-3h2m-2 4h2',
  network: 'M12 8v4M6 15l6-3 6 3M9 3h6v5H9zM3 15h6v5H3zm12 0h6v5h-6z',
  split: 'M3 12h6m0 0 5-6h7m-4-3 4 3-4 3m-8 3 5 6h7m-4-3 4 3-4 3',
  loop: 'M4 11a8 8 0 0 1 13-5l3 3m0-5v5h-5m5 4a8 8 0 0 1-13 5l-3-3m0 5v-5h5',
  speech: 'M3 5h18v11H9l-5 4v-4H3zM7 9h10M7 12h6',
  dialogue: 'M3 3h13v10H8l-4 3v-3H3zM18 8h3v11h-2v2l-4-2h-5v-4',
  columns: 'M3 21h18M4 8h16L12 3 4 8Zm2 3v7m6-7v7m6-7v7',
  school: 'm2 9 10-5 10 5-10 5-10-5Zm4 2v6q6 5 12 0v-6m4-2v7',
  badge: 'M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm-4 11-2 7 4-2 2 2 2-2 4 2-2-7m-6-5 1.5 1.5L14 8',
  trophy: 'M7 3h10v8a5 5 0 0 1-10 0zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 4v4m-4 1h8',
  podium: 'M3 20h18M5 20v-7h5v7m0 0V6h5v14m0 0V10h5v10m-10-17 2.5 1L15 3',
  flag: 'M5 21V3m0 1h7l2 2h6v9h-7l-2-2H5',
  building: 'M4 21V8h6V3h10v18H4zm9-14h1m3 0h1m-5 4h1m3 0h1m-5 4h1m3 0h1m-4 6v-3h4v3M7 12h.01M7 16h.01',
  wallet: 'M20 8V5H5Q3 5 3 7v11q0 2 2 2h15V8H5Q3 8 3 7m18 5h-5a2 2 0 0 0 0 4h5zM17 14h.01',
  coins: 'M3 7a6 3 0 1 0 12 0A6 3 0 1 0 3 7Zm0 0v5c0 2 3 3 6 3m-6-3v5c0 2 3 3 6 3m2-8a5 2.5 0 1 0 10 0 5 2.5 0 1 0-10 0Zm0 0v6c0 3 10 3 10 0v-6',
  agave: 'M12 21v-7m0 3C7 17 4 13 2 8c5 1 8 4 10 8m0 1c5 0 8-4 10-9-5 1-8 4-10 8m0 0c-3-3-3-7 0-13 3 6 3 10 0 13M7 21h10',
  seed: 'M12 21V10m0 4c-5 0-8-3-8-7 4 0 8 2 8 7Zm0-3c0-5 3-8 8-8 0 5-3 8-8 8Zm-6 10h12',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  moon: 'M20 15.5A8.8 8.8 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z',
  pin: 'M12 21s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12Zm0-15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-5 4-5 14 0 18m0-18c5 4 5 14 0 18M3 12h18',
  atlas: 'M3 19 8 5h8l5 14H3Zm7-14-2 14m6-14 2 14M5 12h14',
  lock: 'M5 10h14v11H5zM8 10V7a4 4 0 1 1 8 0v3m-4 4v3',
  unlock: 'M5 10h14v11H5zM8 10V7a4 4 0 0 1 7-3m-3 10v3',
  eye: 'M2.5 12s4-6 9.5-6 9.5 6 9.5 6-4 6-9.5 6-9.5-6-9.5-6Zm9.5-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  shield: 'M12 3 20 6v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Zm-4 9 3 3 5-6',
  target: 'M11 3a9 9 0 1 0 10 10M11 7a5 5 0 1 0 6 6m-6-1 8-8m0 0h2m-2 0V2',
  gift: 'M3 8h18v4H3zm2 4v9h14v-9M12 8v13m0-13C5 9 5 3 8 3c2 0 4 3 4 5Zm0 0c7 1 7-5 4-5-2 0-4 3-4 5Z',
  packet: 'M3 8 12 3l9 5v9l-9 4-9-4V8Zm0 0 9 5 9-5m-9 5v8M7 6l9 5',
  window: 'M3 4h18v16H3zm0 5h18M6 6.5h.01m3 0h.01m1 6-2 2 2 2m4-4 2 2-2 2',
  calculator: 'M6 3h12v18H6zm3 4h6m-6 4h1m4 0h1m-6 3h1m4 0h1m-6 3h1m4 0h1',
  board: 'M3 5h18v14H3zm4 4h4v6H7zm7 0h4m-4 3h4m-4 3h4',
  signal: 'M3 12h4l2-6 4 12 2-6h6M3 21h18',
  alert: 'M12 3 2.5 20h19L12 3Zm0 6v4m0 3h.01',
  bolt: 'M13 2 5 13h6l-1 9 9-12h-7l1-8Z',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18',
  forecast: 'M3 3v18h18M6 16l5-6 4 3m2-3 4-5m-4 0h4v4m-6 4 .01 0',
  scale: 'M12 3v17m-6 1h12M3 7h18M6 7l-3 7h6L6 7Zm12 0-3 7h6l-3-7Z',
  match: 'M8 3h8m-4 0v5m-6 5 6-5 6 5m-15 0h6v6H3zm12 0h6v6h-6z',
  fileSearch: 'M5 3h10l4 4v4M15 3v5h4M5 3v18h8m3-10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm2.5 6 3 3',
  stack: 'M5 4h14v16H5zm3 4h8m-8 4h8m-8 4h5M3 7v15h13',
  bars: 'M3 6h12M3 12h18M3 18h8M17 4v4m-4 8v4',
  table: 'M3 4h18v16H3zm0 5h18M3 14h18M9 4v16m6-16v16',
  megaphone: 'M3 10v5h4l3 5h3l-2-5 9 3V5L7 10H3Zm4 0v5m13-5h2m-2 3h2',
  mailSend: 'M3 5h18v8M3 5v14h9M3 5l9 7 9-7m-7 12h7m-3-3 3 3-3 3',
  headphones: 'M3 14v-2a9 9 0 0 1 18 0v2M3 13h4v7H4l-1-2zm14 0h4v5l-1 2h-3z',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  person: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-2a8 6 0 0 1 16 0v2H4Z',
  people: 'M9 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM2 21v-2a7 5 0 0 1 14 0v2H2Zm14-16a3 3 0 0 1 0 6m2 3c3 1 4 3 4 6',
  calendar: 'M3 6h18v15H3zm4-3v6m10-6v6M3 11h18m-13 4h2m4 0h2m-8 3h2',
  story: 'M4 3h13v18H4zM8 7h5m-5 4h5m-5 4h3m8-8h2v10h-2',
  chain: 'm10 15 4-6m-6 7-1 1a3 3 0 0 1-5-3l4-5a3 3 0 0 1 4-1m6 0 1-1a3 3 0 0 1 5 3l-4 5a3 3 0 0 1-4 1',
  break: 'M9 9a3 3 0 0 0-4 0l-3 4a4 4 0 0 0 6 5l2-2m4-8 2-2a4 4 0 0 1 6 5l-3 4a3 3 0 0 1-4 0M12 2v4m0 12v4m-6-2 2-2m8-12 2-2',
  filter: 'M3 4h18l-7 8v6l-4 3v-9L3 4Z',
  hourglass: 'M5 3h14M5 21h14M7 3v3c0 3 3 5 5 6-2 1-5 3-5 6v3M17 3v3c0 3-3 5-5 6 2 1 5 3 5 6v3m-8-3 3-2 3 2',
  hole: 'M3 18h5m8 0h5M5 14h4m6 0h4M7 10h3m4 0h3m-5-7v4m0 13h.01',
  mute: 'M3 9h4l5-4v14l-5-4H3zM16 9l5 6m0-6-5 6',
  star: 'm12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z',
  doorway: 'M3 21h18M6 21V4h12v17m-8 0V8l5-2v15m-2-6h.01',
  balance: 'M3 18h18M5 15l4-8 4 8M9 7h6m0 0 4 8m-12 0h4m6 0h4M12 4v14',
  spark: 'M12 2v6m0 8v6M2 12h6m8 0h6M5 5l4 4m6 6 4 4M5 19l4-4m6-6 4-4',
  folder: 'M3 6h7l2 3h9v11H3zM3 9h8',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  external: 'M12 5H4v15h15v-8m-5-8h6v6m0-6-9 9',
  download: 'M12 3v11m-4-4 4 4 4-4M4 15v5h16v-5',
  heart: 'M12 20S3 15 3 8a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 7-9 12-9 12Z',
  house: 'M3 11 12 3l9 8M5 10v11h14V10m-10 11v-7h6v7',
  drop: 'M12 3C9 8 5 11 5 15a7 7 0 0 0 14 0c0-4-4-7-7-12Zm-4 12q0 3 3 3',
  medical: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  capsule: 'm5 19 14-14a4.2 4.2 0 0 1 0 6l-8 8a4.2 4.2 0 1 1-6-6l8-8a4.2 4.2 0 0 1 6 0M9 9l6 6',
  net: 'M4 4h16v16H4zM4 8h16M4 12h16M4 16h16M8 4v16m4-16v16m4-16v16',
  paw: 'M4 9a2 2.5 0 1 0 4 0 2 2.5 0 1 0-4 0Zm5-4a2 2.5 0 1 0 4 0 2 2.5 0 1 0-4 0Zm5 0a2 2.5 0 1 0 4 0 2 2.5 0 1 0-4 0Zm4 5a2 2.5 0 1 0 4 0 2 2.5 0 1 0-4 0ZM6 18q0-3 4-5 2-3 4 0 4 2 4 5t-5 2h-2q-5 1-5-2Z',
  food: 'M3 11h18c-1 5-4 8-9 8s-8-3-9-8Zm5 9h8M8 8c-2-2 2-3 0-5m5 5c-2-2 2-3 0-5',
  leaf: 'M5 19C1 8 10 4 20 3c0 11-4 20-15 16Zm0 0 11-11',
  monitor: 'M3 4h18v13H3zm6 17h6m-3-4v4',
  umbrella: 'M3 12a9 9 0 0 1 18 0H3Zm9-9V2m0 10v7a2 2 0 0 0 4 0',
  stitch: 'M4 20 20 4m-9 0 9 9m-14-4 9 9M7 13l4 4m2-10 4 4',
  roots: 'M12 3v10m0-4c-4 0-6-2-6-5 4 0 6 2 6 5Zm0 0c4 0 6-2 6-5-4 0-6 2-6 5Zm0 4-5 4-3 4m8-8 5 4 3 4m-8-8v8',
  music: 'M9 18V5l12-2v13M9 8l12-2M9 18a3 2 0 1 1-6 0 3 2 0 1 1 6 0Zm12-2a3 2 0 1 1-6 0 3 2 0 1 1 6 0Z',
  dove: 'M3 16c4 1 7 0 8-2C7 12 5 8 5 4c3 3 6 5 10 5l2-2h3l2 2-3 1c-1 6-5 9-12 9H3l2-2',
  cloud: 'M6 15a4 4 0 0 1 0-8h1a5 5 0 0 1 10 1h1a3.5 3.5 0 0 1 0 7H6Zm0 3h9m-6 3h9',
  flame: 'M12 2c1 4-5 5-5 10 0 1 1 2 2 2 0-4 3-5 5-6 4 4 5 6 5 8a7 7 0 0 1-14 0c0-5 4-10 7-14Z',
  quake: 'M2 8h7l3 4 3-4h7M2 16h6l4-4 4 4h6m-10-4-1 9',
  flood: 'M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0M5 11l7-6 7 6m-12-2v3m10-3v3',
  drought: 'M3 14h18M5 21l4-7 4 3 2-3m-2 3 2 4m2-4 3 4M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  brain: 'M12 6C11 2 6 3 6 6c-4 0-5 5-2 7-2 3 0 6 3 6 1 3 5 2 5-1V6Zm0 0c1-4 6-3 6 0 4 0 5 5 2 7 2 3 0 6-3 6-1 3-5 2-5-1M6 6v3m12-3v3M4 13h4m12 0h-4',
  ballot: 'M4 12h16v9H4zM8 12l-2-4 9-5 4 7-4 2M8 16h8',
  water: 'M12 3C9 8 5 11 5 15a7 7 0 0 0 14 0c0-4-4-7-7-12Zm-6 13c3-3 9 3 12 0',
  candle: 'M8 21h8M9 21V11h6v10m-3-11c-5-2 0-5 0-8 1 2 5 6 0 8Z',
  leafPair: 'M12 21v-8M12 16C5 16 3 11 3 6c6 0 9 4 9 10Zm0-3c0-6 4-9 9-9 0 6-4 9-9 9Z',
  personCheck: 'M10 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM3 21v-2a7 7 0 0 1 10-6m2 4 2 2 4-5',
  fern: 'M4 21C12 18 15 11 19 3m-8 14C5 16 5 12 4 10c4 1 7 3 7 7Zm3-4c3 1 7-2 8-5-4 0-6 2-8 5Zm2-4c-3-1-4-4-3-7 2 1 4 4 3 7Z',
  maple: 'm12 2 2 5 3-2v5l4-1-1 4 2 1-7 4 1 3-4-1-4 1 1-3-7-4 2-1-1-4 4 1V5l3 2 2-5Zm0 17v3',
  bridge: 'M2 18h20M4 18V6m16 12V6M4 7c5 9 11 9 16 0M8 12v6m4-5v5m4-6v6',
  anchor: 'M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 0v15M8 9h8M3 15c1 4 4 6 9 6s8-2 9-6m-18 3v-3h3m12 0h3v3',
  fork: 'M12 21v-8m0 0L6 7V3m0 0L3 6m3-3 3 3m3 7 6-6V3m0 0-3 3m3-3 3 3',
  lever: 'M3 10h18M8 20l4-8 4 8H8ZM5 6h.01m7-1h7',
  ruler: 'm3 16 13-13 5 5L8 21l-5-5Zm6-5 3 3m1-7 3 3m-11 5 3 3',
  rings: 'M10 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm4 0a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z',
  bankOrder: 'M3 5h18v14H3zM6 9h4m-4 3h3m6 1h4m-2-2 2 2-2 2M6 16h4',
  permit: 'M5 3h10l4 4v6m-4-10v5h4M5 3v18h8m-5-9h7m-7 4h4m5 2 2 2 3-4',
  survey: 'M8 4H4v17h16V4h-4M8 2h8v5H8zM8 11h1m4 0h3m-8 5h1m4 0h3',
  route: 'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm12 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 9v4a4 4 0 0 0 4 4h5m-1-8h7m-2-2 2 2-2 2',
  yearFile: 'M5 3h10l4 4v14H5zM15 3v5h4M8 12h8v6H8zm2-2v3m4-3v3m-4 2h4',
  construction: 'M3 21h18M7 21V3m0 0h3l10 5H3l4-5Zm3 0v18M7 13l3 3m-3 1 3 3m7-12v7q0 2-2 2',
  individualShare: 'M9 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM3 20v-2a6 6 0 0 1 12 0v2M18 11l4-6m-4 1h.01m4 4h.01',
  foundationShare: 'M2 8l7-4 7 4H2Zm1 12h12M5 11v6m4-6v6m4-6v6m5-6 4-6m-4 1h.01m4 4h.01',
  bequestShare: 'M3 4h8l4 4v12H3zM11 4v5h4M6 13h6m-6 4h4m8-6 4-6m-4 1h.01m4 4h.01',
  companyShare: 'M3 20V8h12v12H3Zm3-8h.01m5 0h.01m-5 4h.01m5 0h.01m7-5 4-6m-4 1h.01m4 4h.01',
  pulse: 'M2 12h5l3-8 4 16 3-8h5',
  agreement: 'M4 3h11l4 4v14H4zM15 3v5h4M7 11h9m-9 4h3m1 3 2-3 2 2 2-2',
  sourceCopy: 'M7 3h9l4 4v11H7zM16 3v5h4M4 7v14h13M10 11h7m-7 3h7',
} as const;

export type SymbolName = keyof typeof symbols;
type Tone = 'wine' | 'blue' | 'teal' | 'violet' | 'amber' | 'green' | 'slate';
type Section = { path: string; symbol: SymbolName; tone: Tone; entries?: Record<string, SymbolName> };

export const sections: Section[] = [
  { path: '/', symbol: 'compass', tone: 'slate' },
  { path: '/diagnosis/', symbol: 'lens', tone: 'wine', entries: {
    'fragmentation': 'break', 'measurement-gap': 'hole', 'missing-feedback-loop': 'loop',
    'missing-profession': 'badge', 'missing-voice': 'mute', 'overhead-myth': 'calculator',
    'parked-money': 'lock', 'prestige-economy': 'star', 'proximity-pull': 'pin',
    'restriction-reflex': 'filter', 'short-horizon': 'hourglass', 'silence-about-failure': 'archive',
    'single-lens': 'eye', 'story-bias': 'story', 'symptom-trap': 'layers',
  } },
  { path: '/method/', symbol: 'layers', tone: 'blue' },
  { path: '/programs/', symbol: 'orbit', tone: 'teal', entries: {
    'cause-census': 'atlas', 'certified-charitologist': 'badge', 'charitology-fellowship': 'people',
    'charitology-summit': 'podium', 'charity-incubator': 'seed', 'corporate-program': 'building',
    'donor-advisory': 'dialogue', 'evidence-reviews': 'fileSearch', 'failure-lab': 'alert',
    'field-verification': 'shield', 'forecasting-tournaments': 'forecast', 'history-of-charity': 'history',
    'local-charitology': 'pin', 'methods-lab': 'flask', 'moral-frameworks-program': 'scale',
    'nonprofit-advisory': 'hands', 'policy-program': 'columns', 'principles-course': 'book',
    'question-bounties': 'target', 'red-team': 'flag', 'replication-program': 'flaskCheck',
    'the-charitology-fund': 'coins', 'the-charitology-prize': 'trophy', 'the-open-problems': 'question',
    'time-charitology': 'clock', 'university-chapters': 'school',
  } },
  { path: '/tools/', symbol: 'tools', tone: 'violet', entries: {
    'ai-charitologist': 'spark', 'browser-extension': 'window', 'charitology-wrapped': 'gift',
    'charity-lookup': 'fileSearch', 'charity-os': 'board', 'compare-tool': 'compare',
    'cost-effectiveness-model-kit': 'table', 'disaster-response-guide': 'alert',
    'due-diligence-checklist': 'checks', 'forecasting-platform': 'forecast', 'gift-giving': 'heart',
    'giving-dashboard': 'chart', 'grant-evaluator': 'scale', 'impact-calculator': 'calculator',
    'impact-measurement-toolkit': 'dial', 'legacy-planner': 'document', 'model-bundles': 'packet',
    'one-click-split': 'split', 'portfolio-builder': 'layers', 'public-api': 'code', 'values-compass': 'compass',
    'browser-extension/compatibility': 'checks', 'browser-extension/privacy': 'lock',
    'cost-effectiveness-model-kit/spreadsheet': 'table',
    'giving-dashboard/estimate': 'calculator',
  } },
  { path: '/record/', symbol: 'archive', tone: 'blue', entries: {
    'case-studies': 'folder', 'cause-atlas': 'atlas', 'charitology-100': 'badge', 'charity-index': 'fileSearch',
    'charity-index/coverage': 'checks', 'charity-index/brazil': 'bridge', 'charity-index/japan': 'flag', 'charity-index/new-zealand': 'fern',
    'charity-financials': 'coins', 'charity-financials/canada': 'maple', 'charity-financials/united-states': 'columns',
    'charity-financials/united-states/990-ez': 'notes', 'charity-financials/united-states/990-pf': 'building',
    'charity-financials/england-wales': 'shield', 'charity-financials/kenya': 'chart', 'charity-financials/mexico': 'agave',
    'countries': 'pin', 'country-profiles': 'globe', 'disagreements': 'dialogue', 'editions': 'document',
    'editions/compare': 'compare', 'encyclopedia': 'book', 'evidence-library': 'stack',
    'failure-archive': 'break', 'funding-flows': 'split', 'funding-flows/canada-qualified-donees': 'chain',
    'funding-flows/canada-grant-geography': 'globe',
    'funding-flows/brazil-transferegov': 'wallet', 'funding-flows/brazil-planned-geography': 'atlas', 'funding-flows/brazil-solidarity-kitchens': 'hands',
    'funding-flows/brazil-project-execution': 'construction',
    'funding-flows/brazil-project-contracts': 'yearFile',
    'funding-flows/brazil-works-measurements': 'ruler',
    'funding-flows/brazil-infrastructure-account-movements': 'bankOrder',
    'funding-flows/brazil-infrastructure-invoice-items': 'calculator',
    'funding-flows/brazil-infrastructure-procurement-payments': 'match',
    'funding-flows/brazil-infrastructure-work-lots': 'layers',
    'funding-flows/brazil-infrastructure-procurement-lots': 'rings',
    'funding-flows/brazil-infrastructure-procurement-lots/joacaba-outpatient': 'signal',
    'funding-flows/brazil-solidarity-kitchens/account-payments': 'coins', 'funding-flows/brazil-cisterns': 'water',
    'funding-flows/us-schedule-i': 'table', 'funding-flows/iberia-hrsa': 'medical', 'funding-flows/ile-de-france-paid-grants': 'pin',
    'funding-flows/greater-manchester-home-from-hospital': 'heart', 'funding-flows/hokkaido-child-support': 'seed',
    'funding-flows/western-cape-transfers': 'building',
    'funding-flows/heal-nepal': 'capsule',
    'funding-flows/kenya-nutrition': 'food',
    'funding-flows/ripple-effect-kenya-accounts': 'balance',
    'funding-flows/yes-i-do-alliance': 'network', 'gap-map': 'map', 'interventions': 'target',
    'journal': 'notes', 'lexicon': 'bars', 'methodology': 'checks', 'myths': 'eye', 'newsletter': 'mail', 'newsletter/edition-1': 'story',
    'open-datasets': 'table', 'podcast': 'headphones', 'podcast-and-newsletter': 'signal',
    'podcast/principles-1': 'network', 'podcast/principles-2': 'layers', 'podcast/principles-3': 'fileSearch',
    'podcast/principles-4': 'compare', 'podcast/principles-5': 'scale', 'podcast/principles-6': 'speech',
    'principles': 'layers', 'principles/read': 'book', 'progress-report': 'steps', 'state-of-charity': 'chart', 'traditions': 'history',
  } },
  { path: '/for-charities/', symbol: 'hands', tone: 'green', entries: {
    'start': 'steps', 'fundraising': 'megaphone', 'networks': 'network', 'collaborate': 'dialogue',
    'website-pilots': 'window', 'os-plan': 'ruler', 'tools': 'tools', 'benefits': 'gift',
    'fundraising/email-appeals': 'mailSend', 'fundraising/paid-ads': 'target',
    'fundraising/fundraising-events': 'calendar', 'fundraising/recurring-giving': 'loop',
    'fundraising/peer-to-peer': 'network', 'fundraising/major-gifts': 'gift',
    'fundraising/grants': 'document', 'fundraising/direct-mail': 'mail',
    'fundraising/corporate-partnerships': 'building', 'fundraising/donor-follow-up': 'dialogue',
    'networks/founder-networks': 'seed', 'networks/leadership-networks': 'people', 'networks/sector-networks': 'map',
  } },
  { path: '/learn/', symbol: 'school', tone: 'teal', entries: {
    'teach': 'book', 'schools': 'seed', 'universities': 'columns', 'clubs': 'people', 'materials': 'download',
  } },
  { path: '/open-problems/', symbol: 'question', tone: 'amber', entries: {
    'closing-the-feedback-loop': 'loop', 'discounting-the-future': 'hourglass', 'measuring-the-source': 'layers',
    'moral-parliament-in-practice': 'dialogue', 'proximity-and-obligation': 'pin', 'story-without-bias': 'story',
    'the-agency-premium': 'person', 'the-counterfactual-problem': 'compare', 'the-depth-census': 'bars',
    'the-enough-question': 'dial', 'the-exchange-rate-problem': 'scale', 'the-failure-commons': 'archive',
    'the-fragmentation-question': 'network', 'the-government-question': 'columns', 'the-money-time-exchange': 'clock',
    'the-optimal-restriction': 'filter', 'the-overhead-replacement': 'calculator', 'the-payout-question': 'wallet',
    'the-profession-question': 'badge', 'the-question-of-questions': 'target', 'the-replication-rate': 'flaskCheck',
    'the-status-flip': 'star', 'when-charity-harms': 'alert',
  } },
  { path: '/disasters/', symbol: 'alert', tone: 'wine', entries: { 'incidents': 'pin', 'editions': 'archive', 'sources': 'document' } },
  { path: '/observations/', symbol: 'eye', tone: 'teal', entries: { 'editions': 'archive', 'sources': 'document', 'files': 'download' } },
  { path: '/research-ledger/', symbol: 'notes', tone: 'blue', entries: { 'editions': 'archive', 'sources': 'document' } },
  { path: '/forecasts/', symbol: 'forecast', tone: 'violet', entries: {
    'daf-assets-2026-above-380b': 'wallet', 'first-open-problem-progress-by-2028': 'steps',
    'five-published-failures-by-2027': 'break', 'polio-wpv1-certified-by-2030': 'shield',
    'us-giving-2026-above-640b': 'gift',
  } },
  { path: '/newsletter/', symbol: 'mail', tone: 'wine', entries: { 'privacy': 'lock' } },
  { path: '/contribute/', symbol: 'people', tone: 'green', entries: { 'review': 'checks' } },
  { path: '/roadmap/', symbol: 'map', tone: 'amber' },
  { path: '/manifesto/', symbol: 'flag', tone: 'wine' },
  { path: '/about/', symbol: 'compass', tone: 'slate' },
  { path: '/browser-data/', symbol: 'download', tone: 'slate' },
  { path: '/search/', symbol: 'lens', tone: 'slate' },
  { path: '/404/', symbol: 'break', tone: 'slate' },
];

const referenceEntries: Record<string, Record<string, SymbolName>> = {
  encyclopedia: {
    'beneficiary-feedback': 'loop', 'charity-as-a-system': 'network', 'cost-effectiveness-analysis': 'calculator',
    'counterfactual-impact': 'compare', 'discounting': 'hourglass', 'donor-advised-funds': 'wallet',
    'effective-altruism': 'compass', 'expected-value': 'forecast', 'identifiable-victim-effect': 'person',
    'impact-investing': 'chart', 'moral-uncertainty': 'scale', 'mutual-aid': 'hands', 'neglectedness': 'hole',
    'outputs-and-outcomes': 'signal', 'overhead-ratio': 'dial', 'participatory-grantmaking': 'dialogue',
    'private-foundations': 'columns', 'psychic-numbing': 'mute', 'randomized-controlled-trials': 'flask',
    'restricted-and-unrestricted-funding': 'unlock', 'scale-neglectedness-tractability': 'target',
    'source-depth': 'layers', 'symptoms-and-sources': 'lens', 'systemic-change': 'steps',
    'theory-of-change': 'map', 'warm-glow-giving': 'sun',
  },
  interventions: {
    'cash-transfers': 'wallet', 'community-health-workers': 'medical', 'corporate-animal-welfare-campaigns': 'paw',
    deworming: 'capsule', 'food-banks': 'food', 'housing-first': 'house', 'insecticide-treated-nets': 'net',
    'lead-exposure-elimination': 'shield', microcredit: 'coins', 'oral-rehydration-therapy': 'drop',
    'seasonal-malaria-chemoprevention': 'calendar', 'teaching-at-the-right-level': 'school',
    'tobacco-taxation-advocacy': 'megaphone', 'vaccination-incentives': 'target', 'vitamin-a-supplementation': 'eye',
  },
  'case-studies': {
    'carnegie-libraries': 'book', dare: 'megaphone', 'green-revolution': 'seed',
    'haiti-earthquake-reconstruction': 'house', 'hookworm-campaign': 'capsule', 'ice-bucket-challenge': 'drop',
    'one-laptop-per-child': 'window', 'oral-rehydration-therapy-spread': 'medical', playpumps: 'loop',
    'polio-eradication': 'shield', 'rosenwald-schools': 'school', 'scared-straight': 'alert', 'smallpox-eradication': 'target',
  },
  myths: {
    'aid-never-works': 'globe', 'if-a-program-sounds-logical-it-works': 'flask', 'low-overhead-means-a-good-charity': 'calculator',
    'most-charities-are-about-equally-effective': 'compare', 'sending-supplies-is-the-best-disaster-help': 'packet',
    'small-donations-dont-make-a-difference': 'coins', 'the-cause-that-moves-you-needs-your-money-most': 'heart',
    'you-cant-measure-the-good-a-charity-does': 'dial',
  },
  disagreements: {
    'are-donor-advised-funds-good-for-charity': 'wallet', 'deworming-long-run-effects': 'capsule',
    'does-microcredit-transform-lives': 'coins', 'how-much-do-animals-count': 'paw', 'near-or-far': 'pin',
    'systemic-change-or-proven-programs': 'layers', 'the-long-term-future-or-present-needs': 'hourglass',
    'what-randomized-trials-can-tell-us': 'flask',
  },
  traditions: {
    'christian-almsgiving-and-tithing': 'gift', dana: 'hands', 'dasvandh-and-seva': 'heart',
    'mutual-aid-societies': 'network', 'the-gospel-of-wealth': 'building',
    tzedakah: 'scale', ubuntu: 'people', 'zakat-and-sadaqah': 'coins',
  },
  principles: {
    '01-what-charitology-is': 'compass', '02-the-charity-system': 'network', '03-depth-from-relief-to-source': 'layers',
    '04-evidence-and-its-grades': 'fileSearch', '05-counterfactuals-and-neglect': 'compare',
    '06-comparing-the-incomparable': 'scale', '07-time': 'clock', '08-feedback-and-voice': 'speech',
    '09-failure-and-learning': 'loop', '10-becoming-a-charitologist': 'badge',
  },
  journal: { 'depth-without-a-ladder': 'layers', 'ten-dollars': 'coins', 'the-feedback-contract': 'loop' },
};

export function chapterSymbol(chapter: number): SymbolName {
  const prefix = String(chapter).padStart(2, '0') + '-';
  return Object.entries(referenceEntries.principles).find(([slug]) => slug.startsWith(prefix))?.[1] ?? 'book';
}

const articleRoutes = sections.flatMap(({ path, symbol, tone, entries = {} }) => [
  { path, symbol, tone },
  ...Object.entries(entries).map(([slug, symbol]) => ({ path: path + slug + '/', symbol, tone })),
]).concat(Object.entries(referenceEntries).flatMap(([section, entries]) =>
  Object.entries(entries).map(([slug, symbol]) => ({ path: `/record/${section}/${slug}/`, symbol, tone: 'blue' as const })),
));

const ledgerPath = '/research-ledger/';
const ledgerKinds = {
  problem: ['question', 'amber'], manuscript: ['notes', 'violet'], case: ['folder', 'teal'],
  method: ['layers', 'slate'], concept: ['book', 'blue'], claim: ['speech', 'wine'],
  artifact: ['packet', 'green'], challenge: ['flag', 'wine'], decision: ['scale', 'slate'],
} as const satisfies Record<string, readonly [SymbolName, Tone]>;
const standaloneLedgerSymbols: Record<string, SymbolName> = {
  'artifact:pr-3-editorial-framing': 'code',
  'claim:depth-census-knowledge': 'layers',
  'claim:ten-dollars-framing': 'compare',
};

// Bind to the published entry in the ledger manifest. A matching slug alone
// does not establish that a ledger record documents an article.
const ledgerArticles = new Map(ledgerManifest.currentSources.map(({ recordId, href }) => [recordId, href]));
const articleSymbols = new Map(articleRoutes.map(({ path, symbol }) => [path, symbol]));
function ledgerRecordRoute(id: string, symbol: SymbolName) {
  const kind = id.split(':', 1)[0] as keyof typeof ledgerKinds;
  return { path: `${ledgerPath}${id}/`, symbol, tone: ledgerKinds[kind]?.[1] ?? 'blue' as const };
}
const ledgerRecords = [...ledgerArticles].map(([id, href]) => {
  const symbol = articleSymbols.get(href);
  if (!symbol) throw new Error(`No article symbol for ${id} at ${href}`);
  return ledgerRecordRoute(id, symbol);
});

const observationEditions = Object.entries(observationEditionSymbols).map(([id, symbol]) => ({
  path: `/observations/editions/${id}/`, symbol, tone: 'teal' as const,
}));
const publicationEditions = Object.entries(publicationRegistry.current).map(([family, id]) => ({
  path: `/record/editions/${id}/`, symbol: publicationSymbols[family], tone: 'blue' as const,
}));

export const routes = [
  ...articleRoutes,
  ...observationEditions,
  ...publicationEditions,
  ...Object.entries(ledgerKinds).map(([kind, [symbol, tone]]) => ({ path: `${ledgerPath}${kind}:`, symbol, tone })),
  ...Object.entries(standaloneLedgerSymbols).map(([id, symbol]) => ledgerRecordRoute(id, symbol)),
  ...ledgerRecords,
].sort((a, b) => a.path.length - b.path.length);

export function pageIdentity(path: string) {
  const decoded = path.startsWith(ledgerPath) ? path.replace(/%3a/gi, ':') : path;
  const normalized = decoded.endsWith('/') ? decoded : decoded + '/';
  return routes.findLast((route) => normalized.startsWith(route.path)) ?? { symbol: 'compass', tone: 'slate' };
}
