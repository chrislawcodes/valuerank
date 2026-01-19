# Implementation Plan: Multi-Sample Runs with Variance Analysis

**Branch**: `feat/deterministic-sampling` | **Date**: 2025-01-18 | **Spec**: [spec.md](./spec.md)

## Summary

Add multi-sample support to evaluation runs by allowing users to configure `samplesPerScenario` (1-100), creating N independent transcripts per scenario-model combination, and computing variance statistics (mean, stdDev, confidence intervals) for display with error bars in the analysis UI.

---

## Technical Context

**Language/Version**: TypeScript 5.x (API + Web), Python 3.11+ (Workers)
**Primary Dependencies**: Prisma ORM, PgBoss job queue, React + Recharts (frontend)
**Storage**: PostgreSQL with JSON/JSONB columns
**Testing**: Vitest (TypeScript), pytest (Python)
**Target Platform**: Docker/Railway
**Performance Goals**:
- Error bars render within 500ms for runs with up to 1000 transcripts (SC-002)
- Linear scaling: 10 samples completes within 10x single-sample time (SC-004)
**Constraints**: Sample counts 1-100, no mixed sample counts per run
**Scale/Scope**: Touches API, Web, Workers; moderate complexity

---

## Constitution Check

**Status**: PASS

### File Size Limits (per constitution)
- All new files will be < 400 lines
- Variance statistics logic will be added to existing `stats/basic_stats.py`
- New UI components will be split if they exceed limits

### Testing Requirements
- 80% minimum line coverage required
- Tests for: startRun with samplesPerScenario, transcript sampleIndex creation, variance calculation accuracy

### TypeScript Standards
- No `any` types - all variance types will be explicitly defined
- Strict mode enabled across all packages

### Database Access
- All queries will use Prisma with proper typing
- Soft delete patterns will be respected for transcripts
- New `sampleIndex` column uses proper migration, not `db push`

**Violations/Notes**: None identified

---

## Architecture Decisions

### Decision 1: Sample Index Storage Location

**Chosen**: Add `sampleIndex` column directly to `Transcript` table

**Rationale**:
- Aligns with existing transcript storage pattern
- Simple integer column (0 to N-1) with default 0 for backwards compatibility
- Enables efficient querying by sample index when needed
- Existing runs with implicit sample count of 1 get sampleIndex=0

**Alternatives Considered**:
- Separate `TranscriptSample` join table: Adds unnecessary complexity for a simple integer
- Store sample index in `Transcript.content` JSON: Harder to query and index

**Tradeoffs**:
- Pros: Simple schema change, easy migration, efficient queries
- Cons: Requires database migration (acceptable per constitution)

---

### Decision 2: Job Queuing Strategy

**Chosen**: Expand job count at queue time (N jobs per scenario-model pair)

