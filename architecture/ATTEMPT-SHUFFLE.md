# Per-attempt shuffle and resume

Pending migration: `supabase/migrations/202610140001_attempt_shuffle.sql`.
This change is local/review-only until separately approved for release. Do not run older migrations or a blind database push.

The forward migration replaces only `academy_internal` and retains its service-only EXECUTE permissions. It performs no data backfill or update. Existing question/import records, attempt snapshots, answers, deadlines and submitted results stay unchanged. Existing API wrappers continue enforcing authentication, published ancestry, Telegram policy and paid entitlements. No Edge Function change is required.

For a new owner-scoped idempotency key, PostgreSQL generates independent UUID v4 random sort keys for questions and for each question's options. It stores the complete resulting canonical records in the private attempt snapshot. Neither source question numbers nor correctness influence the random keys. Random permutations are independent draws, so a repeated order is mathematically possible, especially for four options; deliberately rotating or rejecting previous orders would change that distribution.

Start/retry/resume reads the saved snapshot in array order, projecting options to **id/text only** and numbering questions by position. The response also returns only the student's own saved selections and flags. Correct IDs, explanations and arbitrary imported metadata stay private until submission. The existing trusted scorer and result writer iterate this same snapshot and evaluate stable option IDs; the review UI displays all options in the attempted order.

The browser stores only a test ID, owner ID, route and resume/idempotency key in sessionStorage, never a question bank, answer key, token or offline result. This handle is not authorization: replay still needs the owner's authenticated session and all current access checks. My dashboard can resume unfinished attempts on another browser using the server-provided owner-only key. Reload/resume cannot extend the deadline. Submitted or expired attempts cannot restart with their old key; saved expired answers can still be finalized through the existing dashboard operation. Saving remains asynchronous: a request interrupted before the server acknowledges it cannot be guaranteed saved.

Phone layout changes apply only below 768px: timer, question/options/controls, navigator, finish. Desktop and the existing 768–900px tablet behavior are unchanged. The single timer, palette states, watermark and keyboard controls are reused.

## Release checks

Run `npm test`, `npm run test:backend`, `npm run test:pages`, browser/recovery/branding suites and the restricted production build. The shuffle tests seed legacy attempts before applying the migration, then prove unchanged legacy records, independent new permutations, retry persistence, stable-ID scoring, exact review order, entitlement/deadline denial and safe pre-submit fields. The backend browser suite runs the real SQL and Edge handler with isolated Auth/Telegram transport and tests reload, dashboard resume, mobile layout and desktop sidebar.

After separate release approval, apply only the new migration to the verified current schema, then release the website build. Do not revert to an older start-response implementation that sorts by source number: that would display newly shuffled snapshots incorrectly. Any rollback must retain snapshot-order delivery/resume and may disable only future shuffle creation. No existing snapshot should be rewritten.
