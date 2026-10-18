# Sahoo ExamNexa — minimum Supabase launch setup

Status checked on 5 October 2026: the **Sahoo ExamNexa** project (`dtacpfeemvmdzzgwqscj`) exists, the schema and `202610040001_safe_attempt_options.sql` security migration are applied, and `academy-api` is deployed. Both GitHub public configuration variables are set. Production-origin CORS and anonymous Admin denial have been verified. The website has **not** been deployed by this production-build task.

Current content state (11 October 2026): the catalog contains the published 41-question FREE Solar System practice test, with a 41-minute timer and +1/0 scoring. One intended confirmed Admin was provisioned previously. Telegram is OFF for launch and paid sales remain disabled while UPI/payee/QR are unconfigured. This feature run does not change those records. The new Questions migration and permanent recovery callback are pending release steps described below; do not treat the locally tested features as already deployed.

## What is implemented

- Official Supabase JavaScript SDK: email registration, confirmation-required state, login, global logout, persistent/refreshable sessions, remotely confirmed user, profile and database-owned Admin role.
- Private Admin workspace: exams, subjects/pricing, topics, tests, one-file HTML imports, structural findings, explicit content-pass approval, payment approval/rejection, access grants/extensions/revocation, student directory and launch settings. No public Admin demo or role-selection input.
- Database-backed student journey: Topic-wise Mock Tests → Exam → Subject → Topic → Free/Premium Test. Configured mode uses published database records, not illustrative preview prices.
- Server-priced UPI orders with term snapshots, unique UTR claims, pending review, atomic Admin approval and three-calendar-month initial access. Active renewals add the purchased term to existing expiry. Expired/revoked access cannot fetch premium questions or detailed answer reviews.
- Server-side Telegram linking using a random, hashed, ten-minute, one-use bot nonce; secret-authenticated webhook; fresh Bot API membership check at every free start. YouTube remains voluntary promotion only. A cached membership flag never authorizes a later attempt.
- Authorized question delivery without answer keys, explanations or imported option metadata; options expose only `id` and `text`. Immutable per-attempt snapshots, server deadline, saved answers, server scoring and owner-only results remain in use with the existing CBT navigation, flags, timer, analysis and review.
- Reusable private HTML import uses the existing two non-executing adapters. The exact declared count is mandatory. Raw HTML, source hash, original and normalized working records, all issues and review evidence remain private. Only 🟢 is removed from question text. Imports cannot overwrite an existing test bank. Invalid records are retained for review, never partially installed or silently repaired. Publication requires both passes.

## 1. Create a Supabase Free project

**Existing project: do not rerun the four baseline migrations listed below.** Cloud function/schema inspection and post-security-migration checks were completed. This project has no `supabase_migrations.schema_migrations` history table, so a CLI history gap does not mean migrations are missing. Do not run `supabase db push` or create history records blindly. The following sequence is for a new empty project only.

1. Create a new project in your Supabase account; choose an appropriate nearby region and save its database password in your password manager. No paid Supabase feature is required by this code; monitor Free-tier database, Auth, storage and Edge usage in the dashboard.
2. Keep the Data API enabled for `public`. Run `supabase/migrations/202610020001_launch.sql`, then `202610020002_rate_limits.sql`, then `202610020003_promotion_and_telegram_scope.sql`, then `202610040001_safe_attempt_options.sql`, once each, in order, using SQL Editor or your migration workflow. If earlier migrations were already applied, apply only the missing migration. The final security migration restricts pre-submission options to `id` and `text`, including existing attempt snapshots; it does not rewrite stored question/import data. These migrations create the schema and privileges; do not run them against an unrelated existing database. Do not disable RLS or add broad browser grants to make an error disappear.
3. The tables are `profiles`, `exams`, `subjects`, `topics`, `tests`, `questions`, `imports`, `entitlements`, `payment_submissions`, `telegram_verifications`, `attempts`, `admin_settings`, `admin_audit` and `api_rate_limits`. Questions/imports/attempt snapshots have no browser read grants. Own-profile/payment/access reads use RLS. All writes run through the service-only RPC behind verified Edge authentication.
4. Public catalog tables contain metadata only. There is deliberately no premium question seed and the 332-question bank has **not** been uploaded or published.

