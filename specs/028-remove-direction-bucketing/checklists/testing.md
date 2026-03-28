# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per cloud/CLAUDE.md)

- [ ] `npm run lint --workspace @valuerank/web` — zero errors
- [ ] `npm run test --workspace @valuerank/web` — all tests pass (1458+ baseline)
- [ ] `npm run build --workspace @valuerank/web` — clean compile

## New Test Coverage

- [ ] `canonicalConditionSummary.test.ts` — new test: transcript where `favoredValueKey` is alphabetically second gets bucketed as `opponentStrongly` (not `strongly`)
- [ ] `conditionDecisionSummary.test.ts` — new test: all-Harmony-wins scenario where Harmony is alphabetically second → counts land in `strong_second`, labels are `firstValueLabel='Freedom', secondValueLabel='Harmony'`

## Regression Guard

- [ ] All pre-existing `canonicalConditionSummary.test.ts` tests still pass (existing fixtures use `value-a`/`value-b` where `value-a < value-b` alphabetically — behavior unchanged)
- [ ] All pre-existing `conditionDecisionSummary.test.ts` tests still pass (Freedom < Harmony alphabetically — existing expected values remain correct)
- [ ] No other test files affected (neither utility is a transitive dependency that would flip other tests)

## Behavioral Change Documentation

- [ ] PR description notes that for single-run batches where `valueA` sorted alphabetically after `valueB`, the blue/orange assignment will flip from the old behavior — this is intentional and correct
