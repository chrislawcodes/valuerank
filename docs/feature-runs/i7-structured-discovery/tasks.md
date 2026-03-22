# I-7: Structured Discovery State — Tasks

## Wave 1: Schema Extension + Migration Function

**File:** `docs/operations/codex-skills/feature-factory/scripts/factory_state.py`

### Task 1.1 — Update `default_discovery_state()`
Bump `version` to 2. Add new fields after existing ones:
```python
def default_discovery_state() -> dict:
    return {
        "version": 2,
        "required": False,
        "complete": True,
        "question_count": 0,
        "asked_count": 0,
        "questions": [],
        "assumptions": [],
        "summary": "",
        "updated_at": 0,
        # V2 fields
        "answers": {},
        "non_goals": [],
        "acceptance_criteria": [],
        "unresolved": [],
    }
```

### Task 1.2 — Add `migrate_discovery_state()` function
Add after `default_discovery_state()`:

```python
def migrate_discovery_state(d: dict) -> dict:
    """Upgrade a V1 discovery blob to V2 in-place (returns modified copy).

    Safe for malformed inputs: non-list fields become empty lists, None values
    are skipped. Idempotent on V2 blobs.
    """
    if d.get("version", 1) >= 2:
        return d
    d = dict(d)  # shallow copy
    d["version"] = 2
    if "answers" not in d:
        d["answers"] = {}
    if "non_goals" not in d:
        d["non_goals"] = []
    if "acceptance_criteria" not in d:
        d["acceptance_criteria"] = []
    # Sanitize unresolved: keep only valid dicts, drop malformed entries
    existing_unresolved = d.get("unresolved", [])
    if not isinstance(existing_unresolved, list):
        existing_unresolved = []
    d["unresolved"] = [
        item for item in existing_unresolved
        if isinstance(item, dict) and "item" in item
    ]
    # Populate unresolved from V1 questions when discovery is required+incomplete
    if d.get("required") and not d.get("complete"):
        questions = d.get("questions", [])
        if not isinstance(questions, list):
            questions = []
        existing_items = {u["item"] for u in d["unresolved"]}
        for q in questions:
            if not isinstance(q, dict):
                continue
            text = q.get("question", "")
            if text and text not in existing_items:
                d["unresolved"].append({"item": text, "deferred": False})
                existing_items.add(text)
    return d
```

### Task 1.3 — Export `migrate_discovery_state` in module
Add `migrate_discovery_state` to the module-level exports (no `__all__` used — just ensure
the function is at module scope, which it already is by being a top-level def).

### Task 1.4 — New tests for Wave 1 (in `test_run_factory_repair.py`)

Add a new test class `TestMigrateDiscoveryState` with these test methods:

- `test_default_discovery_state_has_v2_fields`: asserts `version==2`, keys include
  `answers`, `non_goals`, `acceptance_criteria`, `unresolved`
- `test_migrate_noop_on_v2`: V2 blob returned unchanged
- `test_migrate_adds_missing_v2_fields`: V1 blob gets all 4 new fields
- `test_migrate_sets_version_2`: V1 blob gets `version: 2`
- `test_migrate_preserves_existing_data`: V1 questions/assumptions preserved after migration
- `test_migrate_populates_unresolved_from_questions_when_required_incomplete`:
  V1 with `required=true`, `complete=false`, questions `[{"question": "Q1", ...}, {"question": "Q2", ...}]`
  (dict shape, as produced by `command_discover --question`) →
  `unresolved` has `[{"item": "Q1", "deferred": False}, {"item": "Q2", "deferred": False}]`
- `test_migrate_does_not_populate_unresolved_when_complete`:
  V1 with `required=true`, `complete=true` → `unresolved` stays empty
- `test_migrate_handles_malformed_questions_list`:
  V1 with `questions` set to `None` → no crash, `unresolved` is `[]`
- `test_migrate_sanitizes_malformed_unresolved_entries`:
  V1 with `unresolved: ["string", 42, {"item": "valid", "deferred": False}]` →
  only the dict entry survives

