# Exam-specific catalog hierarchy

## Scope and deployment gate

Student navigation is Choose Exam → Exam → Subject → Topic → FREE/PREMIUM Test.
All joins use stable IDs, never display names. New subject forms select an existing
exam. Topics and tests show the parent exam alongside the subject name. Selecting
a different subject clears the incompatible topic. Existing explicitly shared
subject mappings remain intact until an Admin deliberately changes them.

The hierarchy branch does not change production data. Its migration must receive
separate approval before cloud application. No examples are seeded in production.

## Production inventory (read-only, 14 October 2026)

The only published exam is `general-practice` (General Practice). Both published
subjects are assigned solely to it: `computer` (Computer) and
`general-studies-geography` (General Studies / Geography). Both have price 0 and
three-calendar-month validity. No SI, PEO or Forest Guard exam exists yet.

| Subject ID | Topic ID | Test ID | State | Questions | Minutes | Attempts / results |
| --- | --- | --- | --- | ---: | ---: | ---: |
| computer | computer-architecture | computer-architecture-practice-1 | FREE, published | 100 | 25 | 4 / 3 |
| computer | input-output-devices | input-output-devices-practice-1 | FREE, published | 100 | 25 | 1 / 1 |
| computer | introduction-to-computer | introduction-to-computer-practice-1 | FREE, hidden/draft | 0 | 41 | 0 / 0 |
| general-studies-geography | solar-system-astronomy | solar-system-astronomy-practice-1 | FREE, published | 41 | 41 | 8 / 5 |

Introduction to Computer's topic is hidden; the other three topics are published.
Totals: 241 questions, four tests, three published tests, one import, 13 attempts
and nine submitted results. The one import belongs to Solar System: 41 source,
41 imported, zero added/removed, both verification passes approved. There are no
payment or entitlement records. Private before/after catalog inventories and
content/dependency fingerprints are retained in ignored test artifacts, not in the
public website or this document. The final read-only comparison matched exactly.

These are the records the owner identifies as intended SI content. The current
database labels them General Practice; this inventory does not independently
certify official SI syllabus coverage.

## Proposed SI placement — requires separate owner approval

Create the exam `odisha-police-si` (Odisha Police SI). Reassign the existing two
subject records solely to that exam, retaining subject, topic and test IDs:

- Odisha Police SI → Computer (`computer`)
  - Computer Architecture → existing 100-question published test
  - Input & Output Devices → existing 100-question published test
  - Introduction to Computer → existing empty hidden draft (no 165Q import)
- Odisha Police SI → General Studies / Geography (`general-studies-geography`)
  - Solar System & Astronomy → existing 41-question published test

Retaining these IDs preserves question/import/attempt/result/access references.
New PEO or Forest Guard subjects should use separate IDs, for example
`osssc-peo-computer` and `forest-guard-computer`, with their own topics/tests even
when the display name is Computer. Their official syllabus content and publication
remain owner decisions. Do not copy, reimport or automatically share SI content.

## Why a migration is required

`supabase/migrations/202610130001_exam_hierarchy.sql` is forward-only and local-only
in this change. The old public subject RLS policy checks only the subject's own
publication state. Hiding its exam therefore does not hide the subject/descendants.
The existing service-role catalog/start path also needs explicit ancestor checks;
frontend filtering alone is insufficient.

The migration:

- replaces `public_subjects` with published-exam ancestry checks;
- reuses existing topic/test RLS inheritance and the composite foreign key that
  already enforces matching topic/subject IDs;
- retains the existing `academy_api` implementation as service-only
  `academy_hierarchy_base_api`, and adds a service-only `academy_api` wrapper;
- filters catalog rows and denies new attempts/verification/orders under hidden
  or inconsistent ancestors;
- validates Admin parent IDs and topic/subject consistency;
- serializes catalog authorization against catalog changes, then delegates
  authentication, Telegram, entitlement, payment, question delivery and scoring
  behavior to the existing protected implementation.

It creates no tables/columns, changes no catalog assignments, and inserts,
updates or deletes no application records. Existing attempts/results remain
accessible to their owners. No old migration should be rerun. Apply the complete
new transaction once only after approval and a fresh cloud prerequisite check.
Deploying the frontend alone does not activate these database protections.
The Edge Function code is unchanged and needs no new secrets.

The migration briefly locks function/policy definitions; runtime catalog changes
and starts/orders serialize on existing settings/catalog locks. For this small
MVP catalog this favors consistent authorization. A rollback would restore the
old visibility weakness, so prefer a reviewed forward fix rather than reverting
security policies.

## Verification

Isolated PGlite tests apply the full migration chain and compare all preexisting
rows before/after the new migration. They cover same-name subject isolation,
anonymous/authenticated RLS, each hidden ancestor, the existing composite foreign key,
invalid parent writes, Student denial, preserved results/entitlements and safe
pre-submission option fields. Browser fixtures exercise the real SDK, Edge handler
and isolated database in both development and the restricted production artifact.
They cover navigation/direct URLs, back/forward/reload, Admin selectors, active CBT
route preservation, free/premium behavior, imports and 320px/desktop layouts.

All synthetic test writes stay in disposable local databases. No production
questions, mappings, accounts, settings, imports or attempts are changed.

Final local results: 135 automated tests passed; 124 browser scenarios passed
(including 35 SDK/Edge/database scenarios in development and 35 in the production
artifact); the additional static-artifact browser checks passed. All 44 JavaScript
files passed syntax checks. Manifest/JSON validation, the 28-file public artifact
allowlist, credential-pattern scan and `git diff --check` passed. The artifact
contains no private source banks, SQL, tests or server code. No migration, merge
or deployment was performed in this task.
