# Priority #4: staged root-site cutover — not deployed

Target: `https://sahooexamnexa.github.io/`

Destination: `sahooexamnexa/sahooexamnexa.github.io` (new public, empty repository).
Its two browser-safe Supabase repository variables have been copied and verified
by name. No code, secrets, Pages configuration or deployment has been added there.
Keep `helptoallhelptoall-sys/sahoo-academy`, its history and live Pages site intact.
No account rename, repository transfer, database migration, or new Supabase project.

## Development

Branch `codex/root-pages-seo` starts at production
`68bed1d32182917fdf8554b349c6625437b75a9e`.
Pages derives `PUBLIC_SITE_URL` from `actions/configure-pages`; the same build
supports `/sahoo-academy/` and `/`. Assets, manifest and Auth callbacks resolve
relative to this base. Build with the existing public Supabase URL/publishable key
and `PUBLIC_SITE_URL=https://sahooexamnexa.github.io/`. Only allowlisted files
and generated public files enter `dist/`; never upload the repository root.

Run `npm run test:pages`, all unit/backend/browser suites and artifact checks at
both bases. `tests/seo-browser.mjs` checks metadata, no-JavaScript content,
robots, sitemap, CSP and private-route indexing rules. The sitemap lists only
the real static homepage. Hash views are not separate crawlable documents.
Add future public HTML pages explicitly; never generate SEO from demo data,
private questions, draft catalog records, student dashboards or results.
Robots/noindex are indexing hints, not security: server authorization stays intact.

## Release steps — require later owner approval

1. Record fresh Git/deployment and production data/config fingerprints.
2. In the NEW repository only, disable Actions while seeding the reviewed Git
   commit and history as `main` with an explicit normal push. Do not mirror-push,
   force-push, transfer or delete branches. Confirm the resulting tree/history.
3. Recheck the already configured `PUBLIC_SUPABASE_URL` and
   `PUBLIC_SUPABASE_PUBLISHABLE_KEY` repository variables. Leave
   `PUBLIC_REDIRECT_TARGET` unset on the new repository. No
   secrets in Git. Configure Pages Source = GitHub Actions and enable Actions
   only for the approved deployment. The existing workflow uses `npm ci`, builds
   the official SDK, and uploads only `dist/` with minimal permissions.
4. Prepare the SAME Supabase project `dtacpfeemvmdzzgwqscj` through trusted settings:
   - Add exact Auth redirects `https://sahooexamnexa.github.io/` and
     `https://sahooexamnexa.github.io/reset-password.html`.
   - Retain `https://helptoallhelptoall-sys.github.io/sahoo-academy/` and
     `https://helptoallhelptoall-sys.github.io/sahoo-academy/reset-password.html`.
   - Set server-only `ALLOWED_ORIGINS` to exactly
     `https://helptoallhelptoall-sys.github.io,https://sahooexamnexa.github.io`.
   - No wildcard/localhost, role/entitlement, Telegram/payment or other secret changes.
   - Keep old Auth Site URL until the new pages work; then set Site URL to
     `https://sahooexamnexa.github.io/`. Verify new confirmation/recovery emails.
   - App OAuth providers are currently disabled. Dashboard OAuth is separate.
     Reinspect if providers have been enabled since preflight.
5. Deploy the reviewed Pages artifact in the NEW repository. Verify matching SHA,
   root assets, Auth/Admin, hierarchy, imports, reorder/delete, shuffle, scoring,
   timers, resume/review and mobile/desktop. Verify both production origins are
   allowed and localhost/unrelated origins are denied. No content recreation.
6. Only AFTER new-site acceptance, optionally deploy the OLD repository with
   `PUBLIC_REDIRECT_TARGET=https://sahooexamnexa.github.io/`. The build accepts
   only that exact source/target pair. This is a client-side redirect plus
   canonical, not a server HTTP 301 (Pages does not provide that configuration).
   Only unauthenticated public root/hash navigation without queries redirects.
   Auth callbacks, reset-password, session-bearing browsers, private routes,
   attempts and non-root deep links keep using the working old app. No auth
   parameters or session storage transfer. Users sign in again on the new origin.
   Keep old callbacks/app available for outstanding email links and sessions.
7. Verify no loops or callback forwarding. Rollback: unset the old redirect
   variable and deploy its prior reviewed artifact; restore old Auth Site URL
   if needed. Retain both exact origins during rollback. No database rollback.
8. Once the new URL works, the owner signs into Google Search Console privately.
   Add URL-prefix property `https://sahooexamnexa.github.io/`. Add Google's exact
   verification tag/file through a reviewed allowlist change; never guess it.
   Verify, submit `/sitemap.xml`, inspect the homepage and request indexing.
   Indexing/rankings are not guaranteed. No Search Console action during development.

## Current boundary

Development validation (19 October 2026): 171 automated tests; 191 browser
scenarios across source/root/legacy-subpath and rollout fixtures; root/subpath
artifact and SEO smoke checks; 58 JavaScript syntax checks; manifest, allowlist
and whitespace checks passed. All browser Auth/API/database tests used isolated
fixtures. No production content or settings were written by these tests.

This branch prepares the build/SEO and optional redirect. It does NOT change
production Auth Site URL, redirects, CORS, Pages, Google settings or data.
No Edge Function code deployment or database migration is required: the existing
handler already supports explicit allowed origins. The new repository stays
empty/undeployed until release approval. Existing production remains authoritative.
