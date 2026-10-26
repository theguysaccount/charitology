// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config';

// SITE_URL and BASE_PATH are set by the deploy workflow from GitHub Pages
// (https://<owner>.github.io + /charitology, or the custom domain + /).
const site = process.env.SITE_URL || 'https://charitology.org';
const base = process.env.BASE_PATH || '/';
const prefix = base.replace(/\/$/, '');

/**
 * Markdown links are written root-relative ("/diagnosis/symptom-trap/") so
 * content never has to know where the site is deployed. This prefixes them
 * with the base path and marks external links.
 */
function rehypeLinks() {
  /** @param {any} tree */
  return (tree) => {
    /** @param {any} node */
    const walk = (node) => {
      if (node.type === 'element' && node.tagName === 'a') {
        const href = node.properties?.href;
        if (typeof href === 'string') {
          if (prefix && href.startsWith('/') && !href.startsWith('//') && !href.startsWith(`${prefix}/`)) {
            node.properties.href = prefix + href;
          } else if (/^https?:\/\//.test(href)) {
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
  image: { service: passthroughImageService() },
  devToolbar: { enabled: false },
  markdown: {
    rehypePlugins: [rehypeLinks],
    smartypants: true,
  },
});
