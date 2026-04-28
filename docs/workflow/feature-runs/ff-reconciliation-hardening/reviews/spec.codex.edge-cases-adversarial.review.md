---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-reconciliation-hardening/spec.md"
artifact_sha256: "29c09dc13c0f84585a92377741466fe054682e164be4c625e06f3a7e5aa2fecd"
repo_root: "."
git_head_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
git_base_ref: "origin/main"
git_base_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Fixed after judge-cap advance: added word boundaries, heading spacing, replay-safe flag principle, extra ignored Markdown contexts, and YAML recovery constraints."
raw_output_path: "docs/workflow/feature-runs/ff-reconciliation-hardening/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- Medium: The spec text is truncated in **Goals**: “Hash `plan.md` for review staleness after removing exactly one valid top-level `” never finishes. That leaves the core narrowed-hash rule ambiguous and weakens the later FR-008 / FR-009 requirements. An implementer could reasonably choose the wrong section boundary or fallback behavior.
- Medium [UNVERIFIED]: `last_successful_checkpoint_flags` is underspecified for malformed or unknown state content. FR-006 only covers the happy path and older empty state, but it never says what to do if the field already exists with stale keys, wrong types, or values that are not valid CLI scalars. Because repair reuses these flags, a damaged or manually edited state file could change repair behavior or crash the runner. [UNVERIFIED] because this depends on the current state loader and serializer.
- Medium: The reconciliation-note comparison only strips ends and collapses internal whitespace runs. It does not define Unicode whitespace or invisible characters. Two notes that look identical to an operator can still compare different if one contains tabs, NBSP, or zero-width characters, which leaves a false-mismatch path open.

## Residual Risks

- PyYAML fallback still makes note comparison environment-dependent, so local runs and CI can disagree when the dependency is missing.
- The narrowed-hash rule is still tied to the exact `## Review Reconciliation` heading, so a future heading rename will make plan edits stale reviews again.
- The severity parser still only names a few markdown shapes; reviewers who use a different presentation pattern can still slip past the scan.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Fixed after judge-cap advance: added word boundaries, heading spacing, replay-safe flag principle, extra ignored Markdown contexts, and YAML recovery constraints.
