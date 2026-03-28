# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per cloud/CLAUDE.md)

- [ ] No `any` types introduced — use `string | null` explicitly
- [ ] Strict boolean checks: use `== null` / `!= null` not `!value` for string/number fields
- [ ] No `console.log` — these are pure utility functions, no logging needed
- [ ] File sizes stay under 400 lines (both files are currently well under)

## Direction Removal Completeness

- [ ] `canonical.direction` not read in `getCanonicalBucket`
- [ ] `canonical.direction` not read in `getConditionDecisionBucketKey`
- [ ] `canonical.direction` not read in `resolveConditionDecisionLabelPair`
- [ ] Neutral detection uses `canonical.strength === 'neutral'` (not direction)
- [ ] `PairLabelStats` type no longer has `firstPositionCounts` field

## Scope Boundary (DO NOT touch)

- [ ] `transcriptDecisionModel.ts` unchanged — direction reads there are state guards + sort ordering
- [ ] `AnalysisTranscripts.tsx` unchanged — direction read is an unknown-state filter
- [ ] `runs.ts` type unchanged — `direction` field stays in `TranscriptDecisionModelV2Canonical`
- [ ] No backend files modified
- [ ] CLAUDE.md, AGENTS.md, MEMORY.md, .gitignore unchanged

## Alphabetical Ordering Logic

- [ ] `favoredValueKey.localeCompare(opposedValueKey) < 0` means favored value is "first" (blue)
- [ ] `favoredValueKey.localeCompare(opposedValueKey) > 0` means favored value is "second" (orange)
- [ ] `localeCompare === 0` (equal keys) is treated as non-first → unknown/null return — acceptable for malformed data
- [ ] Both functions handle `favoredValueKey == null || opposedValueKey == null` before calling localeCompare
