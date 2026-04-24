---
reviewer: "claude-sonnet-4-5"
lens: "implementation-risk-judge"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "64a54910ad67fdd4b54e618d9f96b68b1fd5db4639f89e037aaad581c62481ba"
repo_root: "."
git_head_sha: "7b414cadc42e915c128f35f296d36dca61c9d85b"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Four concrete snags would stop a competent implementer: (1) The emit-routing for Fix 8 warnings is specified three different ways across the three artifacts — always-stderr in the spec FR, conditional in the plan Risk P3, and a JSON_MODE..."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec implementation-risk-judge

## Findings

Four concrete snags would stop a competent implementer: (1) The emit-routing for Fix 8 warnings is specified three different ways across the three artifacts — always-stderr in the spec FR, conditional in the plan Risk P3, and a JSON_MODE context-var switch in T2.3. An implementer must pick one; tests written for the wrong choice will be wrong. (2) The Fix 1 decision-tree change is expressed as pseudocode calling an undefined function `continue_past_stage()` — the artifacts never show the source of `factory_next_action.py`, so the implementer has no artifact-grounded answer for what code to write. (3) The plan's reconcile-accepted list of state-mutating commands (init/discover/parallel) contradicts T2.4's enumeration, which omits those three call sites. An implementer following tasks.md will miss them. (4) The concern-ID hash formula is specified two different ways — FR-003 says 'stripped-of-whitespace then first 48 chars' and T3.5 says `reasoning[:48]` — producing different bytes and therefore different IDs.

## Residual Risks

- spec :: FR-009 - Emission rule (revised in spec review round 2 per Gemini requirements-adversarial MEDIUM #3): always stderr
- plan :: Slice 2 bullet - Emit to stderr when --json is in effect; stdout otherwise. Detect via a context var or explicit parameter threaded from the caller.
- tasks :: T2.3 - Add stdout-vs-stderr emit logic gated on a `factory_state.JSON_MODE` context variable set by `run_factory.py` when `--json` is present
- tasks :: T3.1 - add `if stages[stage].get("judge_next_action") == "advance": continue_past_stage()` check before each `not healthy` branch
- plan :: Review Reconciliation — edge-cases-adversarial - M#1 init/discover/parallel added to _STATE_MUTATING_COMMANDS
- tasks :: T2.4 - Call `run_invariant_checks` at the tail of `cmd_checkpoint`, `cmd_judge`, `cmd_reconcile`, `cmd_auto_reconcile`, `cmd_implement`, `cmd_deliver`, `cmd_block` in `run_factory.py`
- spec :: FR-003 - id = sha256(stage|judge|round_raised|<first-48-chars-of-reasoning-stripped-of-whitespace>)[:12]
- tasks :: T3.5 - Compute `id` from `sha256(stage|judge|round_raised|reasoning[:48])[:12]` when writing

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "spec",
      "quote": "Emission rule (revised in spec review round 2 per Gemini requirements-adversarial MEDIUM #3): always stderr",
      "section": "FR-009"
    },
    {
      "artifact": "plan",
      "quote": "Emit to stderr when --json is in effect; stdout otherwise. Detect via a context var or explicit parameter threaded from the caller.",
      "section": "Slice 2 bullet"
    },
    {
      "artifact": "tasks",
      "quote": "Add stdout-vs-stderr emit logic gated on a `factory_state.JSON_MODE` context variable set by `run_factory.py` when `--json` is present",
      "section": "T2.3"
    },
    {
      "artifact": "tasks",
      "quote": "add `if stages[stage].get(\"judge_next_action\") == \"advance\": continue_past_stage()` check before each `not healthy` branch",
      "section": "T3.1"
    },
    {
      "artifact": "plan",
      "quote": "M#1 init/discover/parallel added to _STATE_MUTATING_COMMANDS",
      "section": "Review Reconciliation \u2014 edge-cases-adversarial"
    },
    {
      "artifact": "tasks",
      "quote": "Call `run_invariant_checks` at the tail of `cmd_checkpoint`, `cmd_judge`, `cmd_reconcile`, `cmd_auto_reconcile`, `cmd_implement`, `cmd_deliver`, `cmd_block` in `run_factory.py`",
      "section": "T2.4"
    },
    {
      "artifact": "spec",
      "quote": "id = sha256(stage|judge|round_raised|<first-48-chars-of-reasoning-stripped-of-whitespace>)[:12]",
      "section": "FR-003"
    },
    {
      "artifact": "tasks",
      "quote": "Compute `id` from `sha256(stage|judge|round_raised|reasoning[:48])[:12]` when writing",
      "section": "T3.5"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-sonnet-4-5",
  "reasoning": "Four concrete snags would stop a competent implementer: (1) The emit-routing for Fix 8 warnings is specified three different ways across the three artifacts \u2014 always-stderr in the spec FR, conditional in the plan Risk P3, and a JSON_MODE context-var switch in T2.3. An implementer must pick one; tests written for the wrong choice will be wrong. (2) The Fix 1 decision-tree change is expressed as pseudocode calling an undefined function `continue_past_stage()` \u2014 the artifacts never show the source of `factory_next_action.py`, so the implementer has no artifact-grounded answer for what code to write. (3) The plan's reconcile-accepted list of state-mutating commands (init/discover/parallel) contradicts T2.4's enumeration, which omits those three call sites. An implementer following tasks.md will miss them. (4) The concern-ID hash formula is specified two different ways \u2014 FR-003 says 'stripped-of-whitespace then first 48 chars' and T3.5 says `reasoning[:48]` \u2014 producing different bytes and therefore different IDs.",
  "timestamp": "2026-04-23T00:00:00Z",
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Four concrete snags would stop a competent implementer: (1) The emit-routing for Fix 8 warnings is specified three different ways across the three artifacts — always-stderr in the spec FR, conditional in the plan Risk P3, and a JSON_MODE...
