import { defaultTreeAdapter as tree, parse, type DefaultTreeAdapterMap } from 'parse5';
import { editorialListSymbol } from './editorial-list-symbol.ts';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

const lists = new Set(['ul', 'ol']);
const inlineText = new Set(['abbr', 'b', 'code', 'del', 'em', 'i', 'mark', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time']);
const ownMark = new Set(['data-list-symbol', 'data-list-link', 'data-site-symbol']);
const markedLabels = new Set(['identity-code', 'identity-label', 'numeral', 'pin-num', 'pnum']);

function attribute(node: Element, name: string) {
  return node.attrs.find(attr => attr.name === name)?.value;
}

function firstContent(node: Element) {
  return node.childNodes.find(child => tree.isElementNode(child) || (tree.isTextNode(child) && child.value.trim()));
}

function textLead(node: Node | undefined): string {
  if (!node) return '';
  if (tree.isTextNode(node)) return node.value.trim();
  if (!tree.isElementNode(node) || !inlineText.has(node.tagName)) return '';
  if (node.attrs.some(attr => ownMark.has(attr.name) || attr.name === 'hidden' ||
    (attr.name === 'aria-hidden' && attr.value === 'true'))) return '';
  if (attribute(node, 'class')?.split(/\s+/).some(name => markedLabels.has(name))) return '';
  return node.childNodes.map(textLead).join(' ').trim();
}

// Preserve the original markup. Add presentation attributes at the parser's
// start-tag offsets so inline scripts, public records and source text stay exact.
export function markPublicLists(html: string): string {
  if (!html.includes('<li') || !html.includes('data-site-path=')) return html;
  const edits: { at: number; attributes: string }[] = [];
  const add = (element: Element, attributes: string) => {
    const tag = element.sourceCodeLocation?.startTag;
    if (tag) edits.push({ at: tag.endOffset - 1, attributes });
  };

  function walk(node: Node, inMain: boolean) {
    if (!('childNodes' in node)) return;
    if (tree.isElementNode(node)) {
      if (node.tagName === 'main') inMain = attribute(node, 'data-site-path') !== undefined;
      if (inMain && lists.has(node.tagName)) {
        const before = edits.length;
        for (const item of node.childNodes) {
          if (!tree.isElementNode(item) || item.tagName !== 'li' ||
            item.attrs.some(attr => ownMark.has(attr.name) || attr.name === 'role')) continue;

          const start = firstContent(item);
          const lead = start && tree.isElementNode(start) && start.tagName === 'p' ? firstContent(start) : start;
          if (lead && tree.isElementNode(lead) && lead.tagName === 'a' && attribute(lead, 'class') === undefined &&
            /^(?:\/(?!\/)|#|https?:\/\/|mailto:)/.test(attribute(lead, 'href') ?? '')) {
            add(item, ' data-list-link=""');
          } else {
            const label = textLead(lead);
            if (label) add(item, ` data-list-symbol="${editorialListSymbol(label)}"`);
          }
        }
        // Keep the native list announced when the visual bullet is replaced.
        if (node.tagName === 'ul' && edits.length > before && attribute(node, 'role') === undefined) {
          add(node, ' role="list"');
        }
      }
    }
    for (const child of node.childNodes) walk(child, inMain);
  }

  walk(parse(html, { sourceCodeLocationInfo: true }), false);
  if (!edits.length) return html;
  edits.sort((a, b) => a.at - b.at);
  let start = 0;
  const parts = edits.map(({ at, attributes }) => {
    const part = html.slice(start, at) + attributes;
    start = at;
    return part;
  });
  return parts.join('') + html.slice(start);
}
