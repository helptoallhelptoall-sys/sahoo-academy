# Reusable private HTML importer

The importer is subject-independent. No production adapter hard-codes Solar System, 332 questions, a price or an exam. Subject/topic strings and question counts come from each source. The real Solar System verification harness expects 332 specifically because that is the owner's preservation requirement for that file.

## Supported formats

1. `inspectCanonicalHtml(html)` in `scripts/html-import.mjs` reads one exact `<script type="application/json" id="sahoo-mock-data">` block containing `{questionCount, questions, metadata}`. Each canonical question has `id`, sequential `number`, `text`, `topic`, exactly four `options` with stable `id` and `text`, `correctOptionId`, `explanation`, `tags` and optional `metadata`. The answer ID must refer to one of that question's options; `import-core.js` validates these fields.
2. `inspectSourceArrayHtml(html, {expectedCount})` in `scripts/source-array-import.mjs` reads one unambiguous `const questions = [...]` immediately followed by the script closing tag. Each source record has `id`, `chapter`, `question_statement`, four string `options`, a zero-based `correct` index and `explanation`. Additional fields remain in `metadata.sourceRecord`. Explicit `tags` arrays are retained. Inline PYP/source labels remain in the question text; no exam authenticity is inferred from a label.

The second parser accepts plain double-quoted JSON strings, identifier keys, numbers, booleans, null, arrays/objects and trailing commas. It rejects executable expressions, functions, duplicate keys and unsafe object keys. It does not run eval, source scripts, telemetry, styles or the uploaded test interface. Source size is limited to 10 MB. Template literals, single-quoted strings, arbitrary DOM-based question layouts and media/rich-text interpretation need separately reviewed adapters.

## Preservation and verification

Only the exact U+1F7E2 green-circle character is removed from canonical student-facing question text. Whitespace, punctuation, option text, correct-answer identity, explanations, tags, metadata and all raw records stay unchanged. Missing/invalid fields and declared-count mismatches are findings; records are never padded, filtered, merged or repaired automatically. Stable option IDs maintain the original key when options are shuffled.

Pass 1 verifies source/imported counts, IDs, fields, answer references, required explanations, duplicates and lossless mapping. Pass 2 reviews factual accuracy, answer ambiguity, explanations, wording, source provenance and curriculum choices. Completed review can have unresolved issues; it is not equivalent to publication approval. The implemented Supabase backend stores the source hash and both pass decisions against the private import and requires both passes before publication.

## Integration boundary

These reusable private adapters run offline and in the implemented Admin-only Supabase import flow; they are not universal HTML converters. Future HTML files can reuse the adapters when their format matches, regardless of subject; unfamiliar formats fail and require a reviewed mapping. Each real file still needs its own count/preservation checks and content review. The cloud schema and academy-api are deployed; real catalog/content publication and launch setup remain pending. See [Supabase setup](../SUPABASE-SETUP.md).

Test duration, scoring, media and other UI behavior are not guessed from arbitrary uploaded code. Record them as reviewed test configuration alongside the intact source snapshot before publishing. The supplied Solar System source uses 90 minutes and +1/−0.25 scoring; the academy's Q/4 default would otherwise produce 83 minutes. This difference requires an explicit configuration decision, not a silent substitution.
