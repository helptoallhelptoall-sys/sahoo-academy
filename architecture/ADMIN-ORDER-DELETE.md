# Admin ordering and removal

This branch requires **one new forward migration**, `202610150001_admin_order_delete.sql`, an updated `academy-api` action allowlist and a frontend release. None is applied to production in this implementation run. Do not rerun old migrations. Migration/code rollback must retain the new wrapper: old APIs do not understand tombstones or revised imports.

## Ordering

`display_order` is an integer position on exams, subjects, topics, tests and questions. Initial values reproduce existing alphabetical catalog ordering and original question order. New catalog records append unless a position is supplied. Siblings are reordered atomically into consecutive positions; manual positions beyond the catalog size are placed last. The UI offers drag handles, touch dragging, keyboard-accessible up/down buttons and a numeric Display Order form. All changes persist through the service-only RPC and appear in student catalog responses. It works with published and hidden/draft siblings.

Scopes are: all exams; subjects with exactly one chosen parent exam; topics within one subject ID; tests within one topic ID; questions within one test ID. Same display names never join scopes. Legacy shared subjects remain intact but must be explicitly separated before reordering or deleting their parent exam. A stale list/version or a list missing/adding/duplicating sibling IDs is rejected atomically.

Question content and original source numbers/IDs are never renumbered by ordering. `display_order` / import `working` array position is the active canonical order. The existing independent per-attempt server shuffle remains unchanged, so **new students do not receive predictable canonical order**. Snapshot positions remain Question 1…N. Reordering questions conservatively hides the test, increments its revision and invalidates review; publication requires fresh review. Catalog-only reordering does not hide records.

## Explicit deletion

Every Delete opens a server-derived impact preview: label, publication state, child records, active questions, imports, referencing attempts/results, payments and entitlements. The user supplies a reason and must type **Delete permanently**. Cancel, incorrect confirmation, stale impact version, or unauthorized requests make no changes. There is no one-click delete and no automatic duplicate removal.

Questions are removed from the active working bank only. A published test is immediately hidden, count/revision updated and review invalidated. Other question text, options, stable IDs, correct mappings, explanations, tags and metadata are preserved exactly. Existing snapshots, saved answers, deadlines and results are never updated by this operation. Existing saved attempts can still be finalized and submitted results read through their owner-only APIs; new starts/resume through an unavailable test are denied until that test is available again. Paid historical review still requires the existing subject entitlement.

Parent removal recursively removes active question rows and hides/marks catalog descendants with `deleted_at`. Catalog tombstones retain IDs and descriptive fields needed by historical foreign keys; IDs cannot be reused/resurrected through Admin Save. They disappear from active Admin lists and student catalog, and restrictive RLS policies hide them from direct browser catalog reads. No attempt/result, payment, entitlement, original import, profile or audit row is cascaded. Retained original import evidence stays private. This is removal from active content, **not erasure of historical/legal audit evidence**. There is no restore UI.

## Imported source versus working bank

Initial import still requires exact expected/source/imported count, zero additions/removals and both review passes. Original HTML, source SHA, `original` (including raw `metadata.sourceRecord`), source count and initial imported count remain immutable. A rejected structural import's working bank is available in the private ordering/removal panel even when no questions were installed.

An explicitly approved removal updates only `working`, active question rows, test count, `removed`, recalculated structural issues and review state. The original `removed=0` constraint becomes `0 <= removed <= source_count` for these later audited operations; `added=0` and `imported_count=source_count` remain enforced. `audit.activeQuestions`, `audit.intentionalRemoved`, `audit.manualEditRevision` and append-only `audit.workingOperations` distinguish original extraction from intentional later edits. Each operation records actor, timestamp, reason, removed stable source ID/before record or old/new order. A separate immutable Admin audit entry records the impact.

For the synthetic 165Q case, remove only the record identified as Q96: keep Q58, preserve the 165 raw originals, retain initial imported count 165, set removed 1 and active count 164. The remaining full bank is structurally revalidated; duplicate issues clear only when no duplicate remains. If any structural issue remains, no partial bank is installed. Pass 2 is always reset. Empty banks cannot publish. Revised imports remain read-only to ordinary text editing; further changes need the deliberate working-bank/review workflow. Source/PYP policy is unchanged.

## Security and release

No new browser table write grant, service secret, CORS exception or RLS bypass is introduced. New helper functions and renamed legacy wrapper are revoked from PUBLIC/anon/authenticated. The outer API and Edge handler both require Admin role. Operations take the existing settings lock before editing, matching catalog/start lock order. Deletion version hashes and list hashes are concurrency guards, **not authorization tokens**.

Regression tests use disposable PGlite databases and isolated Auth/API browser fixtures only. Public build allowlist includes only the new UI module; SQL, fixtures, reports, source banks and private audit evidence are excluded. Production Q96 and all other production records must remain untouched until separately authorized.
