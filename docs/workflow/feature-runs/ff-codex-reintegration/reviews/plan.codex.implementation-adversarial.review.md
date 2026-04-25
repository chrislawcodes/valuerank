---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-codex-reintegration/plan.md"
artifact_sha256: "1ab2331c6d86b01698c6ca268ae5840b6dde43c6b10178bf281142119524d872"
repo_root: "."
git_head_sha: "80a77301dc580237a047b7093138f47ab77402ee"
git_base_ref: "origin/main"
git_base_sha: "80a77301dc580237a047b7093138f47ab77402ee"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM #1 (hidden caller truthy on tuple): grep audit pre-step in Slice 2 is the fix; type/runtime check would over-engineer. MEDIUM #2 (skipped disables in shallow clones): accepted as residual R2 per spec FR-021 design (honest skip > silent under-report). MEDIUM #3 (prompt in process listings): documented as residual R6 — prompts in this repo are workflow specs (no secrets); stdin mode is out of scope. MEDIUM #4 (process-group cleanup on timeout): FIXED — Slice 5 now uses Popen + start_new_session=True, on TimeoutExpired calls os.killpg with SIGTERM then SIGKILL. MEDIUM #5 (subprocess exceptions): FIXED — Slice 3 freshness helpers wrap subprocess.run in try/except for CalledProcessError/TimeoutExpired/FileNotFoundError/OSError, return not-fresh on any."
raw_output_path: "docs/workflow/feature-runs/ff-codex-reintegration/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- [UNVERIFIED] Medium: The Slice 2 migration removes the boolean return contract from `check_implementation_rule()` after only a grep-based caller audit. If any hidden caller still does `if check_implementation_rule(...):`, the returned tuple will always be truthy and enforcement will silently stop working. That is a control-flow break, not a loud failure.
- [UNVERIFIED] Medium: The plan treats unresolved branch-base resolution as `skipped` and proceeds. If a clone cannot resolve `origin/main`, `main`, or fork-point, the implementation rule is effectively disabled in that environment. Unless the deployment guarantees one of those refs is always available, this is a bypass path.
- Medium: `dispatch-codex` passes the full prompt text as a command-line argument to `codex exec`. That exposes the prompt in process listings and audit logs, and it is brittle for long or unusual prompt contents. Passing the prompt via stdin or a temp file would avoid both issues.
- Medium: The timeout path uses `subprocess.run(timeout=600)` but does not specify process-group cleanup. If Codex spawns child processes, they can survive after the parent times out, keep mutating the workspace, and leave no dispatch record. The plan needs explicit kill/cleanup behavior for the whole process tree.
- Medium: The freshness helpers only define `None` handling, not malformed SHAs or git command failures. A pruned or corrupt dispatch record can make `merge-base` or `diff` throw instead of being treated as not fresh, which turns one bad record into a rule failure instead of a safe skip.

## Residual Risks

- The plan still relies heavily on mocked unit tests for `git` and Codex behavior, so real CLI drift, shallow-clone behavior, and fork-point edge cases may only show up after merge.
- The write-order choice for `dispatch-codex` intentionally allows orphaned artifact directories on crash or timeout. That is acceptable only if no other tool ever treats the directory tree as authoritative without the state pointer.
- The `advance` subcommand plan assumes the existing state schema can always absorb a new annotation entry cleanly. If older or partially initialized state files exist, that path may still need a migration guard.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM #1 (hidden caller truthy on tuple): grep audit pre-step in Slice 2 is the fix; type/runtime check would over-engineer. MEDIUM #2 (skipped disables in shallow clones): accepted as residual R2 per spec FR-021 design (honest skip > silent under-report). MEDIUM #3 (prompt in process listings): documented as residual R6 — prompts in this repo are workflow specs (no secrets); stdin mode is out of scope. MEDIUM #4 (process-group cleanup on timeout): FIXED — Slice 5 now uses Popen + start_new_session=True, on TimeoutExpired calls os.killpg with SIGTERM then SIGKILL. MEDIUM #5 (subprocess exceptions): FIXED — Slice 3 freshness helpers wrap subprocess.run in try/except for CalledProcessError/TimeoutExpired/FileNotFoundError/OSError, return not-fresh on any.
