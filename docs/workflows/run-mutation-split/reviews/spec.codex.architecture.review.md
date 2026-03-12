---
reviewer: "codex"
lens: "architecture"
stage: "spec"
artifact_path: "/private/tmp/valuerank-run-mutation-split/docs/workflows/run-mutation-split/spec.md"
artifact_sha256: "097b5f666e6385a4a1b89f4b3d32b29980ec833e5146d368eed18e68502cd6e6"
repo_root: "/private/tmp/valuerank-run-mutation-split"
git_head_sha: "3cb90bd0e543480b1015082514c2aa8dc6b78261"
git_base_ref: "origin/main"
git_base_sha: "3cb90bd0e543480b1015082514c2aa8dc6b78261"
resolution_status: "accepted"
resolution_note: "Keep the old run.ts path as the shim and keep run/index.ts as the single side-effect entrypoint."
raw_output_path: ""
---

# Review: spec architecture

## Findings

No architecture findings.

The spec picks a strong seam for a safe compaction slice. It keeps the old `run.ts` path as the side-effect entrypoint, groups mutations by job instead of by helper flavor, and avoids mixing service extraction or queue redesign into the same PR.

## Residual Risks

- The split still depends on `run/index.ts` being the single side-effect entrypoint. If later edits import only some leaf files, mutation registration can drift.
- `payloads.ts` needs discipline to stay focused on GraphQL-facing shapes and small local helpers. If it becomes a second catch-all file, the compaction gain will shrink.
- The current branch does not show direct GraphQL tests for every run mutation, so implementation may still need one focused smoke test to prove full registration after the split.

## Resolution
- status: accepted
- note: Keep the old run.ts path as the shim and keep run/index.ts as the single side-effect entrypoint.
