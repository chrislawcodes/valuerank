---
reviewer: "claude-sonnet-4-5"
lens: "implementation-risk-judge"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "8d699036faefbe0a7ddef56824dae633ec6d49fb020dc5e24e7a756b21889553"
repo_root: "."
git_head_sha: "10bcb0bba915d6a6b917a78091afbca232a3e34f"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Four load-bearing ambiguities would force an implementer to guess on real decisions. First, the plan introduces `factory_invariants.py` with a `JSON_MODE` flag and `set_json_mode()` API for back-compat, but the tasks place the same helpe..."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec implementation-risk-judge

## Findings

Four load-bearing ambiguities would force an implementer to guess on real decisions. First, the plan introduces `factory_invariants.py` with a `JSON_MODE` flag and `set_json_mode()` API for back-compat, but the tasks place the same helper in `factory_state.py` with no `emit_to` parameter and no mention of `factory_invariants.py`. These cannot both be right, and the implementer must pick a file and decide whether to create or extend it. Second, `reseal_manifest_for_drift` must 'update the manifest checkpoint.json' but no artifact gives the path pattern for that file; the implementer cannot write the function without guessing the path. Third, the invariant check (FR-010/FR-011b) must call `recommended_next_action(...)` using `reconciliation_state()` as input, but neither the signature of `recommended_next_action` nor how to obtain `reconciliation_state()` is specified in any artifact. Fourth, the reconcile notes explicitly added `init` to `_STATE_MUTATING_COMMANDS`, but T2.4's authoritative command list omits it, leaving the implementer to decide which source wins.

## Residual Risks

- PLAN :: Slice 2 / Risk P3 - Emit to stderr when --json is in effect; stdout otherwise. Detect via a context var or explicit parameter threaded from the caller. … The module-level JSON_MODE flag in factory_invariants.py is preserved for back-compat of set_json_mode() callers but has no behavioral effect on the emit target.
- TASKS :: T2.2 / T2.3 - Add run_invariant_checks(state, command) helper … Emit invariant warnings to stderr ALWAYS (no conditional routing). Preserve the JSON_MODE flag + set_json_mode() API for back-compat but do not use it to switch emit targets.
- TASKS :: T3.3 - Add reseal_manifest_for_drift(slug, stage) helper that updates the manifest checkpoint.json and appends a drift annotation to stages[stage].annotations[]
- SPEC :: FR-002 - the runner MUST reseal the manifest to the current SHA and append a drift record to stages.<stage>.annotations[] … This reseal happens lazily the next time the advance is taken
- SPEC :: FR-011b - _run_post_invariants in run_factory.py MUST compute recommended_next_action using the same reconciliation_state() signal as status and command_checkpoint, so the contradiction detector evaluates the user-visible next-action string.
- PLAN :: Review Reconciliation note for edge-cases-adversarial - M#1 init/discover/parallel added to _STATE_MUTATING_COMMANDS.
- TASKS :: T2.4 - Call run_invariant_checks at the tail of every state-mutating command in run_factory.py: checkpoint, judge, reconcile, auto-reconcile, implement, deliver, block, repair, closeout, discover, parallel.

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "PLAN",
      "quote": "Emit to stderr when --json is in effect; stdout otherwise. Detect via a context var or explicit parameter threaded from the caller. \u2026 The module-level JSON_MODE flag in factory_invariants.py is preserved for back-compat of set_json_mode() callers but has no behavioral effect on the emit target.",
      "section": "Slice 2 / Risk P3"
    },
    {
      "artifact": "TASKS",
      "quote": "Add run_invariant_checks(state, command) helper \u2026 Emit invariant warnings to stderr ALWAYS (no conditional routing). Preserve the JSON_MODE flag + set_json_mode() API for back-compat but do not use it to switch emit targets.",
      "section": "T2.2 / T2.3"
    },
    {
      "artifact": "TASKS",
      "quote": "Add reseal_manifest_for_drift(slug, stage) helper that updates the manifest checkpoint.json and appends a drift annotation to stages[stage].annotations[]",
      "section": "T3.3"
    },
    {
      "artifact": "SPEC",
      "quote": "the runner MUST reseal the manifest to the current SHA and append a drift record to stages.<stage>.annotations[] \u2026 This reseal happens lazily the next time the advance is taken",
      "section": "FR-002"
    },
    {
      "artifact": "SPEC",
      "quote": "_run_post_invariants in run_factory.py MUST compute recommended_next_action using the same reconciliation_state() signal as status and command_checkpoint, so the contradiction detector evaluates the user-visible next-action string.",
      "section": "FR-011b"
    },
    {
      "artifact": "PLAN",
      "quote": "M#1 init/discover/parallel added to _STATE_MUTATING_COMMANDS.",
      "section": "Review Reconciliation note for edge-cases-adversarial"
    },
    {
      "artifact": "TASKS",
      "quote": "Call run_invariant_checks at the tail of every state-mutating command in run_factory.py: checkpoint, judge, reconcile, auto-reconcile, implement, deliver, block, repair, closeout, discover, parallel.",
      "section": "T2.4"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-sonnet-4-5",
  "reasoning": "Four load-bearing ambiguities would force an implementer to guess on real decisions. First, the plan introduces `factory_invariants.py` with a `JSON_MODE` flag and `set_json_mode()` API for back-compat, but the tasks place the same helper in `factory_state.py` with no `emit_to` parameter and no mention of `factory_invariants.py`. These cannot both be right, and the implementer must pick a file and decide whether to create or extend it. Second, `reseal_manifest_for_drift` must 'update the manifest checkpoint.json' but no artifact gives the path pattern for that file; the implementer cannot write the function without guessing the path. Third, the invariant check (FR-010/FR-011b) must call `recommended_next_action(...)` using `reconciliation_state()` as input, but neither the signature of `recommended_next_action` nor how to obtain `reconciliation_state()` is specified in any artifact. Fourth, the reconcile notes explicitly added `init` to `_STATE_MUTATING_COMMANDS`, but T2.4's authoritative command list omits it, leaving the implementer to decide which source wins.",
  "timestamp": "2026-04-23T00:00:00Z",
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Four load-bearing ambiguities would force an implementer to guess on real decisions. First, the plan introduces `factory_invariants.py` with a `JSON_MODE` flag and `set_json_mode()` API for back-compat, but the tasks place the same helpe...
