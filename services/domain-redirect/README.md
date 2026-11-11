# Charitology website domain operations

GitHub Pages builds and publishes the site from `main`. The custom Pages origin is `publish.charitology.com`. This configuration lets the existing `charitology-redirect` Vercel project serve that build on `charitology.com`. Normal requests to `charitology.org` and either `www` host receive a permanent redirect with their original path and query. Vercel manages the public certificates. GitHub manages the origin certificate.

A reader who opens a page on the .org apex with `?legacy=1` can use its export controls in the original browser profile. A one-hour preference cookie lets navigation and assets load on that origin during the export. The [browser data guide](https://charitology.com/browser-data/) explains how to import at the new address.

## Deploy and verify

Keep building the public site through GitHub. Routine content changes flow from Pages to the public site. Use the isolated Vercel project only for changes to this routing configuration. Link this service directory to the project with the authenticated Vercel CLI. Use a protected preview and verify the origin before promoting. The Vercel project serves the existing GitHub Pages content through a fixed external rewrite.

```sh
node scripts/check-domain-redirect.mjs
```

After a routing change, verify both canonical metadata and visible content on .com, normal redirects on all three aliases, the legacy link, a missing page, feeds, social assets and a data-backed lookup. Verify that the mail service accepts both web origins and that the Charity OS domain is healthy. Do not send signup mail as part of the check.

Namecheap hosts the authoritative zones. Only the apex, `www`, and Pages origin records support website routing. The .org zone uses email forwarding and the .com zone contains sending records for the newsletter. Preserve mail mode and mail-related records. Keep the previous working static deployment available during an origin change so Vercel can serve it while Pages obtains its certificate.

Sources: [GitHub Pages custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [Vercel external rewrites](https://vercel.com/docs/routing/rewrites), [Vercel certificate staging](https://vercel.com/docs/domains/pre-generating-ssl-certs).
