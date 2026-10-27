# Charitology domain redirect

This isolated static project redirects `charitology.com` and `www.charitology.com` to `https://charitology.org/`. Vercel terminates HTTPS and applies a permanent 308 configuration redirect. Paths and query strings must survive the staged and public acceptance checks. A Vercel HTTP-to-HTTPS redirect may add one hop.

The target is the fixed `.org` origin. There is no application runtime, dependency installation, API, database, analytics script or environment secret. The public HTML is a fallback link; the edge redirect is the normal response. Vercel reserves `/.well-known` for platform behavior, so this project does not promise to redirect those paths.

## Verify

From the repository root:

```sh
node scripts/check-domain-redirect.mjs
node scripts/check-domain-redirect.mjs --deployment https://EXACT-DEPLOYMENT.vercel.app --cli /absolute/path/to/vercel/dist/vc.js
```

The second command uses the authenticated CLI's `vercel curl` to test six exact paths with both HEAD and GET. Link this service directory to the intended project first; keep the resulting `.vercel` and `.env` files ignored. It does not disable protection or follow redirects to another host with authentication headers. A local configuration pass alone is not proof of hosted routing or a valid certificate.

## Deploy and DNS

Use only the separate `charitology-redirect` project. Confirm its team, project and service directory before deploying. Keep preview protection enabled; custom domains must serve the redirect publicly. Do not change `charitology-os`, `charitology-mail` or their protection settings.

Deploy with an explicit `--environment preview` and check that exact temporary deployment before a production promotion or DNS cutover. CLI 65.2.0 assigned this project's first default deployment to its protected internal production alias; no custom domains or DNS were attached. Do not rely on the absence of `--prod` to guarantee the first deployment is a preview.

The explicit `/:path(.*)` matcher includes empty and trailing-slash paths. The initial `/:path*` matcher missed them in actual CLI Build Output and hosted tests. Keep root and trailing-slash acceptance cases when changing this configuration.

Read exact project-specific recommendations before attaching domains with `GET /v6/domains/{domain}/config?projectIdOrName=charitology-redirect`. After authorization, attach only the two `.com` names, then inspect again for any required ownership TXT. Do not register, transfer or purchase a domain or plan.

Take a private complete DNS snapshot first. In the Namecheap `.com` zone, replace only the `@` and `www` URL301 records with the inspected apex A and `www` CNAME. Preserve Custom MX mode and both `send` records: MX priority 10 to `feedback-smtp.us-east-1.amazonses.com.` and TXT `v=spf1 include:amazonses.com ~all`. Leave Namecheap nameservers and the entire `.org` zone unchanged.

After DNS propagation, verify authoritative DNS and two public resolvers; valid TLS on both `.com` names; HTTP and HTTPS root, nested path, encoded path and query redirects; `.org` HTTPS; mail/OS health; and unchanged receiving/sending mail records. Check fixed `.org` locations and no authentication page. Vercel automatically manages certificates after DNS validation.

Rollback restores only the prior two URL301 records and removes their replacement hosting records, preserving every mail record and mode. That restores the former HTTP-only behavior; it does not restore HTTPS service.

## Cost and evidence

Do not change a subscription, add seats or enable paid add-ons for this project. Its resource use still contributes to the account's normal usage; the static design does not guarantee zero usage charges.

The October 27, 2026 cutover uses production deployment `dpl_Dhi7bKim29qUQAFoKb2ttHcesZAe`. Promotion of the reviewed preview rebuilt it as a production deployment; the production alias passed all 12 authenticated requests before DNS changed. The public check then passed 48 HEAD/GET requests across both names and schemes, eight redirect chains ending at `.org` HTTP 200 within two hops, 33 authoritative/public DNS comparisons, seven trusted certificate/SNI checks across observed addresses, and three site/mail/OS health checks. The complete `.org` managed zone and both `.com` sending records matched their pre-cutover snapshots.

Those public HTTP checks used Cloudflare DNS-over-HTTPS with normal certificate verification. This Mac's system resolver still retained the former forwarding IP at the final check. That local cache may continue showing the old behavior until it expires; this does not establish that every resolver has refreshed. Certificates are automatically renewed, so the certificate observed during acceptance is not a permanent expiry guarantee.

Sources: [Vercel configuration redirects](https://vercel.com/docs/routing/redirects/configuration-redirects), [automatic certificates](https://vercel.com/docs/domains/working-with-ssl), [project limits](https://vercel.com/docs/limits), [Pro billing](https://vercel.com/docs/plans/pro-plan), [Namecheap URL forwarding](https://www.namecheap.com/support/knowledgebase/article.aspx/385/2237/how-to-set-up-a-url-redirect-for-a-domain/).
