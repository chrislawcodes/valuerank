---
reviewer: "codex"
lens: "architecture"
stage: "plan"
artifact_path: "/Users/chrislaw/valuerank/docs/workflows/domain-query-split/plan.md"
artifact_sha256: "70748391385a753552695fbe29ac4b1b958a67e33b4d08108168f95881522d43"
repo_root: "/Users/chrislaw/valuerank"
git_head_sha: "3aa0478c59137277c911bea998522cfd86ec9934"
git_base_ref: "origin/main"
git_base_sha: "3aa0478c59137277c911bea998522cfd86ec9934"
resolution_status: "accepted"
resolution_note: "Keep the split centered on one query surface and keep shared.ts small so the compaction gain is real."
raw_output_path: ""
---

# Review: plan architecture

## Findings

No architecture findings.

The plan keeps the split bounded to one GraphQL query module, preserves the old `domain.ts` path as the compatibility surface, and sequences the extraction so the side-effect entrypoint is explicit before the shim is finalized. That is the right architecture for a safe first pass.

## Residual Risks

- The plan relies on `domain/index.ts` staying the only side-effect entrypoint. If implementation later adds direct imports to leaf files from multiple places, the schema registration story gets harder to reason about.
- `shared.ts` can still become a second catch-all file if the implementation moves too much logic into it. The plan is sound, but the split should keep heavy resolver bodies out of that module.
- The rollback shape stays simple only if the implementation avoids mixing helper-file moves, codegen setup, or naming churn into the same PR.

## Resolution
- status: accepted
- note: Keep the split centered on one query surface and keep shared.ts small so the compaction gain is real.
