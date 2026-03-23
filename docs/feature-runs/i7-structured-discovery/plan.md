# I-7: Structured Discovery State — Plan

## Spec Review Reconciliation

### Gemini requirements-adversarial

**Finding 1 (Fragile text-based identifiers):** Accepted as a known limitation.
`answers{}` keyed by question text and `--resolve TEXT` with exact-match are fragile for
human use but acceptable for V1 agent-operated workflows. Agents write what they read.
The risk of typos/rewording is low in practice. Deferred to future improvement.
Status: **accepted-limitation**

**Finding 2 (Ambiguous state logic for `deferred`):** Addressed in plan.
Deferred items in `unresolved[]` do NOT block checkpoint. Gate logic: block only when
`any(not item.get("deferred", False) for item in unresolved)`. Status: **resolved**

**Finding 3 (Incomplete CRUD):** Accepted as out of scope.
Factory is agent-operated; edit/delete deferred. Status: **accepted-limitation**

**Finding 4 (Optimistic migration):** Addressed. Migration handles malformed fields
gracefully: treat non-list fields as empty lists, skip None values.
Migration also populates `unresolved[]` from existing V1 `questions[]` when `required=true`
and `complete=false`. Status: **resolved**

**Finding 5 (Remove `question_count`/`asked_count` earlier):** Disagree.
Runner has 33 references to these fields — removing in Wave 1 breaks the runner.
Wave 4 cleanup is correct ordering. Status: **accepted-disagreement**

### Gemini edge-cases-adversarial

**Finding 1 (Migration leaves `unresolved[]` empty for existing questions):** Resolved.
`migrate_discovery_state()` populates `unresolved[]` from existing `questions[]` when
`required=true` and `complete=false`. When `complete=true`, leaves `unresolved[]` empty
(respects the explicit completion). Status: **resolved**

**Finding 2 (Brittle text-based identifiers):** Same as Gemini req finding 1.
Status: **accepted-limitation**

**Finding 3 (`--resolve` ambiguity):** Addressed. `--resolve` uses exact full-string
match, case-sensitive. Error if no match found (lists current items). Status: **resolved**

**Finding 4 (`deferred` undefined):** `deferred` is boolean. Deferred items display in
status but do not block checkpoint. Status: **resolved**

**Residual risk (`complete` flag ambiguity):** Addressed. Full gate semantics:
checkpoint blocked if `complete=False` OR any non-deferred item in `unresolved[]`.
Status: **resolved**

### Codex feasibility-adversarial

**Finding 1 (Text-based identifiers):** Same. Status: **accepted-limitation**

**Finding 2 (Migration not persisted):** Resolved. Wave 2 writes migrated state back
to disk so V1 blobs become V2 permanently on first access. Status: **resolved**

**Finding 3 (`deferred` semantics):** Resolved. See above. Status: **resolved**

**Finding 4 (CLI deduplication/substring behavior):** Resolved. Exact full-string
match for `--resolve`. Deduplication for `--unresolved`/`--non-goal`/`--acceptance-criteria`.
`--answer` requires question already in `questions[]`; upserts otherwise. Status: **resolved**

**Finding 5 (`complete=False` with empty `unresolved[]`):** Resolved.
Full gate: block if `required=True AND (complete=False OR any non-deferred unresolved)`.
Status: **resolved**

---

## Implementation Plan

### Wave 1 — Schema Extension + Migration Function (`factory_state.py` only)
- `default_discovery_state()`: add V2 fields (`answers: {}`, `non_goals: []`,
  `acceptance_criteria: []`, `unresolved: []`), bump `version` to 2
- `migrate_discovery_state(d: dict) -> dict`: pure function, V1 to V2:
  - Adds all missing V2 fields with correct defaults, sets `version: 2`
  - Preserves all existing data
  - If `required=true` and `complete=false`: populates `unresolved[]` from `questions[]`
  - Handles malformed fields: non-list treated as empty list, None skipped
- New tests: 8-10 tests covering default state keys, V1 to V2 upgrade, V2 no-op,
  malformed field handling, unresolved population from questions

### Wave 2 — Migration Wire-up + New CLI Flags (`run_factory.py` + tests)
- `discovery_state()`: apply migration then write back to disk if version changed
- `command_discover()`: add `--unresolved`, `--resolve`, `--non-goal`,
  `--acceptance-criteria`, `--answer` with exact-match and deduplication semantics
