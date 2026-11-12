import type { Member } from './publication-editions-types';
import { chapterSymbol, pageIdentity, type SymbolName } from './site-identities';

const memberSymbols: Readonly<Record<string, SymbolName>> = {
  'us-giving': 'wallet',
  'giving-source-1': 'person',
  'giving-source-2': 'columns',
  'giving-source-3': 'yearFile',
  'giving-source-4': 'building',
  'giving-source-share-1': 'individualShare',
  'giving-source-share-2': 'foundationShare',
  'giving-source-share-3': 'bequestShare',
  'giving-source-share-4': 'companyShare',
  'giving-recipient-1': 'candle',
  'giving-recipient-2': 'hands',
  'giving-recipient-3': 'school',
  'giving-recipient-4': 'stack',
  'giving-recipient-5': 'people',
  'giving-recipient-6': 'medical',
  'giving-recipient-7': 'globe',
  'giving-recipient-8': 'music',
  'giving-recipient-9': 'leafPair',
  'daf-assets-billions': 'lock',
  'daf-grants-billions': 'route',
  'daf-contributions-billions': 'bankOrder',
  'daf-payout-rate': 'forecast',
  'cost-per-life-low': 'ruler',
  'cost-per-life-high': 'calculator',
  'registered-description': 'permit',
};

export function publicationMemberSection({ id, payload }: Member) {
  const slug = `member-${id}`;
  switch (payload.kind) {
    case 'figure-input-v1':
      return { slug, text: payload.label, symbol: memberSymbols[id] ?? 'chart' as const };
    case 'project-census-v1':
      return { slug, text: 'The captured project census', symbol: 'layers' as const };
    case 'r4-progress-v1':
      return { slug, text: 'Progress recorded by the pinned research ledger', symbol: 'steps' as const };
    case 'chapter-v1':
      return { slug, text: payload.title, symbol: chapterSymbol(payload.chapter) };
    case 'manuscript-v1':
      return { slug, text: payload.title, symbol: pageIdentity(`/record/journal/${id}/`).symbol };
    case 'legacy-letter-v1':
      return { slug, text: payload.title, symbol: 'story' as const };
    case 'authored-letter-v1':
      return { slug, text: payload.title, symbol: 'mail' as const };
  }
}
