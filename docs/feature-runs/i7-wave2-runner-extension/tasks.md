# Wave 2 Tasks

- [x] Add `migrate_discovery_state` import to run_factory.py
- [x] Patch `discovery_state()` to call migration after merge
- [x] Remove V1 version early-exit guard from `command_discover()`
- [x] Add V2 flags to --clear mutual-exclusion check
- [x] Add V2 flags to "at least one update" check
- [x] Add V2 mutation handlers inside `mutate()` (answer, unresolved, resolve, defer, non-goal, acceptance-criteria)
- [x] Register V2 flags on `discover_parser`
- [x] Extend status display to print V2 fields
- [x] Update V1 test fixtures to include V2 keys
- [x] Add 6+ new tests for V2 flag behavior
- [x] All 74 tests passing
