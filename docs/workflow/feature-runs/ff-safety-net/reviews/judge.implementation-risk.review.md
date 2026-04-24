---
reviewer: "claude-sonnet-4-6"
lens: "implementation-risk-judge"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-safety-net/spec.md"
artifact_sha256: "a03753d0a4ce026eaa4cd7527592ee1a83632df1fd5e4c1750e3cbb2f475c841"
repo_root: "."
git_head_sha: "baf9c78f2c8130f3de17c7904a0e85edf62b9074"
git_base_ref: "origin/main"
git_base_sha: "c07a4283ecdebffa57e8a2cccfa08c23e0f76a36"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Five load-bearing gaps would force an implementer to guess on correctness-critical details. (1) The shape of stage_state.unresolved_concerns is never defined — the FR-003 resolution check requires comparing concern ids against fields nam..."
raw_output_path: "docs/workflow/feature-runs/ff-safety-net/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec implementation-risk-judge

## Findings

Five load-bearing gaps would force an implementer to guess on correctness-critical details. (1) The shape of stage_state.unresolved_concerns is never defined — the FR-003 resolution check requires comparing concern ids against fields named addressed_at, deferred_reason, dismissed_reason, but whether unresolved_concerns is a list of objects, a dict keyed by id, or something else is unspecified; implementer must reverse-engineer existing code not supplied in the artifact chain. (2) The existing completeness judge verdict JSON schema is not shown; FR-001 says to add unaddressed_high_finding_ids alongside existing fields, but without knowing the current schema shape the extension is ambiguous — especially since FR-001 also says the array holds 'concern ids (or reviewer-finding references)' which are two different identifier namespaces. (3) FR-009 mandates enumerating subcommands from the argparse subparser registry but gives zero guidance on the non-obvious argparse internals (_subparsers, _group_actions, choices dict) required to do so; implementer will either get it wrong or fall back to the function-name scan the spec explicitly forbids. (4) FR-014 calls with_locked_state(slug) but slug is never shown to be available in command_checkpoint's argument namespace — if checkpoint args don't already carry a slug field, this silently fails at runtime. (5) The Tasks artifact is entirely empty — there is no executable work breakdown, so any Codex dispatch has no slice boundaries to implement against.

## Residual Risks

- spec :: FR-003 - at least one of the referenced ids is still unresolved in the current `stage_state.unresolved_concerns` (i.e., has no `addressed_at OR deferred_reason OR dismissed_reason`)
- spec :: FR-001 - populates this array with the concern `id`s (or reviewer-finding references) that are still open
- spec :: FR-009 - The authoritative source for 'every subcommand the runner exposes' is the argparse subparser registry in `build_parser()`. The test in FR-012 enumerates subcommands from argparse (not from a function-name scan)
- spec :: FR-014 - `command_checkpoint` MUST acquire the state lock via `with_locked_state(slug)` BEFORE running GC. Sequence is: parse args → acquire lock → GC → dispatch reviews → release lock.
- tasks :: entire artifact - # Tasks

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "spec",
      "quote": "at least one of the referenced ids is still unresolved in the current `stage_state.unresolved_concerns` (i.e., has no `addressed_at OR deferred_reason OR dismissed_reason`)",
      "section": "FR-003"
    },
    {
      "artifact": "spec",
      "quote": "populates this array with the concern `id`s (or reviewer-finding references) that are still open",
      "section": "FR-001"
    },
    {
      "artifact": "spec",
      "quote": "The authoritative source for 'every subcommand the runner exposes' is the argparse subparser registry in `build_parser()`. The test in FR-012 enumerates subcommands from argparse (not from a function-name scan)",
      "section": "FR-009"
    },
    {
      "artifact": "spec",
      "quote": "`command_checkpoint` MUST acquire the state lock via `with_locked_state(slug)` BEFORE running GC. Sequence is: parse args \u2192 acquire lock \u2192 GC \u2192 dispatch reviews \u2192 release lock.",
      "section": "FR-014"
    },
    {
      "artifact": "tasks",
      "quote": "# Tasks",
      "section": "entire artifact"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-sonnet-4-6",
  "reasoning": "Five load-bearing gaps would force an implementer to guess on correctness-critical details. (1) The shape of stage_state.unresolved_concerns is never defined \u2014 the FR-003 resolution check requires comparing concern ids against fields named addressed_at, deferred_reason, dismissed_reason, but whether unresolved_concerns is a list of objects, a dict keyed by id, or something else is unspecified; implementer must reverse-engineer existing code not supplied in the artifact chain. (2) The existing completeness judge verdict JSON schema is not shown; FR-001 says to add unaddressed_high_finding_ids alongside existing fields, but without knowing the current schema shape the extension is ambiguous \u2014 especially since FR-001 also says the array holds 'concern ids (or reviewer-finding references)' which are two different identifier namespaces. (3) FR-009 mandates enumerating subcommands from the argparse subparser registry but gives zero guidance on the non-obvious argparse internals (_subparsers, _group_actions, choices dict) required to do so; implementer will either get it wrong or fall back to the function-name scan the spec explicitly forbids. (4) FR-014 calls with_locked_state(slug) but slug is never shown to be available in command_checkpoint's argument namespace \u2014 if checkpoint args don't already carry a slug field, this silently fails at runtime. (5) The Tasks artifact is entirely empty \u2014 there is no executable work breakdown, so any Codex dispatch has no slice boundaries to implement against.",
  "timestamp": "2026-04-24T00:00:00Z",
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Five load-bearing gaps would force an implementer to guess on correctness-critical details. (1) The shape of stage_state.unresolved_concerns is never defined — the FR-003 resolution check requires comparing concern ids against fields nam...
