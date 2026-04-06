# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [pivot-canonical-fix](../tasks.md)

## Code Quality (per cloud/CLAUDE.md)

- [ ] No `any` types — use `Transcript[]`, `CanonicalConditionSummary`, typed props
  - Reference: constitution § TypeScript Standards
- [ ] Strict boolean checks — use `!= null` not `!value` for numbers/strings
  - Reference: constitution § Strict Boolean Checks
- [ ] No `console.log` — use structured logging if needed (no logging needed here)
  - Reference: constitution § Logging Standards
- [ ] React components stay ≤ 400 lines
  - Reference: constitution § File Size Limits
  - Check: `wc -l cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx`

## TypeScript Safety

- [ ] `transcripts?: Transcript[]` typed correctly (not `any[]`)
- [ ] `companionRunId?: string | null` typed correctly
- [ ] `CanonicalConditionSummary` used from import, not re-declared
- [ ] `displayScore` null-checked before `.toFixed(2)` call
- [ ] `companionRunIdHint` is `string | null`, not `string | undefined` (use `?? null`)

## Import Hygiene

- [ ] Old unused functions removed (`getHeatmapColor`, `getScoreTextColor`)
- [ ] `buildCanonicalTranscriptIndex` import present in PivotAnalysisTable
- [ ] `Transcript` type imported from `../../api/operations/runs` (not redeclared)
- [ ] No circular imports introduced

## Behavior Correctness

- [ ] Single mode: `scenariosTranscripts = transcripts ?? []` (no prefix)
- [ ] Paired mode: canonical transcripts prefixed `canonical:`, flipped prefixed `flipped:`
- [ ] Pivot cell shows `—` when `summary.totalTrials === 0` or `displayScore == null`
- [ ] `handleCellClick` only appends `companionRunId` when it is non-null/non-empty
- [ ] `AnalysisConditionDetail` falls back to `findCompanionPairedRun` when URL param absent (no regression)

## DO NOT TOUCH

- [ ] `ConditionDecisionsTable.tsx` — already on canonical path
- [ ] `cloud/apps/api/` — no API changes
- [ ] `cloud/packages/` — no package changes
- [ ] `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `.gitignore`
