---
reviewer: codex
lens: architecture
stage: spec
artifact_path: docs/workflows/domain-first-site-ia-migration/spec.md
artifact_sha256: 795ab64099db83c36a6c541b6215e0c2c3e54e0df02691393adcce3d480e1987
repo_root: .
git_head_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
git_base_ref: origin/main
git_base_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
generation_method: codex-session
resolution_status: "accepted"
resolution_note: "No architecture blocker in the spec; residual risks are carried as Phase 0 and shared-view-model constraints."
raw_output_path: ""
---

# Review: spec architecture

## Findings

No major architecture blockers in the spec itself. The document is correctly scoped as a behavior contract rather than a migration plan, and it keeps the main architectural tension visible: user-facing `Domain Evaluation` versus persisted vignette-scoped `Run`.

## Residual Risks

1. The spec depends on Phase 0 migration artifacts that still live outside the spec, especially the route compatibility matrix and immutable launch provenance. That is the right separation, but it means implementation must not treat the spec as sufficient on its own.
2. `Findings` eligibility still depends on backend contracts that are intentionally deferred. The spec handles this correctly with the explicit non-auditable state, but architecture must keep that state first-class rather than letting frontend inference drift.
3. The status-surface hierarchy is sound, but `Domain Evaluation Summary` will need a shared view-model boundary so it does not diverge from `Run Detail` and the global status center during implementation.

## Resolution
- status: accepted
- note: No architecture blocker in the spec; residual risks are carried as Phase 0 and shared-view-model constraints.
