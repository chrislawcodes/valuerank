# 033 — Deduplicate normalizeModelSet

**Status**: Draft
**Created**: 2026-04-09
**Motivation**: Two copies of `normalizeModelSet` exist with a subtle behavioral difference. One rejects whitespace-only strings, the other doesn't. A model ID of `"  "` would pass through one path but be filtered by the other.

---

## Background

`normalizeModelSet` takes an `unknown` value (typically from run config JSON) and returns a sorted `string[]` of model IDs. It's used to compare model sets across runs for dedup/matching logic.

| Location | Visibility | Filter behavior | Extra |
|----------|-----------|----------------|-------|
| `mutations/domain/types.ts:125` | Exported | accepts whitespace-only strings | — |
| `mutations/assumptions.ts:43` | Private | rejects whitespace-only strings via `.trim()` | redundant `.slice()` |

Callers of Version A (types.ts): `launch.ts` (5 calls), `evaluation.ts` (1 call), `queries/domain/evaluation.ts` (1 call)
Callers of Version B (assumptions.ts): `assumptions.ts` (1 call, local)

---

## User Stories

### US-1: Single authoritative normalizeModelSet (P1)

A developer fixing or changing model normalization should only update one function.

**Acceptance**:
- `normalizeModelSet` exists in exactly one location: `mutations/domain/types.ts` (already exported)
- The `assumptions.ts` private copy is removed, replaced by an import
- The surviving version adopts the `.trim()` check (safer behavior)
- `npm run build` and `npm run test` pass

### US-2: Consistent whitespace handling (P1)

Both code paths should handle whitespace model IDs the same way.

**Acceptance**:
- The single `normalizeModelSet` rejects whitespace-only strings (adds `.trim() !== ''`)
- No behavioral change for non-whitespace strings

---

## Requirements

- **FR-001**: `normalizeModelSet` in `types.ts` MUST add `.trim() !== ''` to its filter
- **FR-002**: `normalizeModelSet` in `assumptions.ts` MUST be deleted and replaced with an import from `types.ts`
- **FR-003**: The redundant `.slice()` call MUST NOT be carried over
- **FR-004**: Zero behavioral changes for non-whitespace model IDs

---

## Success Criteria

- **SC-001**: Exactly one `normalizeModelSet` function in the codebase
- **SC-002**: All existing tests pass
- **SC-003**: Lint, build pass

---

## Non-Goals

- Moving `normalizeModelSet` to a utils/ module (it's already well-placed in `types.ts`)
- Adding unit tests for the trim behavior (no existing tests to extend)
- Changing any other normalize* functions
