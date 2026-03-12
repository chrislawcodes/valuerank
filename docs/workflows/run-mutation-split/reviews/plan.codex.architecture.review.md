---
reviewer: "codex"
lens: "architecture"
stage: "plan"
artifact_path: "/private/tmp/valuerank-run-mutation-split/docs/workflows/run-mutation-split/plan.md"
artifact_sha256: "85d10224ed200bb0b27c5c21c5b2cb5a7dc2d8add0c39e3ae07511e5b7303205"
repo_root: "/private/tmp/valuerank-run-mutation-split"
git_head_sha: "3cb90bd0e543480b1015082514c2aa8dc6b78261"
git_base_ref: "origin/main"
git_base_sha: "3cb90bd0e543480b1015082514c2aa8dc6b78261"
resolution_status: "accepted"
resolution_note: "Keep the split centered on one mutation surface and keep payloads.ts focused on GraphQL-facing shapes only."
raw_output_path: ""
---

# Review: plan architecture

## Findings

No architecture findings.

The plan keeps the split centered on one mutation surface, preserves `run.ts` as the compatibility path, and sequences the split so payload registration is explicit before the shim is finalized. That is the right architecture for a safe first pass.

## Residual Risks

- `payloads.ts` can still become a second catch-all file if too much logic moves there. The split stays clean only if heavy resolver bodies remain in the mutation group files.
- The plan depends on `run/index.ts` staying the one side-effect entrypoint. If later edits import leaf files directly, mutation registration becomes harder to reason about.
- The rollback shape stays simple only if implementation avoids folding service refactors or queue logic changes into the same PR.

## Resolution
- status: accepted
- note: Keep the split centered on one mutation surface and keep payloads.ts focused on GraphQL-facing shapes only.
