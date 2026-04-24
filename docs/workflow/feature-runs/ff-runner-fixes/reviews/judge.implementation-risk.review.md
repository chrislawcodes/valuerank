---
reviewer: "claude-sonnet-4-5"
lens: "implementation-risk-judge"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "102b8ce6a77244e43e05a3efddf9007ef8b1a547fb68030d98fe5288c928d5b6"
repo_root: "."
git_head_sha: "b4a15a9fb0cba0243fc33620c50b106b0b8970e9"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Four load-bearing ambiguities would cause a competent implementer to guess or stop. (1) The plan explicitly defers the checkpoint CLI flags to a follow-up feature, but the spec's FR-004 requires them and T3.6 marks them done — the implem..."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec implementation-risk-judge

## Findings

Four load-bearing ambiguities would cause a competent implementer to guess or stop. (1) The plan explicitly defers the checkpoint CLI flags to a follow-up feature, but the spec's FR-004 requires them and T3.6 marks them done — the implementer has no signal which wins, and SC-005 requires the flags to pass. (2) T3.3 calls `workflow_utils.normalized_artifact_hash` but that function is never defined, described, or typed anywhere in the artifact chain — the implementer doesn't know its signature or what it hashes. (3) T3.3 resolves the manifest path via `factory_state.checkpoint_manifest_path(slug, stage)` — same problem: not defined anywhere. (4) FR-011b requires `_run_post_invariants` in `run_factory.main()` to call `recommended_next_action` with the same `reconciliation_state()` signal used by `status`, but the plan never shows how `main()` obtains `slug`, `stages`, and `reconciliation_ok` at that tail-hook point — the function signature requires all four arguments and the call-site assembly is unspecified.

## Residual Risks

- plan :: Slice 3 — Fix 1 judge-advance honoring - `checkpoint --address/--defer/--dismiss <id>` CLI flags — **deferred to follow-up feature** (the data shape supports the lifecycle but the CLI is not wired in this PR).
- tasks :: T3.6 - [x] T3.6 Add `checkpoint --address <id> --evidence <text>`, `--defer <id> --reason <text>`, `--dismiss <id> --reason <text>` flags and their handlers
- spec :: SC-005 - a plan checkpoint against a spec whose judges left 1 concern MUST block until either `checkpoint --address <id> --evidence "<text>"` or `checkpoint --defer <id> --reason "<text>"` is invoked.
- tasks :: T3.3 - reads the current artifact sha via `workflow_utils.normalized_artifact_hash`
- tasks :: T3.3 - The manifest lives at `docs/workflow/feature-runs/<slug>/reviews/<stage>.checkpoint.json` (resolve via `factory_state.checkpoint_manifest_path(slug, stage)`)
- spec :: FR-011b - `_run_post_invariants` in `run_factory.py` MUST compute `recommended_next_action` using the same `reconciliation_state()` signal as `status` and `command_checkpoint`, so the contradiction detector evaluates the user-visible next-action string.
- spec :: FR-001 - `factory_next_action.recommended_next_action(slug, state, stages, reconciliation_ok) -> str`

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "plan",
      "quote": "`checkpoint --address/--defer/--dismiss <id>` CLI flags \u2014 **deferred to follow-up feature** (the data shape supports the lifecycle but the CLI is not wired in this PR).",
      "section": "Slice 3 \u2014 Fix 1 judge-advance honoring"
    },
    {
      "artifact": "tasks",
      "quote": "[x] T3.6 Add `checkpoint --address <id> --evidence <text>`, `--defer <id> --reason <text>`, `--dismiss <id> --reason <text>` flags and their handlers",
      "section": "T3.6"
    },
    {
      "artifact": "spec",
      "quote": "a plan checkpoint against a spec whose judges left 1 concern MUST block until either `checkpoint --address <id> --evidence \"<text>\"` or `checkpoint --defer <id> --reason \"<text>\"` is invoked.",
      "section": "SC-005"
    },
    {
      "artifact": "tasks",
      "quote": "reads the current artifact sha via `workflow_utils.normalized_artifact_hash`",
      "section": "T3.3"
    },
    {
      "artifact": "tasks",
      "quote": "The manifest lives at `docs/workflow/feature-runs/<slug>/reviews/<stage>.checkpoint.json` (resolve via `factory_state.checkpoint_manifest_path(slug, stage)`)",
      "section": "T3.3"
    },
    {
      "artifact": "spec",
      "quote": "`_run_post_invariants` in `run_factory.py` MUST compute `recommended_next_action` using the same `reconciliation_state()` signal as `status` and `command_checkpoint`, so the contradiction detector evaluates the user-visible next-action string.",
      "section": "FR-011b"
    },
    {
      "artifact": "spec",
      "quote": "`factory_next_action.recommended_next_action(slug, state, stages, reconciliation_ok) -> str`",
      "section": "FR-001"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-sonnet-4-5",
  "reasoning": "Four load-bearing ambiguities would cause a competent implementer to guess or stop. (1) The plan explicitly defers the checkpoint CLI flags to a follow-up feature, but the spec's FR-004 requires them and T3.6 marks them done \u2014 the implementer has no signal which wins, and SC-005 requires the flags to pass. (2) T3.3 calls `workflow_utils.normalized_artifact_hash` but that function is never defined, described, or typed anywhere in the artifact chain \u2014 the implementer doesn't know its signature or what it hashes. (3) T3.3 resolves the manifest path via `factory_state.checkpoint_manifest_path(slug, stage)` \u2014 same problem: not defined anywhere. (4) FR-011b requires `_run_post_invariants` in `run_factory.main()` to call `recommended_next_action` with the same `reconciliation_state()` signal used by `status`, but the plan never shows how `main()` obtains `slug`, `stages`, and `reconciliation_ok` at that tail-hook point \u2014 the function signature requires all four arguments and the call-site assembly is unspecified.",
  "timestamp": "2026-04-24T00:00:00Z",
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Four load-bearing ambiguities would cause a competent implementer to guess or stop. (1) The plan explicitly defers the checkpoint CLI flags to a follow-up feature, but the spec's FR-004 requires them and T3.6 marks them done — the implem...
