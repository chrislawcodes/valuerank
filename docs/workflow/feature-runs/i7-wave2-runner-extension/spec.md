# Wave 2 Spec: Runner Extension — Migration Wire-up + V2 CLI Flags

## Objective

Wire `migrate_discovery_state()` into `discovery_state()` so all in-memory blobs are V2
regardless of what's on disk. Add new CLI flags to `command_discover()` for populating V2 fields.
Remove the V1-only version guard that blocks V2 state from being displayed.

## Files

- `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`
- `docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py`

## Changes

### run_factory.py

1. Add `migrate_discovery_state` to the `from factory_state import (...)` block
2. In `discovery_state()`: after `.update()` merge, initialize V2 list fields and call `migrate_discovery_state(merged)`
3. Remove the `if discovery.get("version", 1) != 1:` early-exit guard in `command_discover()`
4. Add V2 flag checks to the `--clear` mutual-exclusion guard and the "at least one update" guard
5. Add V2 mutation handlers inside `command_discover.mutate()` for: `--answer`, `--unresolved`, `--resolve`, `--defer`, `--non-goal`, `--acceptance-criteria`
6. Register new argparse flags on `discover_parser`
7. Extend status output section to print V2 fields

### test_run_factory_repair.py

1. Update V1 fixture dicts to include V2 keys with empty defaults
2. Add 6+ new tests for V2 flag behavior

## Do Not Touch

- `factory_state.py`
- `command_checkpoint()` gate logic
- `SKILL.md`
- `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `.gitignore`

## Verification

```bash
cd docs/operations/codex-skills/feature-factory
python -m pytest tests/ -q  # all tests must pass
```
