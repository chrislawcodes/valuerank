---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/i7-structured-discovery/plan.md"
artifact_sha256: "dd0d7573b935ab366f5bef64386a57958ea3426045fe7273ea74b299903ee113"
repo_root: "."
git_head_sha: "acd7dd3a428760b036c85a8f24442853bde050b9"
git_base_ref: "origin/main"
git_base_sha: "bb7a5403bbe8414e99820865a15e2490fe0542cb"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Finding 1 (--answer never closes loop): fixed. --answer now also clears from unresolved[]. Finding 2 (migration trusts complete=true): accepted trade-off — explicit completion is respected. Finding 3 (atomicity): write-back uses atomic_json_write with temp-file+os.replace. Finding 4 (malformed unresolved entries): migration sanitizes unresolved[] — non-dict entries dropped, only {item, deferred} dicts preserved."
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

1. **High: `--answer` never closes the loop with the new gate semantics.** The plan stores answers in `answers{}`, but it never specifies how answering a question clears the corresponding blocking item from `unresolved[]` or flips `complete`. Given the Wave 3 gate blocks on `complete=false` or any non-deferred unresolved item, a user can successfully record answers and still remain permanently blocked.

2. **High: Migration can silently discard pending work by trusting `complete=true`.** Wave 1 says V1 `questions[]` are only converted into `unresolved[]` when `required=true` and `complete=false`. If a V1 blob has a stale or incorrect `complete=true`, the plan explicitly preserves that completion and drops the outstanding questions during migration. That is a data-loss path, not just a reconciliation choice.

3. **Medium: The first-access writeback migration has no concurrency or atomicity story.** Wave 2 rewrites the on-disk state as soon as migration changes the version. The plan does not mention locking, compare-and-swap, or atomic temp-file replacement, so two concurrent commands can migrate and overwrite each other, and a crash mid-write can corrupt the only copy of the discovery state.

4. **Medium: Malformed list element shapes are not actually handled, despite the claim of graceful migration.** The plan only says non-list fields become empty lists and `None` is skipped. But Wave 3 gate logic assumes each `unresolved[]` entry is a dict and calls `i.get("deferred")`. A list containing a string, integer, or other malformed item will still crash status/checkpoint paths even after migration.

## Residual Risks

- Exact-text identity for questions and `--resolve TEXT` remains operationally brittle. Even if accepted for V1, duplicated prompts, whitespace changes, or formatting drift will still make items hard to address unambiguously.
- Removing `question_count` and `asked_count` in Wave 4 may still break untracked downstream consumers or scripts that are not covered by the repo tests, even if the internal runner is updated.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Finding 1 (--answer never closes loop): fixed. --answer now also clears from unresolved[]. Finding 2 (migration trusts complete=true): accepted trade-off — explicit completion is respected. Finding 3 (atomicity): write-back uses atomic_json_write with temp-file+os.replace. Finding 4 (malformed unresolved entries): migration sanitizes unresolved[] — non-dict entries dropped, only {item, deferred} dicts preserved.
