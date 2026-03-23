---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/i7-structured-discovery/reviews/implementation.diff.patch"
artifact_sha256: "ad34f54e708f578a0fef6c5cddf2f7a829cbf2c39f7eb3a14d6e793a54ef3a12"
repo_root: "."
git_head_sha: "6a6c10ca390d76b2fb1b536bd00634e46fdfa959"
git_base_ref: "1310e207293440894fe2a6092ff537d450c8a993"
git_base_sha: "1310e207293440894fe2a6092ff537d450c8a993"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "decimal/numpy impossible in JSON state files. Non-hashable item drop is intentional to prevent crashes; structured item payloads not valid in this schema."
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. **High: the version gate now skips legitimate numeric version values that are not plain `int`/`float`.**  
   The new `isinstance(version, (int, float))` check rejects other numeric types that compare correctly with `2`, such as `decimal.Decimal`, `numpy` numeric scalars, or custom numeric wrappers. Those blobs will now return unchanged instead of migrating from V1 to V2, which can leave downstream code seeing an older schema than expected.

2. **Medium: the new hashability filter silently drops unresolved entries instead of preserving them.**  
   `unresolved` entries with a non-hashable `item` value are now removed entirely. The prior code kept any dict with an `item` key, so this is a behavior change that can lose user state. If older blobs contain structured `item` payloads, the migration will now erase those unresolved tasks rather than carrying them forward or normalizing them.

## Residual Risks

- This patch still assumes `version` and `question` fields are shaped like clean JSON primitives; anything outside that shape is either skipped or discarded.
- There are no visible tests here covering non-builtin numeric `version` values or unresolved items with structured payloads, so the regression surface above may remain unexercised.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: decimal/numpy impossible in JSON state files. Non-hashable item drop is intentional to prevent crashes; structured item payloads not valid in this schema.