Verification: `cd docs/operations/codex-skills/feature-factory && python -m pytest tests/ -q`
All 54+ existing tests must still pass.

---

## Wave 2: Migration Wire-up + New CLI Flags

**Files:** `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`,
           `docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py`

### Task 2.1 — Wire migration into `discovery_state()`
Find the `discovery_state(slug)` function. After loading discovery from state, apply
`migrate_discovery_state()`. If the returned dict has `version == 2` and the original
had `version < 2` (or no version), write back to disk using `atomic_json_write`:

```python
def discovery_state(slug: str) -> dict:
    state = load_workflow_state(slug)
    discovery = state.get(DISCOVERY_KEY, default_discovery_state())
    migrated = migrate_discovery_state(discovery)
    if migrated.get("version", 1) > discovery.get("version", 1):
        # Write back the migrated state
        state[DISCOVERY_KEY] = migrated
        atomic_json_write(factory_state_path(slug), state)
    return migrated
```

### Task 2.2 — Add new CLI flags to `command_discover()`

Locate the `command_discover` subparser registration (around line 2152 of `run_factory.py`).
Add these flags:
- `parser.add_argument("--unresolved", metavar="TEXT")` — add item to `unresolved[]`
- `parser.add_argument("--resolve", metavar="TEXT")` — remove item from `unresolved[]`
- `parser.add_argument("--defer", metavar="TEXT")` — set `deferred=True` on existing unresolved item
- `parser.add_argument("--non-goal", metavar="TEXT")` — add to `non_goals[]`
- `parser.add_argument("--acceptance-criteria", metavar="TEXT")` — add to `acceptance_criteria[]`
- `parser.add_argument("--answer", nargs=2, metavar=("QUESTION", "ANSWER"))` — record answer

### Task 2.3 — Implement new flag behavior in `command_discover()`

In the `command_discover()` function body, add handling after existing flag processing:

**`--unresolved TEXT`**: Add `{"item": text, "deferred": False}` to `discovery["unresolved"]`
if no entry with that exact `item` value already exists.

**`--resolve TEXT`**: Find first entry in `discovery["unresolved"]` where
`entry["item"] == text` (exact, case-sensitive). Remove it. If not found, print error and exit.

**`--defer TEXT`**: Find first entry in `discovery["unresolved"]` where
`entry["item"] == text`. Set `entry["deferred"] = True`. If not found, print error and exit.
This is the CLI mechanism to mark an item as intentionally deferred (will not block checkpoint).

**`--non-goal TEXT`**: Add string to `discovery["non_goals"]` if not already present.

**`--acceptance-criteria TEXT`**: Add string to `discovery["acceptance_criteria"]` if not
already present.

**`--answer QUESTION ANSWER`**:
1. Verify QUESTION exists in `discovery["questions"]` (check `q["question"] == QUESTION`
   for each q). If not found, raise SystemExit with error listing available questions.
2. Store `discovery["answers"][QUESTION] = ANSWER`.
3. Remove first entry from `discovery["unresolved"]` where `entry["item"] == QUESTION`
   (if present). This closes the loop between answering and unblocking.

### Task 2.4 — Update 7 existing tests that assume V1 discovery shape

The following tests construct V1-shaped discovery dicts. Update each to include V2 fields
(`answers: {}`, `non_goals: []`, `acceptance_criteria: []`, `unresolved: []`):
- `test_recommended_next_action_prefers_discovery_before_spec` (line ~106)
- `test_recommended_next_action_handles_discovery_required_and_complete` (line ~139)
- `test_status_reports_discovery_progress` (line ~266)
- Any discover mutation tests (lines ~427–557) that assert on the discovery dict shape

Verification: `cd docs/operations/codex-skills/feature-factory && python -m pytest tests/ -q`

---

## Wave 3: Enforceable Gate + Status Display

**Files:** `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`,
           `docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py`

### Task 3.1 — Update `command_checkpoint()` spec gate

Current (line ~1041):
```python
if discovery.get("required") and not discovery.get("complete"):
    raise SystemExit("spec checkpoint requires discovery to be complete first; ...")
```