## 2. Configure Supabase Auth

1. Enable Email/password signup and **keep Confirm email ON**. Disable anonymous signup. Set a minimum password length of at least 12 and configure appropriate Auth rate limits.
2. Site URL and the exact production redirect are already `https://helptoallhelptoall-sys.github.io/sahoo-academy/`. Preserve the project path and trailing slash. The SDK now builds its confirmation redirect from the document base. Add `http://127.0.0.1:4173/` only if deliberately testing real local authentication; no wildcard redirects are needed. The current local test suites isolate Auth traffic and send no emails.
3. Configure custom SMTP and verify the sender domain before real student registration. Supabase's default SMTP is for restricted testing, not public student email delivery. Keep SMTP credentials only in the dashboard. See [Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).
4. Register and confirm your own Admin email through Supabase Auth. Copy its **Auth user UUID** and run this once in SQL Editor, replacing the placeholder:

   ```sql
   update public.profiles set role = 'admin'
   where id = '<YOUR_CONFIRMED_AUTH_USER_UUID>'::uuid;
   ```

   Never derive Admin from user-editable metadata or email text. Students cannot update the role through the API. There is no public create-Admin action.
5. The permanent Forgot Password UI uses Supabase Auth recovery and `reset-password.html`; complete the callback setup below before launch. CAPTCHA is not wired in this run; do not turn on a required Auth CAPTCHA until its client token integration is added. Keep Auth rate limits enabled. Set a short reasonable JWT expiry and remember that SDK logout revokes refresh sessions; an already issued JWT can remain valid until its expiry.

## 3. Public configuration and build

Use Node.js 22 or later (tested with Node 24). Install pinned dependencies with `npm ci`. `npm run build` produces the SDK for local development. `npm run build:pages` builds the SDK directly into the restricted `dist/` artifact, generates browser-safe `public-config.json`, sets the production base path and CSP, and copies only the browser allowlist. It needs the two public variables below plus `PUBLIC_SITE_URL`. Actions derives that site URL from `actions/configure-pages`; do not bake a key into source files.

Copy `.env.example` to ignored `.env` locally and fill **only** these public fields:

| Variable | Value | Exposure |
| --- | --- | --- |
| `PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Public |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project's `sb_publishable_…` key | Public; authorization still depends on JWT/RLS |

The current adapter intentionally accepts the new publishable key format, not a secret or legacy JWT key. The local server exposes only those two fields at `/public-config.json`; the production build writes them to `/sahoo-academy/public-config.json`. They are already configured as GitHub Actions repository variables. Restart `npm run dev` after changing local configuration. A missing/invalid configuration keeps the disconnected preview; a production build refuses to run without valid public configuration. The original six demonstration questions remain public; configured attempts use protected server delivery exclusively.

See [Supabase API key guidance](https://supabase.com/docs/guides/getting-started/api-keys). Never put service keys into public configuration to make authentication work.

## 4. Edge Functions and secret configuration

The code is in `supabase/functions/academy-api` and `supabase/functions/telegram-webhook`. The supplied `supabase/config.toml` disables the platform JWT gate because `academy-api` validates Bearer tokens through `auth.getUser` itself and allows two public catalog/policy actions. The webhook uses its secret header. **Do not remove these application-level checks.**

`academy-api` was deployed through the Dashboard during this production preparation. Its three local module imports were resolved using immutable raw GitHub URLs pinned to build `cda78c230c8d9340fb7bba1d11d507bd49f933e9`; the entrypoint otherwise matches this repository. The backend files have not changed in this build. Future deployments should use the repository and its full dependency graph with the Supabase CLI. Do not deploy `telegram-webhook` until its required secrets, bot and channel setup exist.

Verified diagnostics: public catalog/policy return 200, anonymous Admin calls return 401, production-origin preflight returns 204, and an untrusted origin returns 403. These checks do not create students, attempts or payment records. The platform legacy-JWT gate is OFF as required by `supabase/config.toml`; protected actions still enforce real `auth.getUser` authentication and database-owned roles.

Set these values in **Supabase Edge Function secrets**, not frontend files:

| Variable | Required value | Visibility |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase injects the project's URL | Public value, server runtime copy |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase-injected server service-role key | **Secret; bypasses RLS** |
| `ALLOWED_ORIGINS` | Configured: `https://helptoallhelptoall-sys.github.io` (origin only, no project path). Local origins remain disallowed. | Nonsecret configuration |
| `TELEGRAM_BOT_TOKEN` | BotFather bot token | **Secret** |
| `TELEGRAM_BOT_USERNAME` | Bot username without `@` | Public value, server configuration |
| `TELEGRAM_WEBHOOK_SECRET` | Strong random secret of Telegram-supported characters | **Secret** |

