# Tasks: Discovery Enforcement

## Slice 1 [CHECKPOINT]

Implement the discovery-enforcement gate as one cohesive slice.

### Scope

- add a pure helper for blocking unresolved discovery items
- define the canonical item identity as normalized item text
- wire the helper into `discover` completion checks
- wire the helper into `checkpoint --stage spec`
- surface the same blocking state in `status`
- make `recommended_next_action` prefer `discover` while blockers remain
- update the maintained plan and skill guidance to match

### Verification Matrix

- `python3 -m py_compile` for the touched Python files
- discovery state helper tests:
  - no unresolved items
  - mixed resolved/deferred/unresolved items
  - malformed discovery item data
- `discover` tests:
  - completion is blocked while unresolved items remain
  - `--force-complete` does not bypass unresolved blockers
  - `--resolve` removes a blocking item
  - `--defer` marks an item as non-blocking debt
- `status` tests:
  - unresolved blockers are visible
  - deferred items remain visible but non-blocking
  - next action points to `discover` while blockers remain
- `checkpoint` tests:
  - spec checkpoint fails while unresolved items remain
  - spec checkpoint passes once blockers are resolved or deferred
- focused feature-factory unit test file:
  - `/Users/chrislaw/valuerank/docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py`

### Estimated Diff

180-240 lines.

### Notes

- The single source of truth for blocking discovery items is the pure helper in
  `factory_state.py`.
- `discover --clear` is reserved for malformed or irrecoverable discovery state, not
  normal blocker resolution.
