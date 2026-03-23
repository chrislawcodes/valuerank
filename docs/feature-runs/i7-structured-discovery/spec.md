# I-7: Structured Discovery State — Spec

## Problem

The feature factory pipeline validates artifact consistency but not product intent. Discovery
is mandatory (I-1) but not enforceable — an agent can mark discovery complete with no real
questions asked, and an unresolved ambiguity sails through every gate. This is where
wrong-product failures are born.

The current discovery schema (`state.json`) stores only flat questions and assumptions with
no way to track which questions are unresolved, what non-goals were declared, or what
acceptance criteria define done.

## What We're Building

Add structured, machine-readable fields to the `discovery` block in `state.json`, and make
`unresolved[]` a hard blocking gate before the spec checkpoint.

### New schema fields (V2)

```json
{
  "version": 2,
  "required": true,
  "complete": true,
  "questions": [...],
  "assumptions": [...],
  "summary": "...",
  "updated_at": 0,
  "answers": {},
  "non_goals": [],
  "acceptance_criteria": [],
  "unresolved": []
}
```

- `answers: {}` — dict keyed by question text, value is the answer string
- `non_goals: []` — strings: what is explicitly out of scope
- `acceptance_criteria: []` — strings: what done looks like
- `unresolved: []` — dicts `{item, reason, deferred}`: open items not yet answered or deferred

### Enforcement

If `unresolved[]` is non-empty at checkpoint time, `checkpoint --stage spec` is **blocked**
with a clear error message listing each unresolved item. The existing `complete` flag remains
as a second axis — both must be satisfied.

### New CLI flags for `discover` command

- `--unresolved TEXT` — add an item to `unresolved[]`
- `--resolve TEXT` — remove an item from `unresolved[]` (by text match)
- `--non-goal TEXT` — add a string to `non_goals[]`
- `--acceptance-criteria TEXT` — add a string to `acceptance_criteria[]`
- `--answer QUESTION ANSWER` — record an answer in `answers{}`

### V1 to V2 migration

A pure function `migrate_discovery_state(d: dict) -> dict` upgrades V1 blobs transparently:
adds all missing V2 fields with empty defaults, sets `version: 2`, preserves all existing
data. Called automatically in `discovery_state()` on every load.

## Delivery

4 waves, each independently mergeable:

| Wave | Scope | Risk |
|------|-------|------|
| 1 | Schema extension + `migrate_discovery_state()` in `factory_state.py` only | LOW |
| 2 | Wire migration + new CLI flags in `run_factory.py` + test updates | MEDIUM |
| 3 | Enforceable gate + status display in `run_factory.py` | MEDIUM |
| 4 | Remove redundant `question_count`/`asked_count` + SKILL.md update | LOW |

## Acceptance Criteria

- All 54+ existing tests continue passing after every wave
- V1 `state.json` blobs on disk upgrade transparently on first read (no manual migration)
- `checkpoint --stage spec` is blocked when `unresolved[]` is non-empty, with clear message
- `checkpoint --stage spec` proceeds when `unresolved[]` is empty (and `complete: true`)
- `discover --unresolved`, `--resolve`, `--non-goal`, `--acceptance-criteria`, `--answer` all work
- `status` output prominently shows unresolved items when present

## Out of Scope

- I-8 (structured block/handoff state) — separate feature
- I-9 (deterministic validation gates) — separate feature
- I-10 (runner modularization) — must wait until I-7/I-8/I-9 are done
- Changes to any artifact outside `factory_state.py`, `run_factory.py`,
  `test_run_factory_repair.py`, `SKILL.md`
