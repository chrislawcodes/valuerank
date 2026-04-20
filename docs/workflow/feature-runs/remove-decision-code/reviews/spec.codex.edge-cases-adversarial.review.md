---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/remove-decision-code/spec.md"
artifact_sha256: "2c40c139f87d48cfa7bb0659a243acc9093dadee342734a99880c7f5840e6989"
repo_root: "."
git_head_sha: "a50a4b6e54d0816f0ff99be3defba99d0315f4ad"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/remove-decision-code/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **High** [CODE-CONFIRMED] The migration does not actually strip `decisionCode` from malformed snapshots. The spec says malformed `definition_snapshot` rows should still be stripped and counted in the final absolute check, but `backfill-canonical-v2-migration.ts` returns `pairFromSnapshot(null)` and then `continue`s, leaving those rows untouched. That creates a permanent tail of `decisionCode` residue and makes SC-003 unattainable for any malformed row.
- **High** [CODE-CONFIRMED] Refusal rows will be written, then read back as `unknown`. The spec adds `decisionState: "refusal"` to the cache shape, but `decision-model.ts` has no refusal branch in `resolveCanonicalDecision()`. Because refusal rows have `favoredValueKey: null` and `strength: "unknown"`, the current read path falls through to the unknown fallback and erases the distinction the spec is trying to preserve.
- **Medium** [CODE-CONFIRMED] The migration’s unknown-recovery case is narrower than the live resolver. `decision-model.ts` falls back to `JOB_CHOICE_VALUE_STATEMENTS` when `valueStatements` are missing for `job-choice-v2`, but the spec only allows recovery when both `valueStatements` and `labelPrefix` are extracted from `definitionSnapshot`. That means some rows the read path could still resolve will be preserved instead.
- **Medium** [CODE-CONFIRMED] The spec calls `buildCanonicalDecisionFromPair(pair, direction, strength)`, but the provided helper in `decision-model-helpers.ts` requires two additional arguments: `normalizationApplied` and `source`. Unless the helper is changed too, the migration as written will not compile.
- **Medium** [CODE-CONFIRMED] The migration is not safe against concurrent writes. It reads `decisionMetadata` into memory, mutates the entire JSON blob, and writes it back by transcript `id` with no optimistic guard. On a live system, a summarize job or manual override that lands between read and write can be clobbered, which is exactly the case the spec says this must tolerate.

## Residual Risks

- Rows with missing parser evidence or ambiguous text will still be left behind by design; the spec does not define a separate recovery or audit path for them.
- The follow-up PR that drops the top-level `transcripts.decision_code` column is still required. Until that lands, legacy writes remain possible outside `summaryCache.summary`.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 