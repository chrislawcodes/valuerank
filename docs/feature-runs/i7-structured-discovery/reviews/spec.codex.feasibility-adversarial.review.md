---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/i7-structured-discovery/spec.md"
artifact_sha256: "eafa64781cfa17066bfa672f7c6b8e0642c7403adabaf0f162ef49e5a9d6cf3f"
repo_root: "."
git_head_sha: "acd7dd3a428760b036c85a8f24442853bde050b9"
git_base_ref: "origin/main"
git_base_sha: "bb7a5403bbe8414e99820865a15e2490fe0542cb"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "5 findings: text-key fragility accepted-limitation; migration persisted to disk in Wave 2; deferred items skip gate; CLI uses exact-match + deduplication; full gate defined: required AND (not complete OR any non-deferred unresolved)"
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. High: `answers` and `unresolved` are keyed or matched by raw text, which is not a stable identifier. Rewording a question, duplicating similar questions, or even trivial whitespace changes can silently break the mapping, make `--resolve` ambiguous, and orphan existing answers on upgrade.
2. High: The V1 to V2 migration is underspecified for persistence. `migrate_discovery_state()` is called on load, but the spec never says the upgraded state is written back to disk. That means “upgrade transparently on first read” may still leave persistent V1 blobs behind and force repeated re-migration.
3. Medium: The blocking rule for `unresolved[]` ignores the meaning of `deferred`. As written, any non-empty list blocks checkpoint, even when an item is intentionally deferred. That makes the new field shape `{item, reason, deferred}` internally inconsistent and removes the distinction between “must fix now” and “accepted deferral.”
4. Medium: CLI semantics are incomplete for add/remove operations. The spec does not define deduplication, exact versus substring matching, or behavior when `--resolve` matches multiple entries. It also does not say whether `--answer` is allowed for a question that is not already present in `questions[]`. Those gaps make the interface easy to implement inconsistently.
5. Medium: The interaction between `complete`, `required`, and `unresolved` is not fully defined. The spec states that `complete` remains a second axis, but it only spells out the failure case for non-empty `unresolved[]` and the success case for `complete: true` plus empty `unresolved[]`. It leaves the `complete: false` case implicit, which is exactly where enforcement bugs hide.

## Residual Risks

- Free-text fields like `non_goals[]`, `acceptance_criteria[]`, and `answers{}` will still be semantically messy unless there is normalization or validation beyond this spec.
- `status` output can still understate the real state if it truncates long lists, merges similar text, or fails to visually separate deferred items from blocking items.
- The “all 54+ existing tests continue passing after every wave” target is only as strong as the current suite; if it does not already cover matching, deduplication, and migration persistence, regressions can still slip through.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: 5 findings: text-key fragility accepted-limitation; migration persisted to disk in Wave 2; deferred items skip gate; CLI uses exact-match + deduplication; full gate defined: required AND (not complete OR any non-deferred unresolved)
