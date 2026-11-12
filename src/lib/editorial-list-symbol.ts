import { headingSymbol } from './heading-symbol.ts';
import type { SymbolName } from './site-symbols.ts';

// Read the lead as a label or action. The full wording stays visible and
// remains the source of meaning when a general-purpose mark is used.
const actions: readonly [RegExp, SymbolName][] = [
  [/^(?:ask|invite|listen|talk|discuss|whose)\b/, 'dialogue'],
  [/^(?:calculate|count|estimate|measure)\b/, 'calculator'],
  [/^(?:check|inspect|verify|confirm|audit)\b/, 'checks'],
  [/^(?:choose|decide|select|pick)\b/, 'fork'],
  [/^(?:compare|distinguish|separate|contrast)\b/, 'compare'],
  [/^(?:draft|record|write|describe|document|note)\b/, 'notes'],
  [/^(?:evaluate|test|replicate|try|experiment)\b/, 'flask'],
  [/^(?:find|look|search|identify)\b/, 'lens'],
  [/^(?:follow|revisit|review|revise|update)\b/, 'loop'],
  [/^(?:read|study|learn|teach)\b/, 'book'],
  [/^(?:save|export|back up|download)\b/, 'download'],
  [/^(?:share|send|contact|report|publish)\b/, 'mail'],
  [/^(?:set|schedule|wait)\b/, 'clock'],
  [/^(?:use|build|make|create|design)\b/, 'tools'],
  [/^(?:an? |the )?(?:reading|lesson|chapter)\b/, 'book'],
  [/^(?:an? |the )?(?:exercise|activity|practice)\b/, 'tools'],
  [/^(?:an? |the )?(?:problem set|checklist)\b/, 'checks'],
  [/^(?:an? |the )?(?:assumption|uncertainty|open question)\b/, 'question'],
  [/^(?:an? |the )?(?:sample|participants?|community)\b/, 'people'],
  [/^(?:an? |the )?(?:method|protocol|test)\b/, 'flask'],
  [/^(?:cipi row|contract record)\b/, 'agreement'],
  [/^(?:identifier|registration|legal name)\b/, 'badge'],
  [/^(?:incoming funds|cash received|revenue)\b/, 'wallet'],
  [/^(?:disbursement|outgoing payment|bank order)\b/, 'bankOrder'],
  [/^(?:added|new record)\b/, 'spark'],
  [/^(?:amended|corrected|revised|superseded)\b/, 'loop'],
  [/^(?:draft|publisher self-report|attributed)\b/, 'speech'],
  [/^(?:only|scope|national indicator scope)\b/, 'layers'],
  [/^(?:no |unknown |uncollected|unreported)/, 'question'],
  [/^\d{4}\b/, 'calendar'],
];

export function editorialListSymbol(text: string): SymbolName {
  const label = text.trim().toLowerCase();
  return actions.find(([pattern]) => pattern.test(label))?.[1] ?? headingSymbol(label);
}