Database passwords, SMTP passwords, Supabase personal access tokens and signing secrets also stay out of Git and all public bundles. Auth session tokens are handled only by the official SDK and TLS transport. This browser SDK uses persistent browser storage for sessions; CSP and escaping are essential. It does not store a plaintext password or a local “isAdmin” permission.

## 5. Telegram

Telegram is **optional by Admin policy**, but is currently ON in this cloud project. Before public free tests can work, either complete the steps below or explicitly turn the requirement OFF in private Admin launch settings. No code rebuild is needed; student authentication remains required and premium access is unaffected. This task does not silently disable the requirement.

1. Create the bot with BotFather. Add it as an **administrator** of the intended channel/group. The handler checks this, because membership lookup for other users is reliable only with the necessary bot privileges.
2. Configure the token, username and webhook secret above. The numeric channel ID is now an Admin-managed database setting, not an Edge environment variable.
3. Register the Bot API `setWebhook` URL `https://<project-ref>.supabase.co/functions/v1/telegram-webhook`, supplying the same `secret_token` and `allowed_updates: ["message"]`. Use a trusted local/admin tool; never put the bot token in a browser URL, frontend file, report or Git commit.
4. Admin → Launch settings: enter the numeric channel ID (normally `-100…`) and matching Telegram join URL. Choose requirement ON/OFF and All free mocks or Selected free mocks. For selected mode, enable the Telegram field on each applicable FREE test. Paid access always ignores Telegram. Channel ID stays private; changing the join link alone does not change the checked channel. Changing the channel or scope invalidates in-flight verification evidence.
5. Students use Connect Telegram, open the generated `https://t.me/<BOT_USERNAME>?start=<one-time-nonce>` link and press Start, then return to the site and Verify Membership. A successful fresh check starts the mock. Every later attempt checks membership again. Test unlinked, member, left, banned and unavailable states. This uses the official bot deep-link/webhook account-linking flow, not a browser checkbox or a Telegram OAuth redirect. No additional Telegram login redirect is needed.
6. Admin → Launch settings also controls YouTube channel name, channel URL, CTA text and Free Study Videos/playlist URL. YouTube is prominent voluntary promotion and bell status is only a recommendation. No Google project, Google credentials, OAuth redirect, subscription check or bell check is required.

