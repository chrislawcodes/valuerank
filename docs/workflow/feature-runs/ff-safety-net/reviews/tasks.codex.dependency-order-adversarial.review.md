---
reviewer: "codex"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/ff-safety-net/tasks.md"
artifact_sha256: "93dc04aa6c09ac0cac5368a425881a56529d2cbe07eea6e033b526749bb38629"
repo_root: "."
git_head_sha: "2b6558ee1c419e962fa35df03d175ab68715997a"
git_base_ref: "origin/main"
git_base_sha: "c07a4283ecdebffa57e8a2cccfa08c23e0f76a36"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Addressed in tasks round-1 reconcile (see plan.md for rollup)."
raw_output_path: "docs/workflow/feature-runs/ff-safety-net/reviews/tasks.codex.dependency-order-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

- **High**: `T1.2` / `T1.3` / `T1.6` have a contract mismatch. `collect_mutating_command_names()` is specified to accept `Iterable[Callable]`, but `_get_mutating_commands()` is told to pass `enumerate_subparser_handlers(build_parser())`, which yields `(subcommand_name, handler_callable)` tuples. As written, the cache path cannot work without another projection step, so the registry either crashes or classifies the wrong objects.
- **High**: `T3.3` mixes dict and attribute access on the same data. The slice treats verdicts as dicts elsewhere (`v.get(...)`, “verdict dict missing field”), but the veto logic uses `completeness_verdict.verdict` and `stage_state.unresolved_concerns`. That path will fail unless those are custom objects, which the artifact never establishes.
- **Medium [UNVERIFIED]**: `T3.3` does not define how a `unaddressed_high_finding_ids` entry is matched to an item in `stage_state["unresolved_concerns"]`. The veto needs a stable key comparison, but the task only defines “open” status fields, not the identifier field to compare against. If the existing state shape does not already provide that mapping, the veto cannot be implemented correctly.
- **Medium**: `T2.4`’s lock-order test is too weak. Mocking `_gc_review_intermediates` only proves `command_checkpoint` called the helper while the lock was held. It does not prove the helper’s glob/delete work stays under the lock, so the exact ordering bug this checkpoint is meant to guard against is still untested.

## Residual Risks

- [UNVERIFIED] The existing parser and state shapes may differ from what these tasks assume, especially for subparser defaults and `unresolved_concerns` entries.
- `T3.4` intentionally fails open when completeness blocks without structured IDs. That means a malformed judge prompt can still let a stage advance if majority voting says proceed.
- The new tests will only catch the intended regressions if they exercise the real parser/state plumbing, not just isolated mocks.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Addressed in tasks round-1 reconcile (see plan.md for rollup).
