# Anti-framing deployment runbook

The application must not be considered protected from clickjacking until its
public HTML response sends both of these HTTP response headers:

```http
Content-Security-Policy: ...; frame-ancestors 'none'
X-Frame-Options: DENY
```

The CSP directive must occur exactly once with only the `'none'` source. A CSP
`<meta>` element cannot enforce `frame-ancestors`, and the early runtime guard
in `src/main.tsx` is defense in depth rather than a substitute for an HTTP
boundary.

## Current production blocker

Production is currently deployed through `actions/deploy-pages` to GitHub Pages.
As verified on 14 August 2026, the live response from
`https://alkwer.github.io/one-more-map.github.io/` was served by `GitHub.com`
without either required anti-framing header. The repository has no custom domain,
header-capable hosting project, provider credentials, or deployment environment
for an alternative host. GitHub Pages does not provide repository-controlled
custom response headers; see the
[GitHub Pages custom-header discussion](https://github.com/orgs/community/discussions/54257).

This repository now emits a deployment-root `_headers` file and provides tests
and a live checker. GitHub Pages ignores `_headers`, so those preparations do not
resolve the production finding by themselves.

## Provision a header-capable deployment

The repository owner must first authorize a static host that applies headers at
the edge. For example, Cloudflare Pages supports a deployment-root `_headers`
file as documented in [Cloudflare Pages headers](https://developers.cloudflare.com/pages/configuration/headers/).
Configure that provider with:

- build command: `npm ci && npm run build:pages`
- output directory: `staging`
- Node.js version: 24

The build copies `_headers` to the root of `staging`; its second copy under
`allflame-voyage-solver/` is only part of the nested app artifact. Do not select
the nested directory as the provider output root. A provider-owned domain such
as `pages.dev` avoids a DNS change but changes the public application URL. A
stable existing URL requires control of its DNS and an intentional cutover.

The border-intake endpoint is also deployment-scoped. A replacement GitHub
Actions deployment must preserve the canonical repository/ref checks and the
`BORDER_ROLL_INTAKE_URL` build setting from the existing workflow. A direct
provider build without that context intentionally ships with automatic intake
unconfigured. Before promotion, verify the contribution panel and follow the
[intake deployment operations](border-roll-data.md#intake-deployment-operations)
instead of weakening those checks.

Do not add a provider token to the repository. Store the minimum-scope credential
as a protected GitHub environment secret, restrict the production environment to
`main`, and require an approval if the provider cannot promote an already-tested
immutable preview.

## Preview, verify, and promote

1. Deploy the exact `staging` artifact to an immutable provider preview.
2. Run the live header check against its HTTPS app URL:

   ```bash
   npm run check:production-headers -- https://preview.example/allflame-voyage-solver/
   ```

3. Run `e2e/frame-guard.spec.ts` against that preview from a different origin,
   or repeat its external-origin iframe scenario in the provider's browser test
   job. The iframe must be refused by the browser; rendering the runtime warning
   is not sufficient.
4. Only after both checks pass, promote that immutable deployment to the
   production URL.
5. Run the header checker again against the final public URL, including after any
   CDN cache purge or redirect change. Record the successful workflow URL in the
   release evidence.

`.github/workflows/production-security-headers.yml` can be run manually or
called by a future provider deployment workflow. A provider workflow must call
it for the immutable preview before its promotion job; running it only after a
production deploy detects an exposure but is not a deployment gate.

## Cutover and rollback

Before cutover, retain the last known-good provider deployment and record its
immutable identifier. If the final production check fails, route traffic back to
that deployment, purge the affected CDN entries, and rerun the checker. Do not
roll back to the unprotected GitHub Pages origin.

After a successful cutover, disable the old GitHub Pages deployment or replace it
with an HTTP redirect served by a header-capable edge. Leaving the old URL online
would leave a frameable copy of the application. Verify both the canonical URL
and every legacy URL that still serves application HTML.

## User-intent safeguards to preserve

Anti-framing is one layer of the interaction boundary. Hosting changes must also
preserve these explicit confirmations:

| Action                              | Required safeguard                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Replace saved state during recovery | Native `window.confirm` before replacement                                                                 |
| Clear all imported data             | Native `window.confirm` before deletion                                                                    |
| Finish a Voyage                     | Confirmation modal; cancelling leaves the Voyage active                                                    |
| Submit research data                | Automatic submission remains off by default; manual and key-backed submission require explicit user action |

The normal top-level application, storage, imports, exports, and confirmation
flows must continue to work after the host migration. Keep the early runtime
frame guard as defense in depth.
