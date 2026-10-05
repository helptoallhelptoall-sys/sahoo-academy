# Sahoo ExamNexa — minimum Supabase launch setup

Status checked on 5 October 2026: the **Sahoo ExamNexa** project (`dtacpfeemvmdzzgwqscj`) exists, the schema and `202610040001_safe_attempt_options.sql` security migration are applied, and `academy-api` is deployed. Both GitHub public configuration variables are set. Production-origin CORS and anonymous Admin denial have been verified. The website has **not** been deployed by this production-build task.

The catalog is empty: zero questions and zero published tests. The read-only audit found **zero Admin profiles** and no configured UPI ID, payee name or QR URL. Telegram is currently required, but its bot secrets/channel settings are missing; `telegram-webhook` is intentionally not deployed. YouTube promotion links are also unset. SMTP is configured, but the Dashboard warns that its provider is intended for personal mail; real student delivery remains untested. Admin provisioning, payment setup and reviewed content must be completed before accepting money. The checklist below distinguishes existing-project steps from fresh-project instructions.

## What is implemented

- Official Supabase JavaScript SDK: email registration, confirmation-required state, login, global logout, persistent/refreshable sessions, remotely confirmed user, profile and database-owned Admin role.
- Private Admin workspace: exams, subjects/pricing, topics, tests, one-file HTML imports, structural findings, explicit content-pass approval, payment approval/rejection, access grants/extensions/revocation, student directory and launch settings. No public Admin demo or role-selection input.
- Database-backed student journey: Topic-wise Mock Tests → Exam → Subject → Topic → Free/Premium Test. Configured mode uses published database records, not illustrative preview prices.
- Server-priced UPI orders with term snapshots, unique UTR claims, pending review, atomic Admin approval and three-calendar-month initial access. Active renewals add the purchased term to existing expiry. Expired/revoked access cannot fetch premium questions or detailed answer reviews.
- Server-side Telegram linking using a random, hashed, ten-minute, one-use bot nonce; secret-authenticated webhook; fresh Bot API membership check at every free start. YouTube remains voluntary promotion only. A cached membership flag never authorizes a later attempt.
- Authorized question delivery without answer keys, explanations or imported option metadata; options expose only `id` and `text`. Immutable per-attempt snapshots, server deadline, saved answers, server scoring and owner-only results remain in use with the existing CBT navigation, flags, timer, analysis and review.
- Reusable private HTML import uses the existing two non-executing adapters. The exact declared count is mandatory. Raw HTML, source hash, original and normalized working records, all issues and review evidence remain private. Only 🟢 is removed from question text. Imports cannot overwrite an existing test bank. Invalid records are retained for review, never partially installed or silently repaired. Publication requires both passes.

## 1. Create a Supabase Free project

**Existing project: do not rerun these migrations.** Cloud function/schema inspection and post-security-migration checks were completed. This project has no `supabase_migrations.schema_migrations` history table, so a CLI history gap does not mean migrations are missing. Do not run `supabase db push` or create history records blindly. The following sequence is for a new empty project only.

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
5. Password recovery is not exposed by this minimal UI yet; use Supabase's authorized user-management recovery flow for launch support. CAPTCHA is not wired in this run; do not turn on a required Auth CAPTCHA until its client token integration is added. Keep Auth rate limits enabled. Set a short reasonable JWT expiry and remember that SDK logout revokes refresh sessions; an already issued JWT can remain valid until its expiry.

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
