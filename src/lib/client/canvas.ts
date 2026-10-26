// Drawing helpers for the PNG exports (Charitology Wrapped, Gift Giving).
// Exports use a fixed palette copied from the light tokens in
// src/styles/global.css, so a downloaded image looks the same whichever
// theme the page is showing. Text always waits for the page's fonts.

export const PAPER = {
  bg: '#f6f3ec',
  bg2: '#eeeae0',
  surface: '#fdfcf9',
  ink: '#1a1915',
  ink2: '#47443c',
  ink3: '#6b665c',
  rule: '#d9d2c4',
  rule2: '#e8e2d6',
  accent: '#8b1e2d',
  accentWash: '#f4e6e3',
  onAccent: '#ffffff',
  depth: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'],
};

export const FACE = {
  display: '"Fraunces Variable", "Iowan Old Style", "Palatino Linotype", Georgia, serif',
  serif: '"Source Serif 4 Variable", "Iowan Old Style", Georgia, serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

export type Face = keyof typeof FACE;

export function font(size: number, face: Face, weight = 400, italic = false): string {
  return `${italic ? 'italic ' : ''}${weight} ${Math.round(size)}px ${FACE[face]}`;
}

/** Wait until the display and body faces needed for `text` have loaded. */
export async function fontsReady(text = 'Charitology'): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  const sample = text.trim() || 'Charitology';
  try {
    await Promise.all([
      fonts.load('600 64px "Fraunces Variable"', sample),
      fonts.load('400 64px "Source Serif 4 Variable"', sample),
      fonts.load('italic 400 64px "Source Serif 4 Variable"', sample),
    ]);
  } catch {
    /* the next font in each stack is used */
  }
  await fonts.ready;
}

export function canvas(width: number, height: number): { el: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.textBaseline = 'alphabetic';
  return { el, ctx };
}

/** Letter spacing where the browser supports it; returns a function that restores it. */
export function spacing(ctx: CanvasRenderingContext2D, px: number): () => void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof c.letterSpacing !== 'string') return () => {};
  const before = c.letterSpacing;
  c.letterSpacing = `${px}px`;
  return () => {
    c.letterSpacing = before;
  };
}

/** Break text into lines no wider than maxWidth. Line breaks in the text are kept. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
        continue;
      }
      if (line) lines.push(line);
      let rest = word;
      while (rest.length > 1 && ctx.measureText(rest).width > maxWidth) {
        let cut = rest.length - 1;
        while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export interface Fitted {
  size: number;
  font: string;
  lines: string[];
}

/** The largest of `sizes` at which text fits in maxLines; at the smallest size, the last line is shortened with an ellipsis. */
export function fitLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  makeFont: (size: number) => string,
  sizes: number[],
): Fitted {
  for (const size of sizes) {
    ctx.font = makeFont(size);
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { size, font: makeFont(size), lines };
  }
  const size = sizes[sizes.length - 1];
  ctx.font = makeFont(size);
  const lines = wrapLines(ctx, text, maxWidth).slice(0, maxLines);
  let last = lines[maxLines - 1] ?? '';
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  lines[maxLines - 1] = `${last.trimEnd()}…`;
  return { size, font: makeFont(size), lines };
}

/** Descending sizes from max to min in steps, for fitLines. */
export function sizes(max: number, min: number, step = 2): number[] {
  const out: number[] = [];
  for (let s = max; s > min; s -= step) out.push(s);
  out.push(min);
  return out;
}

/** A run of text in a stacked layout. Sizes are at scale 1. */
export interface TextBlock {
  text: string;
  face: Face;
  weight?: number;
  italic?: boolean;
  size: number;
  /** Lets this block shrink on its own (down to minSize) before it wraps past maxLines. */
  minSize?: number;
  /** Line height as a multiple of the font size. */
  lineHeight?: number;
  color: string;
  maxLines: number;
  /** Space above the block. */
  gap?: number;
  caps?: boolean;
  /** Letter spacing in pixels. */
  tracking?: number;
}

export interface PlacedBlock {
  block: TextBlock;
  lines: string[];
  px: number;
  lh: number;
  gap: number;
  track: number;
}