- Update 7 existing tests that assume V1 discovery shape to include V2 fields

### Wave 3 — Enforceable Gate + Status (`run_factory.py` + tests)
- `command_checkpoint()`: extend gate to block on non-deferred unresolved items
  Full gate: `required AND (not complete OR any(not i.get("deferred") for i in unresolved))`
- `recommended_next_action()`: same check
- `command_status()`: display unresolved items with deferred/blocking distinction
- Add gate tests

### Wave 4 — Cleanup + SKILL.md
- Remove `question_count`/`asked_count` from default state and write paths
- Remove `--count` CLI flag from `command_discover`
- Update SKILL.md discovery section
- Update ~4 tests that assert old count fields

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: 5 findings: text-key fragility accepted-limitation for agent use; deferred flag resolved: deferred items skip gate; CRUD incomplete accepted-limitation; migration handles malformed fields + populates unresolved from V1 questions when required+incomplete; Wave 4 ordering correct — runner has 33 refs to count fields
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: 4 findings: migration will populate unresolved from V1 questions when required+incomplete; text-key fragility accepted-limitation; resolve uses exact full-string match; deferred is boolean and skips gate. complete flag clarified: gate is required AND (not complete OR any non-deferred unresolved)
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: 5 findings: text-key fragility accepted-limitation; migration persisted to disk in Wave 2; deferred items skip gate; CLI uses exact-match + deduplication; full gate defined: required AND (not complete OR any non-deferred unresolved)
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Finding 1: --answer semantics fixed: require question exists in questions[], error otherwise. --answer also clears matching item from unresolved[]. Finding 2: --resolve matches against item key of unresolved dict, removes first exact match. Finding 3: migration transforms each questions[] entry into {item: question_text, deferred: false} dict in unresolved[]. Migration write-back uses existing atomic_json_write.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Finding 1: write-back uses atomic_json_write which is already tested; tests mock atomic_json_write. Finding 2: gate test matrix defined in tasks: 5 explicit cases (required+complete+empty, required+complete+unresolved, required+incomplete+empty, required+incomplete+unresolved, required+complete+deferred-only). Finding 3: migration excludes answered questions from unresolved — moot for V1 (no answers dict), V2 --answer already clears from unresolved. Finding 4: --answer strictly requires question in questions[], no upsert.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Finding 1 (--answer never closes loop): fixed. --answer now also clears from unresolved[]. Finding 2 (migration trusts complete=true): accepted trade-off — explicit completion is respected. Finding 3 (atomicity): write-back uses atomic_json_write with temp-file+os.replace. Finding 4 (malformed unresolved entries): migration sanitizes unresolved[] — non-dict entries dropped, only {item, deferred} dicts preserved.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Findings 1,3 (flag order, race condition): accepted for single-agent CLI. Finding 2 (migration idempotency): scenario requires manual V1 JSON editing while using V2 CLI; accepted-limitation. Finding 4 (error messages): --resolve/--defer errors will list current unresolved items, consistent with --answer. Finding 5 (whitespace question text): filter with text.strip() in migration. Finding 6 (vague test scope): lines specified.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Finding 1 (dirty V2 not cleaned): Wave 4 handles count field removal from new writes; migration skips V2 by design. Finding 2 (deferred type check): using i.get('deferred') is not True for strict boolean check. Finding 3 (complete field string type): gate uses explicit bool() cast. Finding 4 (answer overwrite): upsert is intended behavior. Finding 5 (missing gate malformed test): added to Task 3.4.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Finding 1 (complete=False still blocks after all deferred): INTENTIONAL — complete is explicit sign-off; gate requires both conditions. Not a bug. Finding 2 (V2 missing fields not normalized): accepted; V2 blobs are produced by our own code and will have all fields. Finding 3 (asked_count semantic): asked_count==len(questions) confirmed in runner at line 1396; purely redundant.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: non-string hashable item edge case theoretical; our schema always produces string item values. Low severity, deferred.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: try/except scope acceptable for Wave 1; None-question silent skip is intentional improvement. Medium findings deferred.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: decimal/numpy impossible in JSON state files. Non-hashable item drop is intentional to prevent crashes; structured item payloads not valid in this schema.
