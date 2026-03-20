---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflows/workflow-two-mode-implementation/spec.md"
artifact_sha256: "6a9162c44c522b4ba324a736f6fa0cbea04fa1ce681afae46f22ef5b043f0e15"
repo_root: "."
git_head_sha: "d5d05171abe1c55f411c5ca826872b49c50849cd"
git_base_ref: "origin/main"
git_base_sha: "c165a36bfd702090296714c081e0deed98c02892"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "High findings accepted and reconciled into spec: CLAUDE.md clarified as protocol-only (state stays in workflow.json), checkpoint_index replaced with checkpoint_progress struct with SHA+marker_count, first-run and fallback cases specified. Mode-selection dispatch deferred — agents self-select via SKILL.md."
raw_output_path: "docs/workflows/workflow-two-mode-implementation/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. **High**: The checkpoint invalidation scheme is too weak. The spec only compares `marker_count`, so any edit that moves, reorders, duplicates, or rewrites `[CHECKPOINT]` markers without changing their count will be treated as unchanged and can silently reuse the wrong diff base. That breaks the core safety property of scoped review. The spec needs a structural fingerprint of the marker layout, not just a count.

2. **High**: `last_diff_head_sha` is not a safe long-lived base without ancestry validation. The spec does not say what happens after a rebase, cherry-pick, branch reset, or any HEAD move outside the runner. In those cases the stored SHA can become unreachable or semantically unrelated, and later checkpoints may diff against the wrong commit. The runner needs an explicit ancestor check and a fallback rule for rewritten history.

3. **High**: The `~/.claude/CLAUDE.md` requirement is operationally fragile and hard to test. It lives outside the repository, can already contain user-specific content, and may not exist on every machine or be writable in CI. The spec omits how to preserve existing customizations, how to install this safely, and how to validate it in a reproducible way. As written, this is a local-environment assumption, not a repo feature.

4. **Medium**: `[CHECKPOINT]` parsing is underspecified. The runner behavior depends on where markers appear, but the spec does not say whether markers inside code fences, quoted examples, comments, or non-task prose count. That leaves room for accidental false positives and divergent behavior across editors and formatting changes.

## Residual Risks

- Even with better marker tracking, the feature still depends on humans keeping `tasks.md` and workflow state aligned; the spec does not enforce that invariant.
- The guide/doc pieces are only as durable as the current SKILL.md and model naming conventions; both can drift and leave the new instructions stale.
- The test plan covers the nominal checkpoint cases, but it does not explicitly cover rebases, detached HEADs, or concurrent repo edits, which are the cases most likely to break scoped diff logic.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: High findings accepted and reconciled into spec: CLAUDE.md clarified as protocol-only (state stays in workflow.json), checkpoint_index replaced with checkpoint_progress struct with SHA+marker_count, first-run and fallback cases specified. Mode-selection dispatch deferred — agents self-select via SKILL.md.
