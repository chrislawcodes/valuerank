---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-reconciliation-hardening/plan.md"
artifact_sha256: "2a0a7d1ffcee556c484b38b7e56b9aa8754c0cf4604364a5b969615910ba4043"
repo_root: "."
git_head_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
git_base_ref: "origin/main"
git_base_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Fixed: added near-miss heading tests, nested Markdown severity tests, unsafe injected state checks, whitespace normalization tests, and legacy hash compatibility."
raw_output_path: "docs/workflow/feature-runs/ff-reconciliation-hardening/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- High: The narrowed plan-hash rollout has no migration or dual-read story for hashes already stored with the old full-file digest. Once `compute_narrowed_artifact_sha` replaces the old freshness input for plan-stage checks, existing plans will compare against a different digest format and look stale until they are regenerated, which can create broad false refreshes and break continuity for in-flight reconciliation state.
- Medium [UNVERIFIED]: `last_successful_checkpoint_flags` is keyed only by `stage` and schema version. If workflow state survives across different artifacts, branches, or reruns, the repair path can replay flags from the wrong checkpoint and silently change behavior. The plan needs a stronger identity key or an explicit invalidation rule.
- Medium [UNVERIFIED]: Wave 3 and Wave 5 conflict on `auto_context`. The plan says to persist replay-safe effective flags, but it never excludes `auto_context`, so a prior checkpoint can pin later repair runs to the wrong context behavior and override the new stage-based defaults for plan/diff.

## Residual Risks

- The stricter severity grammar will still miss aliases and near-misses such as `P0`, `SEV`, lowercase labels, or prose that implies severity without using the exact patterns.
- The PyYAML fallback will not be fully canonical, so edge-case frontmatter can still compare differently across environments even with the warning.
- Stripping quotes, code blocks, and inline code reduces false positives, but it also makes it easier to miss a real finding if a reviewer formats it in one of those forms.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Fixed: added near-miss heading tests, nested Markdown severity tests, unsafe injected state checks, whitespace normalization tests, and legacy hash compatibility.