New (extend, don't replace):
```python
if discovery.get("required"):
    non_deferred = [i for i in discovery.get("unresolved", [])
                    if isinstance(i, dict) and not i.get("deferred", False)]
    if not discovery.get("complete"):
        raise SystemExit(
            "spec checkpoint requires discovery to be complete first; "
            "record the remaining questions and assumptions with the discover command"
        )
    if non_deferred:
        items = "\n".join(f"  - {i['item']}" for i in non_deferred)
        raise SystemExit(
            f"spec checkpoint blocked: {len(non_deferred)} unresolved discovery item(s):\n"
            f"{items}\n"
            "Resolve with: discover --resolve <item>  or  defer with: discover --defer <item>"
        )
```

### Task 3.2 — Update `recommended_next_action()`

Update the `complete` check at line ~1459 to also check for non-deferred unresolved items:
```python
discovery = state.get(DISCOVERY_KEY, {})
non_deferred = [i for i in discovery.get("unresolved", [])
                if isinstance(i, dict) and not i.get("deferred", False)]
if discovery.get("required") and (not discovery.get("complete") or non_deferred):
    return "discover"
```

### Task 3.3 — Update `command_status()` to display unresolved items

In the status discovery display section (line ~1549), add unresolved items display:
```
discovery:
- required: yes
- complete: yes
- unresolved: 2 blocking, 1 deferred
  - [BLOCKING] "What is the rollback plan?"
  - [BLOCKING] "Who owns the spec sign-off?"
  - [DEFERRED] "Long-term scalability approach"
```

### Task 3.4 — Gate test matrix (explicit 5 cases)

Add `TestSpecGateWithUnresolved` test class:
- `test_gate_passes_complete_empty_unresolved`: `required=T, complete=T, unresolved=[]` → no block
- `test_gate_blocks_complete_with_unresolved`: `required=T, complete=T, unresolved=[{item, deferred:F}]` → SystemExit
- `test_gate_blocks_incomplete_empty_unresolved`: `required=T, complete=F, unresolved=[]` → SystemExit
- `test_gate_blocks_incomplete_with_unresolved`: `required=T, complete=F, unresolved=[{item, deferred:F}]` → SystemExit
- `test_gate_passes_complete_all_deferred`: `required=T, complete=T, unresolved=[{item, deferred:T}]` → no block

Verification: `cd docs/operations/codex-skills/feature-factory && python -m pytest tests/ -q`

---

## Wave 4: Cleanup + SKILL.md

**Files:** `docs/operations/codex-skills/feature-factory/scripts/factory_state.py`,
           `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`,
           `docs/operations/codex-skills/feature-factory/SKILL.md`

### Task 4.1 — Remove `question_count`/`asked_count` from `default_discovery_state()`
Remove the two keys. Replace any reads of `discovery["question_count"]` or
`discovery["asked_count"]` in `run_factory.py` with `len(discovery.get("questions", []))`.

### Task 4.2 — Remove `--count` flag from `command_discover` subparser
Remove `parser.add_argument("--count", ...)` and all `args.count` references in
`command_discover()`. Replace count-based guards with `len(discovery["questions"])`.

### Task 4.3 — Update `migrate_discovery_state()` for count fields
Add to migration: `d.pop("question_count", None)` and `d.pop("asked_count", None)`.

### Task 4.4 — Update tests asserting count fields
Update ~4 tests that assert `discovery["question_count"]` or `discovery["asked_count"]`.
Remove those assertions or replace with `len(discovery["questions"])` checks.

### Task 4.5 — Update SKILL.md discovery section
Update the discovery section to describe:
- V2 fields: `answers`, `non_goals`, `acceptance_criteria`, `unresolved`
- New CLI flags: `--unresolved`, `--resolve`, `--non-goal`, `--acceptance-criteria`, `--answer`
- Gate semantics: blocked if `complete=False` OR non-deferred items in `unresolved[]`

Verification: `cd docs/operations/codex-skills/feature-factory && python -m pytest tests/ -q`
All 54+ tests must pass.