References: [Telegram getChatMember](https://core.telegram.org/bots/api#getchatmember), [Telegram setWebhook](https://core.telegram.org/bots/api#setwebhook), [Supabase Edge secrets](https://supabase.com/docs/guides/functions/secrets).

## 6. Catalog, payment QR and verified content

1. Sign in as Admin. Create exams, subjects and topics with stable IDs. Subjects default to three months; enter prices in integer **paise**, and associate exam IDs explicitly.
2. Create draft tests with FREE/PREMIUM status and duration in seconds. Catalog visibility is separate from entitlement.
3. Create a public Storage bucket named `payment-assets` for the **UPI QR image only**. Upload the QR through the authorized Supabase dashboard. Give browser roles no upload/update/delete policies. The QR is public payment information, not a secret; no source HTML or questions go in this bucket.
4. Enter the payee name, UPI ID and that project's HTTPS public QR URL in Admin → Launch settings. Purchases remain unavailable while any of these are missing. Confirm the QR encodes the same destination. Admin must check the received amount and UTR independently against bank/UPI records before approving. A submitted UTR is never proof of payment.
5. Import one supported HTML file (UI limit 1 MB) into an empty draft test with its exact count. Review the saved structural report and **every question** in the content review. Content approval is an explicit Admin attestation, not an automatic fact checker. Neither pass rewrites the source. Unknown formats and count discrepancies are rejected.
6. An import with structural blockers stays private and cannot publish. This MVP does not edit/replace an imported bank; use the existing offline correction/audit workflow to prepare a separately reviewed draft rather than silently changing records. For the existing 332-question bank, keep the approved working revision and unresolved 86 review / 278 editorial findings intact. Do not import its original uncorrected HTML and assume the 19 approved fixes are present. Upload/publication of that bank needs a deliberate reviewed source/working-copy decision; nothing here changes or uploads it.
7. Publish a test only after both passes are recorded and final content is approved. Admin can later hide tests, change free/premium status, subject price and term, toggle Telegram, and grant/revoke/extend access. The initial three-month rule remains unchanged unless Admin explicitly changes a subject term.

## 7. Before accepting real students or money

- Preserve the already verified schema/security migration. Complete real authenticated owner-vs-other-student and student-vs-Admin checks against the deployed API before opening registration broadly. Isolated PostgreSQL/browser suites pass, but do not prove email delivery or every live account configuration.
- Exercise registration email delivery, confirmation redirect, login, reload, logout and account recovery with non-team student addresses.
- Test real Telegram linking, membership loss, bot permissions and outages. No bot token has been available for this local run.
- Make one controlled payment claim and manually reconcile it; confirm approval, rejection, duplicate UTR rejection, expiry, renewal and revocation. No real payment was submitted or verified here.
- Test protected questions, saved answers, server timeout and post-submission review in the actual Edge runtime. Keep an active test page open; this MVP can finalize saved answers after refresh but does not restore an interrupted CBT at the same question. Abandoned attempts are finalized on the student's next request, not by a background scheduler.
- Review actual exam mappings, prices, source rights/content findings and student-facing privacy/payment/support text. The disconnected catalog remains illustrative.
- Before merging PR #1, change GitHub Settings → Pages → Source from legacy `main /` publishing to **GitHub Actions**. Then authorize the merge and check the main-only workflow. It uploads only `dist/`, including the SDK and generated public config; never select repository-root publishing. The current task does not change Pages source, merge, or deploy the website. Static artifact tests use the real `/sahoo-academy/` path with isolated cloud responses. The local development server still blocks indexing.
- Admin lists are capped at 500 records for this MVP; pagination is intentionally deferred. Monitor database growth from immutable question snapshots/import originals. No analytics, AI, reviews, bulk import or coupons were added.

Until the credentials, real-project checks, content/payment setup and authorized hosting step are complete, this is **not ready to accept real payments**.

## Pending release: permanent recovery and manual Questions (11 October 2026)

These feature changes are validated locally only. **Do not apply the migration or redeploy Edge Functions as part of the code-only test run.** Existing published content, Auth roles, Telegram OFF and disabled sales stay unchanged.

After separate release approval:

1. Inspect and apply only `supabase/migrations/202610110001_manual_questions.sql` to the verified project. It creates private RLS-protected `manual_test_reviews` and a service-only RPC wrapper. No existing question/import/attempt rows are migrated or rewritten. Do not rerun older migrations or use an unverified `db push`.
2. Update only the existing `academy-api` function from this build so its action allowlist accepts Questions operations. Retain production-only `ALLOWED_ORIGINS`; do not enable localhost.
3. Add the exact Auth redirect URL `https://helptoallhelptoall-sys.github.io/sahoo-academy/reset-password.html`. Keep the production Site URL and existing production confirmation redirect. No wildcard/local recovery callback is needed. The permanent page must be deployed before sending users recovery emails with this redirect.
4. Merge/deploy the website only after approval, then perform one owner-controlled recovery/email check. The owner types passwords privately. Isolated tests verify the official SDK calls, but do not establish live email delivery or cloud callback configuration.

Recovery uses `resetPasswordForEmail`, an isolated sessionStorage-backed implicit recovery session, server-verified `getUser`, and authenticated `updateUser({password})`. It never changes account roles or creates a user. Callback parameters are scrubbed; failed/expired links fail closed. After updating, global sign-out is requested and local recovery state is cleared. A server sign-out outage is reported honestly; already-issued access JWTs can remain valid until expiry. No service-role key is used in the browser.

Private Admin → Questions is separate from HTML Imports. Choose an existing draft test to inherit its Subject/Topic/Exam placement. Save enforces four distinct non-empty options, one answer, an explanation and valid tags. Published tests are read-only. Manual tests require explicit content review of the current revision before Tests → Publish. Editing a structurally valid HTML draft preserves original HTML/canonical records/count and invalidates its content review; the HTML Imports review must reload the edited revision before approving. Invalid original imports remain in their existing offline correction workflow. No question deletion is offered. Private before/after changes are recorded in `admin_audit`; no canonical data enters the static artifact.

Run `npm run test:backend`, `npm run test:backend-browser`, `npm run test:recovery` and `npm run test:pages`. Browser scripts support `TEST_BASE_URL`; recovery and static artifact tests default to `http://127.0.0.1:4174/sahoo-academy/`. Use isolated Auth responses only until the permanent production page is live. Disposable fixtures are destroyed when the in-memory PostgreSQL database closes.

## Pending scoring/timer release — do not apply during development

After separate release approval, verify migrations through `202610150001_admin_order_delete.sql` are present. Apply only the complete `202610170001_scoring_auto_timer.sql` transaction once. Do not rerun older migrations or use blind `db push`. This corrected, unapplied migration installs compatibility fields with **activation OFF**. Existing tests retain Manual durations, and existing attempts retain deadlines, snapshots, scoring version 1 and historical result JSON. There is no content rewrite. DDL/backfill takes brief locks; use a quiet release window.

Staged activation (not executed during development):

1. Apply the migration with `attempt_policy_v2_enabled=false`. Old and new clients can continue legacy starts, submissions and Manual saves. The new app sends the old `duration_seconds` field until activation, so deploying it before the database is also safe.
2. Deploy this branch's `academy-api` and Pages artifact. The Edge change is required: it forwards client compatibility/version expectations on free and premium starts, advertises transport version 2, and gives an HTTP 409 refresh response for stale policy clients. Preserve CORS, secrets and all existing auth controls.
3. Verify the public policy response has `attemptPolicySchema:2`, `attemptPolicyTransport:2`, `attemptPolicyActive:false`. Smoke-test legacy scoring, saved results, existing attempt resume/deadline, and Manual create/edit. Verify the new Pages build is serving and the old/new compatibility tests pass.
4. Only after these checks and explicit owner activation approval, use the trusted SQL Editor/operator connection (never browser/service credentials in frontend) to run:

```sql
begin;
update public.admin_settings
set attempt_policy_v2_enabled=true, version=version+1
where id=true and attempt_policy_v2_enabled=false
returning attempt_policy_v2_enabled, version;
commit;
```

5. Confirm all three policy fields now advertise readiness/activation. Verify one controlled new attempt (+1/−0.25/0 and decimal result), both timer modes, and legacy resume/results. **No existing test switches to Automatic**: changing an existing test remains a separate deliberate Admin action. New tests default Automatic only through the active compatible API; legacy/direct-write defaults stay Manual.

The flag is server-owned: browser roles cannot update it, and ordinary Admin settings payloads cannot activate it. The database checks client protocol support on policy-2 starts/resumes/saves/submissions/reviews, including after the flag is turned OFF again. A stale old tab must refresh to start a new policy-2 attempt or review one; it may show its older generic access error but cannot display a wrong score. Legacy attempts can still finish with +1/0. A policy change between displayed instructions and a fresh start rejects that start without inserting an attempt; refresh the instructions and retry. Old timer writes are accepted before activation and rejected after activation rather than overwriting Automatic settings. New fallback timer saves cannot silently turn an existing Automatic test into Manual.

Rollback: turning the flag OFF stops policy-2 **new** attempts; it does not recompute existing scores, deadlines or test durations, or change saved timer modes. Keep the compatible app/Edge/SQL for all already-created policy-2 attempts. Do not roll back to the old app after activation, remove version columns, or replace scoring functions blindly. Prefer a reviewed forward repair. To change existing Automatic tests back to Manual, use the compatible Admin controls deliberately before disabling activation. No migration history repair is needed.
