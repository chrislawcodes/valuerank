---
reviewer: "claude-sonnet-4-5"
lens: "implementation-risk-judge"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "102b8ce6a77244e43e05a3efddf9007ef8b1a547fb68030d98fe5288c928d5b6"
repo_root: "."
git_head_sha: "2b700ed1b77fe279b9abd511995359cf791dcbb5"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Five load-bearing ambiguities that would cause wrong code or a stuck implementer. Two are direct contradictions between the plan's architecture table and the spec/tasks (module location, stderr routing). One is an underspecified encoding..."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec implementation-risk-judge

## Findings

Five load-bearing ambiguities that would cause wrong code or a stuck implementer. Two are direct contradictions between the plan's architecture table and the spec/tasks (module location, stderr routing). One is an underspecified encoding that produces silently wrong IDs. Two leave the implementer with no way to satisfy the stated call-site contract without guessing at existing API surface.

## Residual Risks

- PLAN :: Architecture table / Slice 2 description vs. SPEC FR-009 and TASKS T2.2 - Plan architecture table: '| 8 | new helper in `factory_state.py` | `run_invariant_checks(state, command)`'. But FR-009: 'A new helper `factory_invariants.run_invariant_checks(...)` (in a NEW module `factory_invariants.py`, sibling of `factory_state.py`)'. And T2.2: 'Create NEW module `factory_invariants.py`… Do NOT put this helper in `factory_state.py`.' Direct contradiction on which file to create the helper in.
- PLAN :: Slice 2 narrative vs. SPEC FR-009, TASKS T2.3, PLAN Risk P3 - Slice 2: 'Emit to stderr when `--json` is in effect; stdout otherwise. Detect via a context var or explicit parameter threaded from the caller.' But FR-009: 'always stderr, so machine-readable stdout is never contaminated'. T2.3: 'Emit invariant warnings to stderr ALWAYS (no conditional routing).' Risk P3: 'Warnings go to stderr *always* — no conditional routing.' Conditional routing is specified and simultaneously forbidden.
- SPEC / TASKS :: FR-003 and T3.5 — concern ID encoding - FR-003: 'id = sha256(stage|judge|round_raised|<first-48-chars-of-reasoning-stripped-of-whitespace>)[:12]'. T3.5: 'sha256(f"{stage}|{judge}|{round_raised}|" + "".join(reasoning.split())[:48])[:12]'. Neither specifies `.hexdigest()` vs `.digest()`. IDs are stored in state.json and passed as CLI arguments (`checkpoint --address <id>`), so bytes vs hex string is load-bearing — a bytes slice produces a binary string that breaks JSON serialization and CLI round-trips.
- TASKS :: T3.3 — checkpoint_manifest_path assumed to exist - T3.3: 'The manifest lives at `docs/workflow/feature-runs/<slug>/reviews/<stage>.checkpoint.json` (resolve via `factory_state.checkpoint_manifest_path(slug, stage)`).' No other artifact confirms this function exists in `factory_state.py`. If it does not exist, the implementer must invent the path-resolution logic rather than call a known API — and the path shown in the parenthetical may not match how the existing codebase actually constructs it.
- TASKS :: T3.3 / T3.4 — manifest_state parameter provenance at call site - T3.3 defines: 'record_advance_with_drift_if_needed(slug, stage, stage_state, manifest_state)'. T3.4 says: 'Call the reseal helper from `factory_stages.prerequisite_failure` when a prereq stage is unhealthy BUT has `judge_next_action == "advance"`. No artifact explains where `prerequisite_failure` gets `manifest_state` from — the caller would have to read the manifest file itself, but then it is unclear whether the helper still reads it too (double read) or takes the pre-read dict as a caller responsibility.

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "PLAN",
      "quote": "Plan architecture table: '| 8 | new helper in `factory_state.py` | `run_invariant_checks(state, command)`'. But FR-009: 'A new helper `factory_invariants.run_invariant_checks(...)` (in a NEW module `factory_invariants.py`, sibling of `factory_state.py`)'. And T2.2: 'Create NEW module `factory_invariants.py`\u2026 Do NOT put this helper in `factory_state.py`.' Direct contradiction on which file to create the helper in.",
      "section": "Architecture table / Slice 2 description vs. SPEC FR-009 and TASKS T2.2"
    },
    {
      "artifact": "PLAN",
      "quote": "Slice 2: 'Emit to stderr when `--json` is in effect; stdout otherwise. Detect via a context var or explicit parameter threaded from the caller.' But FR-009: 'always stderr, so machine-readable stdout is never contaminated'. T2.3: 'Emit invariant warnings to stderr ALWAYS (no conditional routing).' Risk P3: 'Warnings go to stderr *always* \u2014 no conditional routing.' Conditional routing is specified and simultaneously forbidden.",
      "section": "Slice 2 narrative vs. SPEC FR-009, TASKS T2.3, PLAN Risk P3"
    },
    {
      "artifact": "SPEC / TASKS",
      "quote": "FR-003: 'id = sha256(stage|judge|round_raised|<first-48-chars-of-reasoning-stripped-of-whitespace>)[:12]'. T3.5: 'sha256(f\"{stage}|{judge}|{round_raised}|\" + \"\".join(reasoning.split())[:48])[:12]'. Neither specifies `.hexdigest()` vs `.digest()`. IDs are stored in state.json and passed as CLI arguments (`checkpoint --address <id>`), so bytes vs hex string is load-bearing \u2014 a bytes slice produces a binary string that breaks JSON serialization and CLI round-trips.",
      "section": "FR-003 and T3.5 \u2014 concern ID encoding"
    },
    {
      "artifact": "TASKS",
      "quote": "T3.3: 'The manifest lives at `docs/workflow/feature-runs/<slug>/reviews/<stage>.checkpoint.json` (resolve via `factory_state.checkpoint_manifest_path(slug, stage)`).' No other artifact confirms this function exists in `factory_state.py`. If it does not exist, the implementer must invent the path-resolution logic rather than call a known API \u2014 and the path shown in the parenthetical may not match how the existing codebase actually constructs it.",
      "section": "T3.3 \u2014 checkpoint_manifest_path assumed to exist"
    },
    {
      "artifact": "TASKS",
      "quote": "T3.3 defines: 'record_advance_with_drift_if_needed(slug, stage, stage_state, manifest_state)'. T3.4 says: 'Call the reseal helper from `factory_stages.prerequisite_failure` when a prereq stage is unhealthy BUT has `judge_next_action == \"advance\"`. No artifact explains where `prerequisite_failure` gets `manifest_state` from \u2014 the caller would have to read the manifest file itself, but then it is unclear whether the helper still reads it too (double read) or takes the pre-read dict as a caller responsibility.",
      "section": "T3.3 / T3.4 \u2014 manifest_state parameter provenance at call site"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-sonnet-4-5",
  "reasoning": "Five load-bearing ambiguities that would cause wrong code or a stuck implementer. Two are direct contradictions between the plan's architecture table and the spec/tasks (module location, stderr routing). One is an underspecified encoding that produces silently wrong IDs. Two leave the implementer with no way to satisfy the stated call-site contract without guessing at existing API surface.",
  "timestamp": "2026-04-23T00:00:00Z",
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Five load-bearing ambiguities that would cause wrong code or a stuck implementer. Two are direct contradictions between the plan's architecture table and the spec/tasks (module location, stderr routing). One is an underspecified encoding...
