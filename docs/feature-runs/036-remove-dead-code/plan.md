# Implementation Plan: Remove Dead Code (Round 2)

**Branch**: `claude/brave-williamson` | **Date**: 2026-04-11 | **Spec**: [spec.md](./spec.md)

## Summary

Delete verified-dead service files, queue handlers, CLI scripts, and unused functions. Update barrel files, queue types, and test files that reference deleted code.

## Risk areas

1. **Test files reference dead code** — learned from PR #574 (Settings.test.ts). Every deleted file must have its test file deleted too.
2. **analyze_deep is wired into queue infrastructure** — need to remove from handler index, types, status service, and 4 test files.
3. **audit/query.ts tests** — the audit test file exercises these functions. Remove those test blocks.
4. **Barrel re-exports** — audit/index.ts and health/index.ts re-export dead functions. Must clean up.

## Execution order

1. Delete full files (services, handlers, CLI) + their test files
2. Remove dead functions from live files
3. Update barrel files (audit/index.ts, health/index.ts)
4. Update queue infrastructure (handlers/index.ts, types.ts, status.ts)
5. Update test files that reference analyze_deep and audit queries
6. Lint + build + test

## Verification

1. `npm run lint --workspace @valuerank/api`
2. `npm run build --workspace @valuerank/api`
3. `npm run test --workspace @valuerank/api`
4. `npm run lint --workspace @valuerank/web`
5. `npm run build --workspace @valuerank/web`
6. Grep confirms zero references to deleted symbols
