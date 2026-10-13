# Reusable private HTML importer

The importer is subject-independent. No production adapter hard-codes Solar System, 332 questions, a price or an exam. Subject/topic strings and question counts come from each source. The real Solar System verification harness expects 332 specifically because that is the owner's preservation requirement for that file.

## Supported formats

1. `inspectCanonicalHtml(html)` in `scripts/html-import.mjs` reads one exact `<script type="application/json" id="sahoo-mock-data">` block containing `{questionCount, questions, metadata}`. Each canonical question has `id`, sequential `number`, `text`, `topic`, exactly four `options` with stable `id` and `text`, `correctOptionId`, `explanation`, `tags` and optional `metadata`. The answer ID must refer to one of that question's options; `import-core.js` validates these fields.
2. `inspectSourceArrayHtml(html, {expectedCount})` in `scripts/source-array-import.mjs` reads one unambiguous, top-level `const questions = [...]` static array. The same script may contain surrounding quiz UI code; only the original literal array is imported, never the rendered/shuffled quiz state. Each source record has `id`, `chapter`, `question_statement`, four string `options`, a zero-based `correct` index and `explanation`. Additional fields remain in `metadata.sourceRecord`. Each source `tags` entry is independently checked against the exact approved PYP exam/year rule; generic entries are never copied. Supported structured PYP metadata can also supply a tag. Inline labels remain verbatim in question text, but never generate tags.

The second parser uses pinned Acorn syntax trees (no evaluation). It accepts single/double-quoted strings and escapes, comments, identifier/quoted keys, finite numbers, booleans, null, arrays/objects and trailing commas. Literal decoding is limited to 64 nesting levels. Calls, references, spreads, getters, computed properties, template literals, sparse arrays, duplicate/unsafe keys, ambiguous declarations, malformed/truncated scripts and dynamic bank initializers are rejected. Direct top-level bank processing/aliasing is rejected too. Function/callback definitions for the original quiz (including its shuffling) are ignored, not executed; the literal snapshot is authoritative. The adapter never downloads external scripts, runs telemetry, renders uploaded HTML or infers data from runtime behavior. Arbitrary DOM-based layouts/media still require separately reviewed adapters.

## Preservation and verification

Only the exact U+1F7E2 green-circle character is removed from canonical student-facing question text. Whitespace, punctuation, option text, correct-answer identity, explanations, metadata and all raw records stay unchanged. Source-array question tags follow the strict PYP-only projection below; canonical tags remain unchanged. For source-array browser uploads, missing/invalid fields, duplicate source IDs, non-four-option records, invalid zero-based answer indices and count mismatches reject the whole upload before the content-write RPC. Exact repeated question/option text with different IDs is retained as a blocking review finding, never deduplicated. Canonical import behavior is unchanged: invalid canonical records remain available privately for review. Records are never padded, filtered, merged or repaired automatically. Stable option IDs maintain the original key when options are shuffled.

Pass 1 verifies source/imported counts, IDs, fields, answer references, required explanations, duplicates and lossless mapping. Pass 2 reviews factual accuracy, answer ambiguity, explanations, wording, source provenance and curriculum choices. Completed review can have unresolved issues; it is not equivalent to publication approval. The implemented Supabase backend stores the source hash and both pass decisions against the private import and requires both passes before publication.

## Integration boundary

These reusable private adapters run offline and in the implemented Admin-only Supabase import flow; they are not universal HTML converters. Future HTML files can reuse the adapters when their format matches, regardless of subject; unfamiliar formats fail and require a reviewed mapping. Each real file still needs its own count/preservation checks and content review. The normal Admin HTML Imports form sends the source to `academy-api`; `scripts/upload-import.mjs` selects the canonical or static-array parser. The parser is server-only and is excluded from the static Pages artifact. The existing database enforces an existing unpublished destination and rejects replacement imports. No schema migration is needed for this adapter upgrade; after approval, the updated `academy-api` (including its `deno.json` pinned Acorn import map) must be deployed separately from Pages. Existing production content is untouched by local verification. See [Supabase setup](../SUPABASE-SETUP.md).

Test duration, scoring, media and other UI behavior are not guessed from arbitrary uploaded code. Record them as reviewed test configuration alongside the intact source snapshot before publishing. The supplied Solar System source uses 90 minutes and +1/−0.25 scoring; the academy's Q/4 default would otherwise produce 83 minutes. This difference requires an explicit configuration decision, not a silent substitution.

## Upload limits and verification commands

The browser file limit remains 1 MB and the Edge request-body limit remains 2 MB (including JSON overhead). The offline adapter retains its 10 MB limit. Expected source count is mandatory for every browser upload. Neither parser can publish a test: complete both verification passes explicitly. Raw source labels remain private; actual source-array question tags use only reviewed explicit PYP metadata. Factual provenance still requires the content review.

`npm test` includes static-array parsing/rejection tests. `npm run test:backend` checks the real upload handler against isolated PostgreSQL migrations, including zero-mutation rejection, private originals, no overwrite, two-pass review and pre-submission answer privacy. `npm run test:backend-browser` exercises the normal file chooser/upload/review path at 320px with synthetic data. No real bank or credentials are included in these fixtures.

## Strict PYP-only tags for source-array imports

Two explicit per-question source metadata formats are supported:

```js
tags: ["Odisha Police SI 2023", "MCQ PDF"] // imports only "Odisha Police SI 2023"
pyp: {examId: "odisha-police-si", year: 2023, label: "Odisha Police SI 2023"}
```

The exact naming rule is an approved name, one ASCII space, and a four-digit year from 1900 through 2099. Approved names: **Odisha Police SI, Odisha Police Constable, OSSSC PEO, RI, OSSSC RI, ARI, OSSSC ARI, AMIN, OSSSC AMIN, Forest Guard, OSSSC Forest Guard, OPSC, OPSC OCS, OPSC ASO, OSSC, OSSC CGL, OSSC CHSL, OPRB, OPRB SI, OPRB Constable**. Names are case-sensitive; suffixes, prefixes, filenames, partial matches and whitespace rewriting are not accepted. Other names/formats fail closed until reviewed.

Structured `pyp` uses the lowercase, hyphen-separated identifier for the same approved name (for example `osssc-forest-guard`). Its integer year and original label must match exactly. No label is created from an exam ID/year when the original label is missing. Valid array entries retain their exact text and order. A valid structured label is appended only if it is not already in the filtered array; original array duplicates are not silently removed. Without any valid explicit label, tags are `[]`.

Only `tags` arrays and the documented `pyp` object are read. Generic PDF/HTML/Source/Notes/Custom/Practice/chapter labels and emoji are discarded. `source`, filenames, bank names, chapters, surrounding HTML, question/explanation text and similarly named fields never establish PYP provenance. The rule applies to canonicalized original/working tags and the offline student-record projection. The untouched raw record, including every discarded label, remains in private `metadata.sourceRecord` and `sourceRecords` for audit.

This validates explicit metadata format, not proof that a question appeared in an official paper. Pass 2 must still check authenticity. Canonical HTML and manual-entry contracts are unchanged by this source-array-only policy.
