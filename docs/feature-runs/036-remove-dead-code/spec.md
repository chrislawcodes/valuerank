# 036 — Remove Dead Code (Round 2)

**Status**: Draft
**Created**: 2026-04-11
**Motivation**: Codex-verified dead code remains in the codebase — entire service files, stub queue handlers, unused functions, and CLI scripts that are not in package.json. Removing them reduces confusion and keeps the codebase honest about what's actually active.

---

## Scope

### A. Delete entire files (files + their test files)

| File | Lines | Test file | Test lines |
|------|-------|-----------|------------|
| `services/llm/generate.ts` | 427 | `tests/services/llm/generate.test.ts` | 453 |
| `queue/handlers/analyze-deep.ts` | 41 | `tests/queue/handlers/analyze.test.ts` | ? |
| `services/audit/query.ts` | 100 | References in `tests/services/audit/audit.test.ts` | partial |
| `cli/debug-aggregate-output.ts` | 80 | `cli/debug-aggregate-output.test.ts` | 26 |
| `cli/debug-scenario-structure.ts` | 37 | (none) | 0 |
| `cli/ensure-user.ts` | 68 | `cli/ensure-user.test.ts` | 13 |
| `cli/recompute-aggregates.ts` | 120 | `cli/recompute-aggregates.test.ts` | 54 |

### B. Remove dead functions from live files

| File | Function | ~Lines |
|------|----------|--------|
| `services/analysis/cache.ts` | `getLatestAnalysis()` | 18 |
| `services/analysis/cache.ts` | `getAnalysisHistory()` | 15 |
| `services/preamble/index.ts` | `listPreambles()` | 20 |
| `services/probe-result/index.ts` | `getProbeResults()` | 10 |
| `services/probe-result/index.ts` | `getFailedProbeResults()` | 10 |
| `services/probe-result/index.ts` | `getProbeResultsSummaryByModel()` | 15 |
| `services/health/providers.ts` | `clearProviderHealthCache()` | 10 |
| `services/health/workers.ts` | `clearWorkerHealthCache()` | 10 |

### C. Update barrel files and references

| File | Change |
|------|--------|
| `services/audit/index.ts` | Remove re-export of `queryAuditLogs`, `getEntityAuditHistory` |
| `services/health/index.ts` | Remove re-export of `clearProviderHealthCache`, `clearWorkerHealthCache` |
| `queue/handlers/index.ts` | Remove `analyze-deep` handler import and registration |
| `queue/types.ts` | Remove `'analyze_deep'` from `JobType` union and its payload type |
| `services/queue/status.ts` | Remove `'analyze_deep'` from SQL query and `knownTypes` array |

### D. Update test files that reference analyze_deep

| Test file | Change |
|-----------|--------|
| `tests/queue/handlers/index.test.ts` | Remove analyze_deep test cases |
| `tests/queue/orchestrator.test.ts` | Remove analyze_deep references |
| `tests/graphql/queries/queue.test.ts` | Remove analyze_deep from expected output |
| `tests/services/queue/status.test.ts` | Remove analyze_deep from assertions |

### E. Update audit test file

| Test file | Change |
|-----------|--------|
| `tests/services/audit/audit.test.ts` | Remove `queryAuditLogs` and `getEntityAuditHistory` test blocks |

---

## Requirements

- **FR-001**: All deleted code must have been verified as dead by Codex adversarial review
- **FR-002**: All test files referencing deleted code must be updated or deleted
- **FR-003**: All barrel re-exports of deleted code must be removed
- **FR-004**: The `JobType` union and queue status references must be cleaned up
- **FR-005**: Zero behavioral changes to any live code path

---

## Success Criteria

- **SC-001**: Lint passes with 0 errors
- **SC-002**: Build passes with 0 new errors
- **SC-003**: All tests pass (existing test count may decrease but no new failures)
- **SC-004**: grep for deleted function names returns zero results
