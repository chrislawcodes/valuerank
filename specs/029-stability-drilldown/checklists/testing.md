# Testing Quality Checklist

**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per constitution § Preflight Gate)

Run from `cloud/`:
- [ ] `npm run lint --workspace @valuerank/web` — passes
- [ ] `npm run test --workspace @valuerank/web` — passes
- [ ] `npm run build --workspace @valuerank/web` — passes

## Test Coverage (per constitution § Coverage Targets: 80% line, 75% branch)

- [ ] `PairedPatternMetricButton` render test: count > 0, companion available → button rendered
- [ ] `PairedPatternMetricButton` navigation test: click → URL has `primaryConditionIds` + `companionConditionIds` as separate params
- [ ] `OverviewTab` paired static cell test: count > 0, companion loading → static cell + loading tooltip
- [ ] `OverviewTab` paired static cell test: count = 0 → static text regardless of mode
- [ ] `AnalysisTranscripts` two-section test: `isPairedStabilityDrilldown` → two sections rendered
- [ ] `AnalysisTranscripts` empty-state test: both sections empty → "No transcripts match..." message
- [ ] `AnalysisTranscripts` heading test: `repeatPattern=noisy` → heading shows "Unstable"
- [ ] `AnalysisTranscripts` heading test: `repeatPattern=torn` → heading shows "Torn"

## Manual Smoke Tests (per quickstart.md)

- [ ] US1: Single-run non-zero cell clickable → transcript list opens
- [ ] US1: Single-run zero-count cell → static text, not clickable
- [ ] US2: Paired non-zero cell clickable → two-section transcript list
- [ ] US2: One empty section, one populated → renders correctly (no error)
- [ ] US3: Heading shows pattern name + model name
- [ ] US3: "noisy" pattern → heading says "Unstable"
