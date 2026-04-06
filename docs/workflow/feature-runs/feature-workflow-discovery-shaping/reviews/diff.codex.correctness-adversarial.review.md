---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/feature-workflow-discovery-shaping/reviews/implementation.diff.patch"
artifact_sha256: "426b330d288a50c4d9703a9a836f1855749baac25c842e8b65ebd90667e5d4c5"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted after making malformed blockers explicit, removing prefix-based malformed detection, and preserving valid discovery context while using discover --clear as a surgical recovery path."
raw_output_path: "docs/workflow/feature-runs/feature-workflow-discovery-shaping/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. **High**: The new gate can be bypassed by malformed unresolved entries that already have `deferred: true`. `blocking_unresolved_items()` skips anything marked deferred, even when the entry itself is broken, so `discover --complete`, `discover --force-complete`, and spec checkpointing will all accept corrupted discovery state instead of forcing repair. That means the intended “repair before progress” guarantee is still leaky in `[factory_state.py](/Users/chrislaw/valuerank/docs/operations/codex-skills/feature-factory/scripts/factory_state.py)` and `[run_factory.py](/Users/chrislaw/valuerank/docs/operations/codex-skills/feature-factory/scripts/run_factory.py)`.

2. **Medium**: `discovery_blockers_are_malformed()` decides “malformed” by checking whether the `item` text starts with the sentinel `<malformed...>`. That is brittle: a legitimate unresolved item whose text begins with that prefix will be misclassified as corrupted state, and the code will push users toward `discover --clear`, which can discard valid discovery data. This affects the new checkpoint/discover error paths in `[run_factory.py](/Users/chrislaw/valuerank/docs/operations/codex-skills/feature-factory/scripts/run_factory.py)`.

## Residual Risks

- The new tests do not cover malformed unresolved entries that are explicitly deferred, so the bypass in finding 1 is still unverified by the suite.
- There is no coverage for a real unresolved item whose text begins with `<malformed`, so the misclassification in finding 2 could still ship unnoticed.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted after making malformed blockers explicit, removing prefix-based malformed detection, and preserving valid discovery context while using discover --clear as a surgical recovery path.
