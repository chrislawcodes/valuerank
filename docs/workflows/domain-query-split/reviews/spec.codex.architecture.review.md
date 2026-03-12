---
reviewer: "codex"
lens: "architecture"
stage: "spec"
artifact_path: "/Users/chrislaw/valuerank/docs/workflows/domain-query-split/spec.md"
artifact_sha256: "87b44fa1f9d3c1a8c6539cf16daf47a45f5dc2309a7fb8fbec9542a0929b1cc0"
repo_root: "/Users/chrislaw/valuerank"
git_head_sha: "3aa0478c59137277c911bea998522cfd86ec9934"
git_base_ref: "origin/main"
git_base_sha: "3aa0478c59137277c911bea998522cfd86ec9934"
resolution_status: "accepted"
resolution_note: "Keep the old domain.ts path as a shim and keep domain/index.ts as the single side-effect entrypoint."
raw_output_path: ""
---

# Review: spec architecture

## Findings

No architecture findings.

The current spec picks a strong boundary for the next compaction slice. It keeps the aggregate work isolated, preserves the old `domain.ts` entry path as a compatibility shim, and avoids mixing resolver splits with helper moves or codegen setup. The added requirement for one focused schema or query test also gives the split a clearer proof point for schema registration safety.

## Residual Risks

- The spec still depends on implementation discipline to keep `domain/index.ts` as the single side-effect entrypoint for the split files. If later edits bypass that path, schema registration drift becomes easier.
- The old `domain.ts` path currently serves both runtime side effects and one live constant export. The implementation will need to preserve both roles carefully to avoid a quiet compatibility break.
- The proposed `shared.ts` file is safe only if it stays small. If it turns into a second catch-all module, the compaction gain will be smaller than planned.

## Resolution
- status: accepted
- note: Keep the old domain.ts path as a shim and keep domain/index.ts as the single side-effect entrypoint.
