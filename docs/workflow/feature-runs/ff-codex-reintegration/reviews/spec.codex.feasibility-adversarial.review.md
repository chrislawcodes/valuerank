---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-codex-reintegration/spec.md"
artifact_sha256: "16effc541de3cc35fdd5ef8aa7458c1fc6730903c9395db4307b96eefc07ec98"
repo_root: "."
git_head_sha: "80a77301dc580237a047b7093138f47ab77402ee"
git_base_ref: "origin/main"
git_base_sha: "80a77301dc580237a047b7093138f47ab77402ee"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM #1 (ts vs directory inconsistency): FIXED — FR-003 clarifies <dispatch-id> includes any _NNN suffix and that ts/stdout_path/stderr_path round-trip to the same path. MEDIUM #2 (boolean compat shim defeats status enum): FIXED — FR-009a removes compat shim, mandates explicit status switch in factory_cmd_deliver. MEDIUM #3 (no hard prompt size limit): FIXED — new FR-004c eager-validates 100KB hard limit with clear error before invoking Codex."
raw_output_path: "docs/workflow/feature-runs/ff-codex-reintegration/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. **Medium**: `FR-003` and `FR-004` do not define a single, unambiguous identifier for back-to-back dispatches that land in the same microsecond. The spec says to append `_NNN` to make the path unique, but it also says `ts` is the “same as the directory timestamp” and fixes the timestamp format without the suffix. That leaves `ts` either non-unique or out of spec. This will make audit records hard to round-trip back to the filesystem.

2. **Medium [UNVERIFIED]**: The new `skipped` status in `FR-009a`/`FR-021` can be erased by the proposed boolean compatibility shim. If any caller keeps using truthiness or only checks for `"triggered"`, a branch-base resolution failure will look the same as a clean pass, which recreates the silent-under-report problem the spec is trying to fix. The spec should force status-aware handling at the deliver call site, not just “if needed” guidance.

3. **Medium**: `dispatch-codex` passes the entire prompt as a single argv argument and defines no hard size limit or fallback path. The spec says prompts are usually small, but it does not say what happens when one is large enough to hit the OS argv limit. That makes a core workflow step fail unpredictably on longer prompts, and this command is supposed to be the only producer for `state.codex_dispatches[]`.

## Residual Risks

- `git merge-base --fork-point` is still fragile in shallow clones or after reflog expiry, so the implementation-rule check can still end up in the skipped path on some real repos.
- The `advance` subcommand is a manual override by design. It improves escape velocity, but it also gives operators a way to paper over genuine manifest problems if they use it casually.
- The 50-line freshness window is still a heuristic. Even with the ancestry check, borderline cases can still flip between suppressed and triggered after small post-dispatch edits.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM #1 (ts vs directory inconsistency): FIXED — FR-003 clarifies <dispatch-id> includes any _NNN suffix and that ts/stdout_path/stderr_path round-trip to the same path. MEDIUM #2 (boolean compat shim defeats status enum): FIXED — FR-009a removes compat shim, mandates explicit status switch in factory_cmd_deliver. MEDIUM #3 (no hard prompt size limit): FIXED — new FR-004c eager-validates 100KB hard limit with clear error before invoking Codex.
