---
reviewer: "claude-sonnet-4-5"
lens: "implementation-risk-judge"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "102b8ce6a77244e43e05a3efddf9007ef8b1a547fb68030d98fe5288c928d5b6"
repo_root: "."
git_head_sha: "846e5ba953723957aaffc5727ed3834dfe44a1a5"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Four concrete snags would stop or mis-direct a cold implementer. Two are load-bearing blockers: (1) `workflow_utils.normalized_artifact_hash` is called in T3.3 with no documented signature or confirmation it exists — the implementer cann..."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec implementation-risk-judge

## Findings

Four concrete snags would stop or mis-direct a cold implementer. Two are load-bearing blockers: (1) `workflow_utils.normalized_artifact_hash` is called in T3.3 with no documented signature or confirmation it exists — the implementer cannot write the reseal helper without knowing what arguments to pass. (2) The reconcile review note in the plan says 'init/discover/parallel added to _STATE_MUTATING_COMMANDS' but the authoritative frozenset in T2.4 omits `init` entirely and the spec FR-009 list also omits it — the implementer must guess whether to include it. Two additional risks are lower severity but still cause a wrong implementation on first read: (3) The plan architecture section says 'Emit to stderr when --json is in effect; stdout otherwise' which directly contradicts T2.3's 'Emit invariant warnings to stderr ALWAYS' — a cold reader of the plan hits the architecture section before the task detail. (4) T3.4 says to call the reseal helper from `factory_stages.prerequisite_failure` but FR-002 says the reseal happens 'lazily the next time the advance is taken' and the advance-gate lives in `factory_next_action.recommended_next_action` — the call-graph relationship between `prerequisite_failure` and 'taking an advance' is not documented, so the implementer cannot confirm the reseal fires at the right moment without reading existing source.

## Residual Risks

- TASKS :: Slice 3 — T3.3 - reads the current artifact sha via `workflow_utils.normalized_artifact_hash`
- PLAN :: Review Reconciliation — edge-cases-adversarial note - M#1 init/discover/parallel added to _STATE_MUTATING_COMMANDS
- TASKS :: Slice 2 — T2.4 - Contents (exact, in alphabetic order for easy diff): `auto-reconcile, block, checkpoint, closeout, deliver, discover, implement, judge, parallel, reconcile, repair`
- PLAN :: Architecture — Fix 8 row - Emit to stderr when `--json` is in effect; stdout otherwise. Detect via a context var or explicit parameter threaded from the caller.
- TASKS :: Slice 2 — T2.3 - Emit invariant warnings to stderr ALWAYS (no conditional routing). Preserve the module-level `JSON_MODE` flag + `set_json_mode()` API for back-compat but do not use them to switch emit targets — `_emit_target()` always returns `sys.stderr`.
- TASKS :: Slice 3 — T3.4 - Call the reseal helper from `factory_stages.prerequisite_failure` when a prereq stage is unhealthy BUT has `judge_next_action == "advance"` — at that point the drift is about to be tolerated so we record it once.
- SPEC :: FR-002 - This reseal happens lazily the next time the advance is taken (not eagerly at judge-write time).

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "TASKS",
      "quote": "reads the current artifact sha via `workflow_utils.normalized_artifact_hash`",
      "section": "Slice 3 \u2014 T3.3"
    },
    {
      "artifact": "PLAN",
      "quote": "M#1 init/discover/parallel added to _STATE_MUTATING_COMMANDS",
      "section": "Review Reconciliation \u2014 edge-cases-adversarial note"
    },
    {
      "artifact": "TASKS",
      "quote": "Contents (exact, in alphabetic order for easy diff): `auto-reconcile, block, checkpoint, closeout, deliver, discover, implement, judge, parallel, reconcile, repair`",
      "section": "Slice 2 \u2014 T2.4"
    },
    {
      "artifact": "PLAN",
      "quote": "Emit to stderr when `--json` is in effect; stdout otherwise. Detect via a context var or explicit parameter threaded from the caller.",
      "section": "Architecture \u2014 Fix 8 row"
    },
    {
      "artifact": "TASKS",
      "quote": "Emit invariant warnings to stderr ALWAYS (no conditional routing). Preserve the module-level `JSON_MODE` flag + `set_json_mode()` API for back-compat but do not use them to switch emit targets \u2014 `_emit_target()` always returns `sys.stderr`.",
      "section": "Slice 2 \u2014 T2.3"
    },
    {
      "artifact": "TASKS",
      "quote": "Call the reseal helper from `factory_stages.prerequisite_failure` when a prereq stage is unhealthy BUT has `judge_next_action == \"advance\"` \u2014 at that point the drift is about to be tolerated so we record it once.",
      "section": "Slice 3 \u2014 T3.4"
    },
    {
      "artifact": "SPEC",
      "quote": "This reseal happens lazily the next time the advance is taken (not eagerly at judge-write time).",
      "section": "FR-002"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-sonnet-4-5",
  "reasoning": "Four concrete snags would stop or mis-direct a cold implementer. Two are load-bearing blockers: (1) `workflow_utils.normalized_artifact_hash` is called in T3.3 with no documented signature or confirmation it exists \u2014 the implementer cannot write the reseal helper without knowing what arguments to pass. (2) The reconcile review note in the plan says 'init/discover/parallel added to _STATE_MUTATING_COMMANDS' but the authoritative frozenset in T2.4 omits `init` entirely and the spec FR-009 list also omits it \u2014 the implementer must guess whether to include it. Two additional risks are lower severity but still cause a wrong implementation on first read: (3) The plan architecture section says 'Emit to stderr when --json is in effect; stdout otherwise' which directly contradicts T2.3's 'Emit invariant warnings to stderr ALWAYS' \u2014 a cold reader of the plan hits the architecture section before the task detail. (4) T3.4 says to call the reseal helper from `factory_stages.prerequisite_failure` but FR-002 says the reseal happens 'lazily the next time the advance is taken' and the advance-gate lives in `factory_next_action.recommended_next_action` \u2014 the call-graph relationship between `prerequisite_failure` and 'taking an advance' is not documented, so the implementer cannot confirm the reseal fires at the right moment without reading existing source.",
  "timestamp": "2026-04-23T00:00:00Z",
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Four concrete snags would stop or mis-direct a cold implementer. Two are load-bearing blockers: (1) `workflow_utils.normalized_artifact_hash` is called in T3.3 with no documented signature or confirmation it exists — the implementer cann...