/** Wrap every block at one scale and measure the stack. Empty blocks are skipped. */
export function layoutBlocks(ctx: CanvasRenderingContext2D, blocks: TextBlock[], width: number, scale: number): { placed: PlacedBlock[]; height: number } {
  const placed = blocks
    .filter((b) => b.text.trim())
    .map((b, i): PlacedBlock => {
      const text = b.caps ? b.text.toUpperCase() : b.text;
      const make = (s: number) => font(s, b.face, b.weight ?? 400, b.italic);
      const track = (b.tracking ?? 0) * scale;
      const restore = spacing(ctx, track);
      const fit = fitLines(ctx, text, width, b.maxLines, make, sizes(b.size * scale, (b.minSize ?? b.size) * scale, 2));
      restore();
      return { block: b, lines: fit.lines, px: fit.size, lh: fit.size * (b.lineHeight ?? 1.32), gap: i === 0 ? 0 : (b.gap ?? 0) * scale, track };
    });
  const height = placed.reduce((sum, p) => sum + p.gap + p.lines.length * p.lh, 0);
  return { placed, height };
}

/** The largest scale (down to 0.55) at which the stack fits in maxHeight. */
export function fitBlocks(ctx: CanvasRenderingContext2D, blocks: TextBlock[], width: number, maxHeight: number): { placed: PlacedBlock[]; height: number } {
  let result = layoutBlocks(ctx, blocks, width, 1);
  for (let scale = 1; scale >= 0.55 && result.height > maxHeight; scale -= 0.05) {
    result = layoutBlocks(ctx, blocks, width, scale);
  }
  return result;
}

/** Draw a measured stack from y down. Returns the y below the last line. */
export function drawBlocks(ctx: CanvasRenderingContext2D, placed: PlacedBlock[], x: number, y: number, width: number, align: 'left' | 'center'): number {
  let cursor = y;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = align;
  for (const p of placed) {
    cursor += p.gap;
    ctx.font = font(p.px, p.block.face, p.block.weight ?? 400, p.block.italic);
    ctx.fillStyle = p.block.color;
    const restore = spacing(ctx, p.track);
    for (const line of p.lines) {
      const baseline = cursor + (p.lh - p.px) / 2 + p.px * 0.8;
      // Letter spacing trails the last glyph, so centered text is nudged back by half of it.
      ctx.fillText(line, align === 'center' ? x + width / 2 + p.track / 2 : x, baseline);
      cursor += p.lh;
    }
    restore();
  }
  return cursor;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** The Charitology mark (src/components/Mark.astro): an open circle around a point. */
export function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, ink = PAPER.ink, accent = PAPER.accent): void {
  const s = size / 32;
  const gap = Math.atan2(6.88, 9.83);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.arc(16, 16, 12, -gap, gap, true);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(16, 16, 3.6, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();
}

/** Mark and "Charitology", left-aligned at x, vertically centered on y. Returns the width drawn. */
export function drawWordmark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, ink = PAPER.ink): number {
  const markSize = size * 1.25;
  drawMark(ctx, x, y - markSize / 2, markSize, ink);
  ctx.save();
  ctx.font = font(size, 'display', 620);
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const tx = x + markSize + size * 0.3;
  ctx.fillText('Charitology', tx, y + size * 0.04);
  const width = tx + ctx.measureText('Charitology').width - x;
  ctx.restore();
  return width;
}

/**
 * Text set clockwise around a circle and spaced to fill the ring, like the
 * SVG textLength in src/components/Seal.astro. It starts at the left (9 o'clock).
 */
export function drawRingText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number, fill: string, start = Math.PI): void {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const used = widths.reduce((a, b) => a + b, 0);
  const extra = Math.max(0, (2 * Math.PI * r - used) / chars.length);
  let angle = start;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const w = widths[i];
    const mid = angle + (w / 2 + extra / 2) / r;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(mid + Math.PI / 2);
    ctx.fillText(ch, 0, -r);
    ctx.restore();
    angle += (w + extra) / r;
  });
  ctx.restore();
}

export function toPng(el: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    el.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be created.'))), 'image/png');
  });
}

/** "charitology.org/tools/x/" for the configured site and base path. */
export function siteLabel(path: string): string {
  const site = (import.meta.env.SITE as string | undefined) || 'https://charitology.org';
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  try {
    const u = new URL(base + path, site);
    return `${u.host}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return `charitology.org${path}`.replace(/\/$/, '');
  }
}

/** The absolute URL of a page on the configured site. */
export function siteUrl(path: string): string {
  const site = (import.meta.env.SITE as string | undefined) || 'https://charitology.org';
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  try {
    return new URL(base + path, site).toString();
  } catch {
    return `https://charitology.org${path}`;
  }
}
