# I-7: Structured Discovery State — Wave Plan

Generated: 2026-03-22
Feature: i7-structured-discovery

## Context

Implements I-7 from `docs/plans/feature-workflow-plan.md`. Adds structured, machine-readable
discovery fields to `state.json` and makes `unresolved[]` a blocking gate before spec.

Key constraint from Codex adversarial review: Wave 1 cannot remove V1 fields because
`run_factory.py` has 33 references to them. Schema and behavior changes must land together.
The solution: additive schema (Wave 1), behavior extension (Wave 2), gate enforcement (Wave 3),
cleanup (Wave 4).

---

## Waves

### Wave 1 — Schema Extension + Migration Function
**Files**: `docs/operations/codex-skills/feature-factory/scripts/factory_state.py`
**Changes**:
- `default_discovery_state()`: bump `version` to 2, add new fields:
  - `answers: {}` — dict keyed by question text (or ID), value is the answer string
  - `non_goals: []` — list of strings: what is explicitly out of scope
  - `acceptance_criteria: []` — list of strings: what done looks like
  - `unresolved: []` — list of dicts: `{item, reason, deferred}` — open items not yet answered
- Keep all V1 fields (`question_count`, `asked_count`, `questions`, `assumptions`, `complete`)
  untouched in defaults — this is purely additive
- New function `migrate_discovery_state(d: dict) -> dict`:
  - If `d.get("version", 1) < 2`, add missing V2 fields with empty defaults
  - Return updated dict (pure function, no I/O)
- New tests (5–10) in `test_run_factory_repair.py` covering:
  - `default_discovery_state()` contains all V2 keys
  - `migrate_discovery_state()` upgrades V1 blob to V2 (adds missing fields, preserves existing)
  - `migrate_discovery_state()` on V2 blob is a no-op

**Do NOT touch**: `run_factory.py`, `SKILL.md`, any existing tests
**Removed/renamed symbols**: none
**Risk**: LOW — purely additive, runner is unchanged, all existing tests continue passing
**Verification**: `cd docs/operations/codex-skills/feature-factory && python -m pytest tests/ -q`

---

### Wave 2 — Runner Extension: Migration Wire-up + New CLI Flags
**Files**: `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`,
           `docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py`
**Changes**:
- `discovery_state()` (the loader function): call `migrate_discovery_state()` before returning,
  so all in-memory discovery blobs are V2 regardless of what's on disk
- `command_discover()`: add new CLI flags that populate V2 fields:
  - `--unresolved TEXT` — add an item to `unresolved[]`
  - `--resolve TEXT` — remove an item from `unresolved[]` (by text match or index)
  - `--non-goal TEXT` — add a string to `non_goals[]`
  - `--acceptance-criteria TEXT` — add a string to `acceptance_criteria[]`
  - `--answer QUESTION ANSWER` — record an answer in `answers{}`
- Existing V1 flags (`--question`, `--assumption`, `--complete`, `--count`) remain unchanged
- Update existing tests that construct V1-shaped discovery dicts to also include V2 fields
  (the 7 tests Codex identified at lines 106, 139, 266–314, 427, 458–511)

**Do NOT touch**: the `command_checkpoint()` spec gate (still checks `complete`), `SKILL.md`
**Removed/renamed symbols**: none
**Risk**: MEDIUM — runner behavior extends but existing gate logic is unchanged; migration
means V1 state.json files on disk continue working. The one live V1 blob
(`docs/feature-runs/workflow-runner-hardening/state.json`) will be migrated transparently on
first `status` or `checkpoint` read.
**Verification**: `cd docs/operations/codex-skills/feature-factory && python -m pytest tests/ -q`

---

### Wave 3 — Enforceable Gate + Status Display
**Files**: `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`,
           `docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py`
**Changes**:
- `command_checkpoint()` spec gate (line ~1041):
  - Current: `if discovery.get("required") and not discovery.get("complete")`
  - New: add additional check — `or bool(discovery.get("unresolved", []))` — block if any
    unresolved items exist, regardless of the `complete` flag
  - Error message: tell user to resolve or defer each item with `discover --resolve`
- `recommended_next_action()` (line ~1459): apply same `unresolved[]` check alongside `complete`
- `command_status()` (line ~1549): display unresolved items prominently when present:
  ```
  discovery: BLOCKED (3 unresolved items)
    - "What's the rollback plan?" [unresolved]
    - "Who owns the spec sign-off?" [unresolved]
  ```
