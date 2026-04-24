---
reviewer: "claude-opus-4-5"
lens: "implementation-risk-judge"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "a0a6eb61aa484ae52c7ef756d98963fdd609dcf59fd80704cd23c2d5f6cd169d"
repo_root: "."
git_head_sha: "221e9cffa80ea251479986bcb2240237ef841a57"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Four places where a competent implementer would guess or ship a bug: (1) `run_invariant_checks` has three incompatible signatures across three artifacts — spec FR-009 gives two params, plan adds a third `emit_to`, tasks drop `emit_to` an..."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec implementation-risk-judge

## Findings

Four places where a competent implementer would guess or ship a bug: (1) `run_invariant_checks` has three incompatible signatures across three artifacts — spec FR-009 gives two params, plan adds a third `emit_to`, tasks drop `emit_to` and add `recommended, invariants=None`. The caller in run_factory.py must match one; no artifact resolves which. (2) The owning module contradicts itself: spec FR-009 and plan say put the helper in `factory_state.py`; tasks T2.2 says create a NEW module `factory_invariants.py`. Both cannot be right, and the choice determines which imports change across the codebase. (3) T3.3 calls two helper functions — `factory_state.checkpoint_manifest_path(slug, stage)` and `workflow_utils.normalized_artifact_hash` — with no confirmation either exists today. If `normalized_artifact_hash` must be written, the artifact scope (which files are hashed, encoding, algorithm details beyond 'sha256') is entirely unspecified. (4) FR-006 requires matching `**Severity**: (HIGH|CRITICAL|MEDIUM)` nested under a `### N. <title>` heading — a span that inherently crosses lines. The spec's anchoring strategy is `^\s*` (start-of-line), which works for single-line patterns; whether the regex must be applied with `re.MULTILINE | re.DOTALL` or via a two-pass scan is never stated, and the choice determines whether the pattern fires at all.

## Residual Risks

- spec :: FR-009 - A new helper `factory_state.run_invariant_checks(state, command)` MUST run after every state-mutating command
- plan :: Slice 2 — Fix 8 invariant self-check - Add `run_invariant_checks(state, command)` helper in `factory_state.py`. ... Emit to stderr when `--json` is in effect; stdout otherwise. Detect via a context var or explicit parameter threaded from the caller.
- tasks :: T2.2 - Create NEW module `factory_invariants.py` (sibling of `factory_state.py`). Define `run_invariant_checks(state, command, recommended, invariants=None) -> list[dict]`
- tasks :: T3.3 - reads the current artifact sha via `workflow_utils.normalized_artifact_hash` and, when it differs from the manifest sha ... (resolve via `factory_state.checkpoint_manifest_path(slug, stage)`). The helper reads the current artifact sha via `workflow_utils.normalized_artifact_hash`
- spec :: FR-006 - new: nested under `### N. <title>` — paragraph that begins with `**Severity**: (HIGH|CRITICAL|MEDIUM)` (the Gemini review style)

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "spec",
      "quote": "A new helper `factory_state.run_invariant_checks(state, command)` MUST run after every state-mutating command",
      "section": "FR-009"
    },
    {
      "artifact": "plan",
      "quote": "Add `run_invariant_checks(state, command)` helper in `factory_state.py`. ... Emit to stderr when `--json` is in effect; stdout otherwise. Detect via a context var or explicit parameter threaded from the caller.",
      "section": "Slice 2 \u2014 Fix 8 invariant self-check"
    },
    {
      "artifact": "tasks",
      "quote": "Create NEW module `factory_invariants.py` (sibling of `factory_state.py`). Define `run_invariant_checks(state, command, recommended, invariants=None) -> list[dict]`",
      "section": "T2.2"
    },
    {
      "artifact": "tasks",
      "quote": "reads the current artifact sha via `workflow_utils.normalized_artifact_hash` and, when it differs from the manifest sha ... (resolve via `factory_state.checkpoint_manifest_path(slug, stage)`). The helper reads the current artifact sha via `workflow_utils.normalized_artifact_hash`",
      "section": "T3.3"
    },
    {
      "artifact": "spec",
      "quote": "new: nested under `### N. <title>` \u2014 paragraph that begins with `**Severity**: (HIGH|CRITICAL|MEDIUM)` (the Gemini review style)",
      "section": "FR-006"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-opus-4-5",
  "reasoning": "Four places where a competent implementer would guess or ship a bug: (1) `run_invariant_checks` has three incompatible signatures across three artifacts \u2014 spec FR-009 gives two params, plan adds a third `emit_to`, tasks drop `emit_to` and add `recommended, invariants=None`. The caller in run_factory.py must match one; no artifact resolves which. (2) The owning module contradicts itself: spec FR-009 and plan say put the helper in `factory_state.py`; tasks T2.2 says create a NEW module `factory_invariants.py`. Both cannot be right, and the choice determines which imports change across the codebase. (3) T3.3 calls two helper functions \u2014 `factory_state.checkpoint_manifest_path(slug, stage)` and `workflow_utils.normalized_artifact_hash` \u2014 with no confirmation either exists today. If `normalized_artifact_hash` must be written, the artifact scope (which files are hashed, encoding, algorithm details beyond 'sha256') is entirely unspecified. (4) FR-006 requires matching `**Severity**: (HIGH|CRITICAL|MEDIUM)` nested under a `### N. <title>` heading \u2014 a span that inherently crosses lines. The spec's anchoring strategy is `^\\s*` (start-of-line), which works for single-line patterns; whether the regex must be applied with `re.MULTILINE | re.DOTALL` or via a two-pass scan is never stated, and the choice determines whether the pattern fires at all.",
  "timestamp": "2026-04-23T00:00:00Z",
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Four places where a competent implementer would guess or ship a bug: (1) `run_invariant_checks` has three incompatible signatures across three artifacts — spec FR-009 gives two params, plan adds a third `emit_to`, tasks drop `emit_to` an...
