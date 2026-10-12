# Homepage consolidation — 3 October 2026

Fresh `git fetch origin` succeeded. The current branch is `\u200Bsahoo-academy-build` (leading U+200B, unchanged). Before this commit, HEAD and its remote-tracking branch both pointed to `a30bf2468a5a0d6f43488fe93a3a3a3787c9ae25` and contained only `1    index.html` and `README.md`. Main was not checked out or modified.

## Comparison and final homepage

The original 18,185-byte HTML is a standalone static landing page with inline CSS, placeholder navigation and Coming Soon mock cards. It has no JavaScript, authentication, Supabase connection or functioning test runner. Its exam, syllabus, mock-test and performance concepts already exist in the newer local application.

The local `index.html` is an entry point for the existing modular application: `app.js`, styles, logo, manifest, official Supabase client integration, catalog, authentication, private Admin, CBT, payments, entitlements and importer. Keeping only the older HTML would lose these capabilities. The final root `index.html` therefore retains the complete newer application's structure and dependency references. The incorrectly named old file is removed after comparison; no separate archive/version was created. The original remains recoverable from pre-existing Git history.

Exactly one root HTML homepage remains: `index.html`.

- Browser homepage title: `Sahoo ExamNexa | Competitive Exam Preparation`
- Homepage meta description: `Sahoo ExamNexa - Competitive Exam Preparation Platform for Odisha and All India Government Exams`
- No visible Sahoo Academy branding remains in public application files.
- Other routes retain their useful route-specific metadata.

## Edits made in this task

- `index.html`: requested title and description; all existing app hooks/assets preserved.
- `app.js`: retain exact homepage metadata after application rendering.
- `seo.mjs`, `server.mjs`: use the same exact metadata in the server-rendered homepage response.
- `README.md`: describe the sole homepage and current source-control state accurately.
- `tests/launch-branding-browser.mjs`: verify sole root homepage and exact metadata before/after rendering for `/`, `/index.html` and `/#/home`.
- `1    index.html`: removed from the working tree after the comparison above.
- This report: records comparison, checks and full final file list.

Other source files below were already present locally, mostly untracked; they are included unchanged in the commit so a checkout retains the newer site's functionality and build/test dependencies. No CSS, auth/Supabase/Telegram/payment logic, importer or question data was rewritten during consolidation.

## Validation

- 67 unit/backend test results passed, including actual local PostgreSQL migrations, RLS and isolated Edge checks.
- 46 browser scenarios passed: 20 general application, 6 launch-access, 14 isolated Supabase flow, 6 branding/homepage checks.
- Syntax checks passed for changed JavaScript modules.
- During the original homepage consolidation, source hash comparison limited pre-existing file edits to the six files listed above; only the incorrectly named HTML was removed.
- Public-file branding scan has no old-brand matches. Candidate commit scan found no matches for the checked private-key/token patterns; `.env`, private audits, dependency directories, screenshots and generated SDK bundle remain ignored.
- Private 332-question original/working files are unchanged and excluded from the commit. No content review/correction was repeated or applied.
- No live Supabase credentials, cloud setup, push, PR or deployment is part of this task. Existing real-backend setup requirements remain documented in `SUPABASE-SETUP.md`.

## Approved local commit cleanup

The ten historical documents/contracts identified in the read-only audit are not imported by runtime, build or tests. They are excluded from the amended commit and explicitly ignored; local copies are retained. Documentation-only references in the README and importer guide are updated. `backend.js` and `subscription-policy.mjs` remain because unit tests import them. All application, authentication, backend, database, importer, build and test code is unchanged by this cleanup.

Cleanup edits are limited to `.gitignore`, `README.md`, `architecture/IMPORTER-FORMATS.md` and this report. The local build and all 67 unit/backend checks plus 46 browser scenarios are rerun before amendment. The existing generated SDK bundle, private audits and test artifacts remain excluded.

The final tree contains **45 tracked files**. Relative to the original two-file parent, the amended commit adds 44 files, modifies the README and removes the incorrectly named homepage: **46 changed paths**. The existing commit is amended rather than followed by a second cleanup commit; its author identity is retained. No push, deployment or modification of main is authorized here.

## Final committed file list

The following list includes the pre-existing application files being tracked for the first time. Git records the old homepage deletion and the new modular homepage/source additions; it may not classify this substantial content change as a rename.

- `.env.example`
- `.gitignore`
- `HOMEPAGE-CONSOLIDATION.md`
- `README.md`
- `SUPABASE-SETUP.md`
- `app.js`
- `architecture/IMPORTER-FORMATS.md`
- `backend-ui.js`
- `backend.js`
- `commerce-views.js`
- `commerce.js`
- `data.js`
- `icon.svg`
- `import-core.js`
- `index.html`
- `launch-access.js`
- `launch-views.js`
- `management-views.js`
- `manifest.webmanifest`
- `package-lock.json`
- `package.json`
- `scripts/build-client.mjs`
- `scripts/html-import.mjs`
- `scripts/source-array-import.mjs`
- `seo.mjs`
- `server.mjs`
- `styles.css`
- `subscription-policy.mjs`
- `supabase-gateway.js`
- `supabase/config.toml`
- `supabase/functions/_shared/handler.mjs`
- `supabase/functions/academy-api/index.ts`
- `supabase/functions/telegram-webhook/index.ts`
- `supabase/migrations/202610020001_launch.sql`
- `supabase/migrations/202610020002_rate_limits.sql`
- `supabase/migrations/202610020003_promotion_and_telegram_scope.sql`
- `tests/browser.mjs`
- `tests/launch-access.test.mjs`
- `tests/launch-branding-browser.mjs`
- `tests/launch-browser-fixture.mjs`
- `tests/launch-browser.mjs`
- `tests/supabase-browser.mjs`
- `tests/supabase-db.test.mjs`
- `tests/supabase-edge.test.mjs`
- `tests/unit.test.mjs`
