---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/plan.md"
artifact_sha256: "dc061ea73545a86c8e1a615660bbab41b7247ccd464641c6a2d4090f1490c2e6"
repo_root: "."
git_head_sha: "b8d5934f8215b9d6e4bffd546f5abca8e9799c79"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "All 3 findings addressed in current plan.md: HIGH invariant hook list now enumerates all 11 mutating commands in Slice 2. MEDIUM conditional routing replaced with stderr-always in Slice 2. MEDIUM module location updated to factory_invariants.py (NEW module) matching code."
raw_output_path: ""
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- HIGH [CODE-CONFIRMED] Slice 2 under-scopes the invariant hook list. It tells you to run `run_invariant_checks` after `checkpoint`, `judge`, `reconcile`, `auto-reconcile`, `implement`, `deliver`, and `block` but the runner's mutating-command set also includes `discover`, `parallel`, `repair`, and `closeout`. If implemented as written, the guardrail would miss four state-mutating paths.

- MEDIUM [CODE-CONFIRMED] Slice 2 still describes conditional warning routing, saying stderr only when `--json` is active and stdout otherwise. The code and tests already require stderr-only emission regardless of JSON mode. The plan would reintroduce the exact routing bug the invariant is meant to prevent.

- MEDIUM [CODE-CONFIRMED] Slice 2 points the invariant helper at `factory_state.py`, but the current runner keeps state I/O and migration in `factory_state.py` and invariant logic in a separate `factory_invariants.py` module. That module choice is stale relative to the actual architecture.

## Residual Risks

- The plan still depends on reviewer-output shapes staying within the covered regex forms. The self-hosting tests reduce that risk, but they do not eliminate new formats.
- Fix 1's concern-lifecycle flow is still only as good as the read-time backfill and checkpoint/UI wiring staying aligned. If any of those paths diverge, old runs can become hard to advance or explain.

## Resolution
- status: accepted
- note: All 3 findings addressed in current plan.md: HIGH invariant hook list now enumerates all 11 mutating commands in Slice 2. MEDIUM conditional routing replaced with stderr-always in Slice 2. MEDIUM module location updated to factory_invariants.py (NEW module) matching code.
