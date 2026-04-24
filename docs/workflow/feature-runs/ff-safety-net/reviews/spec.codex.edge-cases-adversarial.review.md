---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-safety-net/spec.md"
artifact_sha256: "da09382e8c33b1717f23595ce88209107a3400a0ee13bff880353439515552d6"
repo_root: "."
git_head_sha: "50eaa7497529381b508e931325872a2a6f6ead88"
git_base_ref: "origin/main"
git_base_sha: "c07a4283ecdebffa57e8a2cccfa08c23e0f76a36"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Round-2 HIGH (inverted FR-003): FIXED. HIGH (legacy regex contradiction): FIXED — structured signal only, no regex. MEDIUM (.review.md corruption not closed by GC): accepted as Risk R5 — atomic write of .review.md is a follow-up feature, not in this scope. MEDIUM UNVERIFIED (build_parser authority): accepted per R2."
raw_output_path: "docs/workflow/feature-runs/ff-safety-net/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **High**: FR-003 makes the veto all-or-nothing on the cited IDs. It says the veto does not fire if *any* listed ID is already resolved in `stage_state.unresolved_concerns`. That means one stale or already-closed ID can suppress the veto even when other cited HIGH findings are still open. That is a direct bypass of the safety gate.
- **High**: The completeness-veto rules contradict each other. FR-001/FR-019 say the structured `unaddressed_high_finding_ids` field is the single source of truth and that regex is not a fallback, but the edge-case section still requires regex matching when the judge says “some HIGHs remain unaddressed” without IDs. The spec does not define which rule wins, so the implementation can easily drift back into the brittle regex path or ignore the edge case entirely.
- **Medium**: US3 does not actually close the corruption class it cites. The proposed GC only deletes stale intermediates at the start of the next checkpoint and explicitly preserves `*.review.md`. If a run is interrupted mid-write, the corrupted `.review.md` can remain in place and still be the file the next run sees. Deleting intermediates alone does not guarantee the corruption problem is gone.
- **[UNVERIFIED] Medium**: FR-009/FR-012 assume `build_parser()` is the authoritative list of runnable subcommands. If the current codebase has any state-mutating entrypoint that is not surfaced through that parser path, this registry test will miss it. I cannot verify that assumption from the artifact alone.

## Residual Risks

- Legacy judge state without the new structured completeness field still falls back to majority rules per FR-007, so historical runs can still advance past an unresolved HIGH until they are re-evaluated.
- The GC and mutating-registry protections depend on implementation details that are not fully specified here, especially lock scope and subcommand wiring. If those assumptions are wrong in the codebase, the safety net will be weaker than the spec implies.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Round-2 HIGH (inverted FR-003): FIXED. HIGH (legacy regex contradiction): FIXED — structured signal only, no regex. MEDIUM (.review.md corruption not closed by GC): accepted as Risk R5 — atomic write of .review.md is a follow-up feature, not in this scope. MEDIUM UNVERIFIED (build_parser authority): accepted per R2.
