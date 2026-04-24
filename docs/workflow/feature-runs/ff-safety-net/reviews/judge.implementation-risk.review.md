---
reviewer: "claude-sonnet-4-6"
lens: "implementation-risk-judge"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-safety-net/spec.md"
artifact_sha256: "454d1e9f2c35505682c9fc947ff8753fd9d652c62a41fe3b4af2aeb86cac7f3f"
repo_root: "."
git_head_sha: "fef1e560eb41e6d90070ec8b970a62baa711cc93"
git_base_ref: "origin/main"
git_base_sha: "c07a4283ecdebffa57e8a2cccfa08c23e0f76a36"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Three load-bearing gaps would force guessing. (1) FR-003a introduces a new `invariant_warnings[]` state field but never defines where it lives in state.json, whether it is top-level or stage-scoped, or how `status --slug` reads and surfa..."
raw_output_path: "docs/workflow/feature-runs/ff-safety-net/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec implementation-risk-judge

## Findings

Three load-bearing gaps would force guessing. (1) FR-003a introduces a new `invariant_warnings[]` state field but never defines where it lives in state.json, whether it is top-level or stage-scoped, or how `status --slug` reads and surfaces it. An implementer cannot write this path without inventing the schema. (2) FR-001 requires updating `judge-prompts/completeness.md` to reliably produce a `unaddressed_high_finding_ids` JSON array, but provides zero prompt wording, format constraint, or instruction pattern. The entire veto mechanism depends on the LLM emitting this field; if the prompt is wrong, the feature silently fails (the veto never fires). The spec gives no basis for writing a correct prompt. (3) FR-004 introduces two unexplained identifiers alongside the one state key that is already known: `outcome_value = 'rejudge'` and `next_action = 'edit_and_rerun_judge'` appear alongside `stage_state['judge_next_action'] = 'edit_and_rerun_judge'`, but the spec never says whether `outcome_value` and `next_action` are local variables, new state fields, or aliases of something existing. The current tally logic is described only as being 'around line 875-900' — an implementer writing the override block cannot know whether setting `outcome_value` has any downstream effect or is dead code.

## Residual Risks

- spec :: FR-003a - it MUST write an `invariant_warnings[]` entry `{command: "judge", stage: <stage>, detail: "completeness judge blocked without structured HIGH ids while concerns remain — prompt may be malformed"}` and fall back to majority. The operator sees the warning in `status --slug` output.
- spec :: FR-001 - `judge-prompts/completeness.md` MUST be updated to emit a JSON verdict that includes a `unaddressed_high_finding_ids: [string]` array alongside the existing `verdict`/`reasoning` fields. When the judge votes `block` specifically because HIGH reviewer findings remain unaddressed, it populates this array with the concern `id`s (or reviewer-finding references) that are still open.
- spec :: FR-004 - the tally MUST override majority: `outcome_value = "rejudge"`, `next_action = "edit_and_rerun_judge"`, `stage_state["judge_next_action"] = "edit_and_rerun_judge"`. Reason text includes the specific id(s) cited: `"completeness judge veto: unaddressed HIGH concerns {id1,id2} — majority override"`.

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "spec",
      "quote": "it MUST write an `invariant_warnings[]` entry `{command: \"judge\", stage: <stage>, detail: \"completeness judge blocked without structured HIGH ids while concerns remain \u2014 prompt may be malformed\"}` and fall back to majority. The operator sees the warning in `status --slug` output.",
      "section": "FR-003a"
    },
    {
      "artifact": "spec",
      "quote": "`judge-prompts/completeness.md` MUST be updated to emit a JSON verdict that includes a `unaddressed_high_finding_ids: [string]` array alongside the existing `verdict`/`reasoning` fields. When the judge votes `block` specifically because HIGH reviewer findings remain unaddressed, it populates this array with the concern `id`s (or reviewer-finding references) that are still open.",
      "section": "FR-001"
    },
    {
      "artifact": "spec",
      "quote": "the tally MUST override majority: `outcome_value = \"rejudge\"`, `next_action = \"edit_and_rerun_judge\"`, `stage_state[\"judge_next_action\"] = \"edit_and_rerun_judge\"`. Reason text includes the specific id(s) cited: `\"completeness judge veto: unaddressed HIGH concerns {id1,id2} \u2014 majority override\"`.",
      "section": "FR-004"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-sonnet-4-6",
  "reasoning": "Three load-bearing gaps would force guessing. (1) FR-003a introduces a new `invariant_warnings[]` state field but never defines where it lives in state.json, whether it is top-level or stage-scoped, or how `status --slug` reads and surfaces it. An implementer cannot write this path without inventing the schema. (2) FR-001 requires updating `judge-prompts/completeness.md` to reliably produce a `unaddressed_high_finding_ids` JSON array, but provides zero prompt wording, format constraint, or instruction pattern. The entire veto mechanism depends on the LLM emitting this field; if the prompt is wrong, the feature silently fails (the veto never fires). The spec gives no basis for writing a correct prompt. (3) FR-004 introduces two unexplained identifiers alongside the one state key that is already known: `outcome_value = 'rejudge'` and `next_action = 'edit_and_rerun_judge'` appear alongside `stage_state['judge_next_action'] = 'edit_and_rerun_judge'`, but the spec never says whether `outcome_value` and `next_action` are local variables, new state fields, or aliases of something existing. The current tally logic is described only as being 'around line 875-900' \u2014 an implementer writing the override block cannot know whether setting `outcome_value` has any downstream effect or is dead code.",
  "timestamp": "2026-04-24T12:00:00Z",
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Three load-bearing gaps would force guessing. (1) FR-003a introduces a new `invariant_warnings[]` state field but never defines where it lives in state.json, whether it is top-level or stage-scoped, or how `status --slug` reads and surfa...
