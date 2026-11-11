import type { SymbolName } from './site-identities';

const labels: [RegExp, SymbolName][] = [
  [/^(?:what (?:it is|the claim is)|overview|background)/, 'document'],
  [/^(?:where to start|what to ask|how to help|next steps|use )/, 'steps'],
  [/^(?:how |the method|what it looks like)/, 'tools'],
  [/^(?:the debate|where .*stands|why it’s debated)/, 'dialogue'],
  [/^(?:where .*depth|the five levels)|\bdepth\b/, 'layers'],
  [/^(?:what .*evidence|sources|what trials|what’s true)|\b(?:results|findings)\b/, 'flask'],
  [/^(?:what .*success|what success|what would close)|\b(?:question|prediction)$/, 'target'],
  [/^(?:what we don’t know|open questions|what remains)|\bunknowns\b/, 'question'],
  [/^(?:risks|limits|watch for|coverage|what it can’t|what it isn’t)|\blimits\b/, 'shield'],
  [/^(?:what happened|where it came from)|\bhistory\b/, 'history'],
  [/^(?:why |where .*system|through the source lens)|\bsystem\b/, 'network'],
  [/\b(?:costs?|spending|funding)\b/, 'coins'],
  [/\b(?:example|case)\b/, 'fileSearch'],
  [/\b(?:feedback|learning|follow-up)\b/, 'loop'],
  [/\b(?:voices?|contribute|contributors)\b/, 'people'],
  [/\b(?:compare|comparison|counterfactual)\b/, 'compare'],
];

export function headingSymbol(text: string): SymbolName {
  const label = text.toLowerCase().trim();
  return labels.find(([pattern]) => pattern.test(label))?.[1] ?? 'bookmark';
}
