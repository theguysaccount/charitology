// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import { headingSymbol } from './src/lib/heading-symbol.ts';
import { sourceSymbol } from './src/lib/source-symbol.ts';

// SITE_URL and BASE_PATH are set by the deploy workflow from GitHub Pages
// (https://<owner>.github.io + /charitology, or the custom domain + /).
const site = process.env.SITE_URL || 'https://charitology.com';
const base = process.env.BASE_PATH || '/';
const prefix = base.replace(/\/$/, '');

/**
 * Markdown links are written root-relative ("/diagnosis/symptom-trap/") so
 * content never has to know where the site is deployed. This prefixes them
 * with the base path and marks external links.
 */
function rehypePublicMarkdown() {
  /** @param {any} tree @param {{ path?: string }} file */
  return (tree, file) => {
    // This standalone GitHub document sits under the public OS plan page's
    // own title. Preserve its heading order and anchors inside that section.
    const embeddedPlan = file.path?.endsWith('/docs/CHARITY_OS_PLAN.md');

    /** @param {any} node @returns {string} */
    const text = (node) => node.type === 'text' ? node.value : (node.children ?? []).map(text).join('');
    /** @param {any} node */
    const walk = (node) => {
      if (embeddedPlan && node.type === 'element' && /^h[1-5]$/.test(node.tagName)) {
        node.tagName = `h${Number(node.tagName[1]) + 1}`;
      }
      if (node.type === 'element' && node.tagName === 'h2') {
        node.properties.dataSectionSymbol = headingSymbol(text(node));
      }
      if (node.type === 'element' && node.tagName === 'a') {
        const href = node.properties?.href;
        if (typeof href === 'string') {
          if (prefix && href.startsWith('/') && !href.startsWith('//') && !href.startsWith(`${prefix}/`)) {
            node.properties.href = prefix + href;
          } else if (/^https?:\/\//.test(href)) {
            const symbol = URL.canParse(href) ? sourceSymbol(href) : undefined;
            if (symbol && symbol !== 'external') node.properties.dataSourceSymbol = symbol;
            node.properties.rel = ['noopener'];
            node.properties.className = [...(node.properties.className || []), 'ext'];
          }
        }
      }
      if (node.children) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  compressHTML: true,
  image: { service: passthroughImageService() },
  devToolbar: { enabled: false },
  vite: {
    worker: {
      format: 'es',
      rolldownOptions: { output: { codeSplitting: false } },
    },
  },
  markdown: {
    processor: unified({
      rehypePlugins: [rehypePublicMarkdown],
      smartypants: true,
    }),
  },
});
