# Sahoo ExamNexa

Local frontend for Odisha competitive-exam preparation centered on **Topic-wise Mock Tests → Exam → Subject → Topic → Free/Premium Test**. Topic-wise Mock Tests is the primary entry point. The business model provides **three calendar months of subject access** covering included premium tests. Students do not buy individual HTML files. Prices and premium catalog entries are illustrative.

This continues the existing project: `index.html` is the sole root homepage. The earlier static `1    index.html` was compared with the newer application and removed from the working tree during homepage consolidation; its original contents remain in Git history. The newer design, JavaScript, CSS and Supabase integration are preserved. The repository, local project folder and existing build branch retain their names. The minimum Supabase backend is implemented locally; no cloud project is configured or deployed.

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

Do not serve the repository root as a public document directory. Use the explicit public-file allowlist and keep .env, SQL, parser scripts and private-audits private. Homepage consolidation is committed only to the existing build branch. No push, PR or deployment is part of this change.
