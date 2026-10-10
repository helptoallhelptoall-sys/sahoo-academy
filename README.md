# Sahoo ExamNexa

Sahoo ExamNexa prepares students for Odisha competitive exams through **Topic-wise Mock Tests → Exam → Subject → Topic → Free/Premium Test**. The business model provides **three calendar months of subject access** covering included premium tests. Students do not buy individual HTML files. Disconnected preview prices are illustrative; connected mode uses only published database records.

`index.html` is the sole root homepage. The earlier malformed homepage remains in Git history. The current design, mock-test functionality, importers and Supabase integration are preserved. The Sahoo ExamNexa cloud schema and option-security migration are configured, and `academy-api` is deployed. Public launch still requires reviewed catalog content, Telegram configuration or an Admin OFF decision, payment setup and live Auth delivery checks; see the setup checklist below.

## Run locally

Use Node.js 22 or later (tested on Node 24):

```sh
npm ci
npm run build
npm run dev
```

Open [the local preview](http://127.0.0.1:4173). The server binds to `127.0.0.1` and serves an explicit public-file allowlist. The build bundles the official Supabase client. ES modules require HTTP rather than opening HTML directly. Stop with Ctrl+C; `PORT` selects another local port.

Useful routes: `/#/home`, `/#/subjects`, `/#/subject/geography`, `/#/tests`, `/#/purchase/geography`, `/#/orders`, `/#/support`, `/#/admin/html-imports`. Clean catalog routes such as `/subjects` and `/subject/geography` also work. Admin routes are private: unconfigured or unauthorized visitors see only a sign-in requirement.

## Current backend MVP

See [SUPABASE-SETUP.md](SUPABASE-SETUP.md) for the complete schema, required public variables and server secrets, exact dashboard setup, test limits and launch blockers. No credentials are invented. The disconnected preview stays blocked. With configuration, the official Supabase SDK restores real sessions and the Edge Function authorizes all protected operations.

The private Admin workspace manages catalog/pricing, one-file HTML imports and two verification passes, UPI claims, three-month entitlements, students and launch settings. Free flow: Register/Login → Telegram membership → test; YouTube stays voluntary. Questions and server-scored results come from protected endpoints.

The real 332-question source/working/audit files and existing importer are unchanged. Private source/working/audit files remain local and excluded from Git. See [SUPABASE-SETUP.md](SUPABASE-SETUP.md) for backend status, [the importer guide](architecture/IMPORTER-FORMATS.md) for supported formats, and [the consolidation report](HOMEPAGE-CONSOLIDATION.md) for the committed scope. Historical notes are retained locally but excluded from this launch commit.

Tests: npm test; npm run test:backend; npm run test:browser; npm run test:backend-browser. Browser suites use installed Edge and Playwright (or PLAYWRIGHT_MODULE). Fixtures are isolated test transport, never a frontend login bypass.

## GitHub Pages production build

The production URL is [Sahoo ExamNexa on GitHub Pages](https://helptoallhelptoall-sys.github.io/sahoo-academy/). The site uses hash navigation and a `/sahoo-academy/` base path. Local development continues at `/`.

Configure the repository **Actions variables** `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (both already configured). They are browser-safe values, not service-role secrets. `.github/workflows/pages.yml` runs only on `main`, uses `npm ci`, builds the official SDK plus a restricted artifact, and uploads only `dist/` through the official Pages actions. It never uploads the repository directory.

For a local production build, supply those two public environment variables plus `PUBLIC_SITE_URL=https://helptoallhelptoall-sys.github.io/sahoo-academy/`, then run:

```sh
npm run build:pages
npm run preview:pages
```

Open `http://127.0.0.1:4174/sahoo-academy/`. This checks the real static artifact, including its base path, CSP, SDK and generated public configuration. The cloud API allows the production origin only; isolated browser tests mock cloud transport rather than widening cloud CORS for local previews.

`dist/` and `supabase-vendor.js` are generated and ignored by Git. The artifact contains only 19 allowlisted browser files; server code, SQL, tests, dependencies, `.env`, parser scripts and private datasets are excluded. `404.html` preserves deep-link routing with Pages' native HTTP 404 status; normal hash routes return HTTP 200. No service worker caches private data.

Additional checks: `npm run test:pages`, then run `tests/static-browser.mjs` and `tests/supabase-browser.mjs` with `TEST_BASE_URL=http://127.0.0.1:4174/sahoo-academy/` and `PLAYWRIGHT_MODULE` if needed.

**Release step still required:** Pages currently uses legacy `main /` publishing. Change Settings → Pages → Source to **GitHub Actions before merging PR #1**, then approve the merge and monitor the workflow. Do not merge while legacy root publishing remains selected. This preparation does not merge the PR or deploy the website.