**Rationale**:
- Leverages existing `probe_scenario` job type without modification
- Each sample is an independent API call (per spec assumption #3)
- Progress tracking naturally reflects all samples (total = scenarios × models × samples)
- Parallelism and rate limiting work unchanged

**Alternatives Considered**:
- Single job that loops N times: Loses parallelism benefits, harder to track progress
- New `probe_scenario_multi` job type: Unnecessary complexity, duplicates existing logic

**Tradeoffs**:
- Pros: Maximum parallelism, accurate progress, minimal code changes
- Cons: More jobs in queue (acceptable - linear scaling expected)

---

### Decision 3: Variance Calculation Location

**Chosen**: Compute variance in Python `analyze_basic` worker

**Rationale**:
- Existing worker already aggregates transcript data for analysis
- NumPy/SciPy available for accurate statistical calculations
- Variance is computed once at analysis time, not on every view
- Aligns with existing pattern (perModel stats computed in Python)

**Alternatives Considered**:
- Compute in TypeScript API: Would require adding stats libraries, duplicates Python capability
- Compute in frontend: Too expensive for large runs, would slow render

**Tradeoffs**:
- Pros: Leverages existing pipeline, uses battle-tested stats libraries
- Cons: Requires re-running analysis if transcripts change

---

### Decision 4: Frontend Visualization Approach

**Chosen**: Add error bars to existing Recharts bar charts with optional variance tooltip

**Rationale**:
- Recharts supports error bars via `ErrorBar` component
- Minimal changes to existing `AnalysisPanel` and tab components
- Tooltip pattern already exists for showing additional data on hover
- No error bars when samplesPerScenario=1 (matches spec FR-006)

**Alternatives Considered**:
- Box plots for full distribution: More complex, overkill for initial implementation
- Separate variance tab: Fragments the UX, variance should enhance existing views

**Tradeoffs**:
- Pros: Incremental enhancement, familiar UI pattern
- Cons: Error bars can overlap with dense data (mitigated by filtering)

---

### Decision 5: Run Config Schema Extension

**Chosen**: Add `samplesPerScenario` to existing `Run.config` JSONB field

**Rationale**:
- Config JSONB is already used for run parameters (models, samplePercentage, priority)
- No schema migration needed for this field
- Default value of 1 in application code ensures backwards compatibility
- Historical reference preserved (per spec FR-012)

**Alternatives Considered**:
- Dedicated `samples_per_scenario` column: Breaks existing pattern, requires migration
- Store in separate run settings table: Overengineered for single integer

**Tradeoffs**:
- Pros: No database migration for config, consistent with existing pattern
- Cons: Must ensure application code handles missing field with default

---

### Decision 6: ProbeResult Uniqueness Constraint

**Chosen**: Update ProbeResult unique constraint to include `sampleIndex`

**Rationale**:
- Current unique constraint: `@@unique([runId, scenarioId, modelId])`
- With multi-sample, we need: `@@unique([runId, scenarioId, modelId, sampleIndex])`
- This allows multiple probe results per scenario-model combination
- Backwards compatible: existing records have implicit sampleIndex=0

**Alternatives Considered**:
- Remove unique constraint entirely: Loses data integrity protection
- Use composite key with timestamp: Less explicit, harder to query

**Tradeoffs**:
- Pros: Maintains data integrity, explicit sample tracking
- Cons: Requires schema migration

---

## Project Structure

### Multi-Service Structure (cloud/)

```
cloud/
├── apps/api/
│   ├── src/
│   │   ├── services/run/start.ts       # Add samplesPerScenario to input/config
│   │   ├── services/run/progress.ts    # Progress tracking unchanged (counts all jobs)
│   │   ├── services/transcript/        # Add sampleIndex to createTranscript
│   │   ├── graphql/types/inputs/       # Add samplesPerScenario to StartRunInput
│   │   ├── mcp/tools/start-run.ts      # Add samples_per_scenario parameter
│   │   └── queue/handlers/probe-scenario.ts  # Add sampleIndex to job data
│   └── tests/
│       └── services/run/start.test.ts  # Add multi-sample tests
│
├── apps/web/
│   ├── src/
│   │   ├── components/runs/StartRunForm.tsx  # Add samples per scenario input
│   │   ├── components/analysis/tabs/         # Add error bars to charts
│   │   │   ├── OverviewTab.tsx              # Error bars on model comparison
│   │   │   └── DecisionsTab.tsx             # Error bars on decision chart
│   │   └── pages/RunDetail/                  # Progress reflects total samples
│   └── tests/
│
├── packages/db/
│   └── prisma/
│       ├── schema.prisma                     # Add sampleIndex to Transcript/ProbeResult
│       └── migrations/                       # New migration for sampleIndex
│
└── workers/
    ├── probe.py                              # Unchanged (independent samples)
    ├── analyze_basic.py                      # Add variance aggregation
    └── stats/basic_stats.py                  # Add variance computation functions
```

**Structure Decision**: This feature touches 4 services (API, Web, DB, Workers) but the changes are localized:
- API: Input validation, job queuing, transcript creation
- Web: UI for configuration and visualization
- DB: Schema for sampleIndex column
- Workers: Statistical computation only

---

## Implementation Phases

### Phase 1: Database Schema (P1 - Core)
1. Add `sampleIndex Int @default(0)` to Transcript model
2. Add `sampleIndex Int @default(0)` to ProbeResult model
3. Update ProbeResult unique constraint to include sampleIndex
4. Create and apply migration

### Phase 2: API Layer (P1 - Core)
1. Extend `StartRunInput` with `samplesPerScenario` (1-100, default 1)
2. Update `startRun` service to create N jobs per scenario-model pair
3. Pass sampleIndex (0 to N-1) in ProbeScenarioJobData
4. Update probe-scenario handler to save sampleIndex on transcript
5. Update MCP tool input schema
6. Update cost estimate to multiply by samplesPerScenario

### Phase 3: Analysis Worker (P1 - Core)
1. Update `analyze_basic.py` to group transcripts by scenario+model+sample
2. Add variance computation: mean, stdDev, min, max, confidenceInterval
3. Add `sampleCount` field to perModel stats
4. Add `scenarioVariance` section to output
5. Handle samplesPerScenario=1 case (no variance calculated)

### Phase 4: Frontend - Configuration (P1 - Core)
1. Add "Samples per scenario" input to StartRunForm
2. Update estimated job count display (scenarios × models × samples)
3. Update progress display to reflect total sample count

### Phase 5: Frontend - Visualization (P1 - Core)
1. Add error bars to model comparison bar chart in OverviewTab
2. Add variance tooltip (mean, stdDev, range, sampleCount) on hover
3. Conditionally hide error bars when samplesPerScenario=1
4. Add "Most Variable Scenarios" section to ScenariosTab (P2)

### Phase 6: Export Enhancement (P2)
1. Add `sample_index` column to CSV transcript export
2. Add variance stats to JSON analysis export

### Phase 7: Settings & UX Polish (P3)
1. Add default samples per scenario to user settings
2. Add sample-level transcript viewing to TranscriptDetail

---

## Risk Mitigation

### Risk: Cost Explosion with High Sample Counts
**Mitigation**:
- UI shows estimated cost prominently before run starts
- Cost estimate = base estimate × samplesPerScenario
- Consider adding soft warning at > 20 samples

### Risk: Analysis Performance with 1000+ Transcripts
**Mitigation**:
- Variance computation is O(n) with NumPy vectorization
- Existing analysis already handles large transcript sets
- Monitor analysis duration in logs

### Risk: Backwards Compatibility
**Mitigation**:
- Default sampleIndex=0 ensures existing transcripts are valid
- Default samplesPerScenario=1 means existing behavior unchanged
- Analysis gracefully handles runs without variance data

---

## Dependencies

### External Dependencies (already available)
- NumPy/SciPy: Variance, confidence interval calculation
- Recharts ErrorBar: Frontend error bar visualization

### Internal Dependencies
- Prisma schema change must be applied before API changes
- Analysis worker changes must deploy with API changes
- Frontend can be deployed after backend

---

## Testing Strategy

### Unit Tests
- `startRun` with samplesPerScenario creates correct job count
- Variance calculation accuracy (compare to known values)
- Error bar component renders correctly with/without variance

### Integration Tests
- Full pipeline: start run → probe → summarize → analyze → verify variance
- Export includes sample_index column
- GraphQL queries return variance fields

### Manual Testing (see quickstart.md)
- Visual verification of error bars in Analysis tab
- Tooltip shows correct variance information
- Progress tracking reflects total samples