- Add/update tests for the new gate behavior:
  - Spec blocked when `unresolved` is non-empty even if `complete` is True
  - Spec allowed when `unresolved` is empty
  - Status output includes unresolved items

**Do NOT touch**: `factory_state.py`, `SKILL.md`
**Removed/renamed symbols**: none
**Risk**: MEDIUM — changes pipeline blocking behavior. Existing runs with empty `unresolved[]`
are unaffected. Risk is only for runs that use `--complete True` while having unresolved items,
which is the intended behavior change.
**Verification**: `cd docs/operations/codex-skills/feature-factory && python -m pytest tests/ -q`

---

### Wave 4 — Cleanup + Docs
**Files**: `docs/operations/codex-skills/feature-factory/scripts/factory_state.py`,
           `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`,
           `docs/operations/codex-skills/feature-factory/SKILL.md`
**Changes**:
- `default_discovery_state()`: remove `question_count` and `asked_count` from defaults
  (these are redundant — both derivable as `len(questions)` and `len([q for q in questions
  if q answered])`). The `--count` guard in `command_discover` can be replaced by
  `len(discovery["questions"])`.
- `command_discover()`: remove the `--count` flag and `question_count`/`asked_count` write
  paths; replace with `len(discovery["questions"])` where counts were used
- `migrate_discovery_state()`: map old `question_count`/`asked_count` to `None` during
  migration (already handled by migration being additive — these fields just stop being written)
- Update 3-4 tests that assert `question_count`/`asked_count` keys in state
- `SKILL.md`: update discovery section to describe V2 fields and `unresolved[]` gate

**Do NOT touch**: `questions[]`, `assumptions[]`, `complete`, `required`, `answers{}`,
`non_goals[]`, `acceptance_criteria[]`, `unresolved[]`
**Removed/renamed symbols**:
- `question_count` field removed from `default_discovery_state()` output
- `asked_count` field removed from `default_discovery_state()` output
- `--count` CLI flag removed from `command_discover` subparser
**Risk**: LOW — behavior unchanged after Wave 3; this is pure cleanup of redundant counters
and documentation. No pipeline logic depends on `question_count`/`asked_count` after Wave 3.
**Verification**: `cd docs/operations/codex-skills/feature-factory && python -m pytest tests/ -q`

---

## Human Gates

None required. Each wave is fully verifiable by test suite. No UI review needed.

---

## Cross-wave Dependencies

- Wave 2 requires Wave 1 (calls `migrate_discovery_state()` introduced in Wave 1)
- Wave 3 requires Wave 2 (reads `unresolved[]` populated by new Wave 2 CLI flags)
- Wave 4 requires Wave 3 (removes fields that Wave 3's gate no longer depends on)
- All waves are strictly sequenced; no parallel execution

---

## Post-Deploy Verification Checklist

- [ ] All 54+ tests passing after each wave merge
- [ ] `python run_factory.py status --slug workflow-runner-hardening` reads V1 state.json
  and displays without error (migration applied transparently)
- [ ] `python run_factory.py discover --slug <test> --unresolved "Open question" --required` works
- [ ] With unresolved items present, `checkpoint --stage spec` is blocked with clear error
- [ ] With unresolved items cleared, `checkpoint --stage spec` proceeds normally

---

## Adversarial Findings Addressed

**Finding 1 (Wave 1 not isolatable)**: Resolved by keeping all V1 fields in Wave 1 defaults.
Wave 1 is now purely additive — zero behavior change.

**Finding 2 (`complete` is load-bearing)**: Addressed in Wave 3 by extending the gate rather
than replacing it. `complete` continues to work; `unresolved[]` adds a second enforcement axis.

**Finding 3 (live V1 state on disk)**: Addressed in Wave 2 by wiring `migrate_discovery_state()`
into `discovery_state()`. The one live V1 blob (`workflow-runner-hardening/state.json`) will
upgrade transparently on first read.

**Finding 4 (Wave 2 too large)**: Split into Wave 2 (extension) and Wave 3 (gate). Each is
under 80 lines of changed code.

**Finding 5 (tests too late)**: Wave 2 updates the 7 failing tests in the same wave as the
behavior change. Wave 1 adds new tests without touching existing ones.
