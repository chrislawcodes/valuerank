# Implementation Plan: Stage 9 - Run Execution & Basic Export

**Branch**: `feature/stage-9-run-execution` | **Date**: 2025-12-07 | **Spec**: [spec.md](./spec.md)

## Summary

Implement the frontend UI for run execution, progress monitoring, results viewing, and CSV export. The backend infrastructure (GraphQL mutations, services, queue, workers) is already complete from Stages 5-6. This stage focuses on building React components to connect the definition management UI to the existing run system.

---

## Technical Context

| Attribute | Value |
|-----------|-------|
| **Language/Version** | TypeScript 5.3+ |
| **Frontend** | React 18, Vite, urql, Tailwind CSS |
| **Backend** | Express, GraphQL Yoga, Pothos, PgBoss |
| **Database** | PostgreSQL with Prisma ORM |
| **Testing** | Vitest, React Testing Library |
| **Build** | Turborepo monorepo |
| **Performance Goals** | Progress updates <6s latency, results page <2s load, CSV export <10s |
| **Constraints** | Files <400 lines, 80%+ test coverage, no `any` types |

---

## Constitution Check

**Status**: PASS

| Requirement | Compliance |
|-------------|------------|
| Files < 400 lines | PASS - Components split by concern |
| No `any` types | PASS - Strict TypeScript |
| Test coverage 80%+ | PASS - Required in spec |
| Structured logging | PASS - API uses pino logger |
| Custom error classes | PASS - Using existing AppError |
| Prisma type safety | PASS - Using existing patterns |

---

## Architecture Decisions

### Decision 1: Leverage Existing Backend Infrastructure

**Chosen**: Use existing GraphQL mutations and services from Stages 5-6

**Rationale**:
- `startRun`, `pauseRun`, `resumeRun`, `cancelRun` mutations already implemented
- Run and Transcript types already defined in GraphQL schema
- PgBoss queue integration complete
- Python workers operational

**What Already Exists**:
```
apps/api/src/
├── graphql/
│   ├── mutations/run.ts    # startRun, pauseRun, resumeRun, cancelRun
│   ├── queries/run.ts      # run, runs
│   ├── types/run.ts        # Run type with progress, transcripts
│   └── types/transcript.ts # Transcript type
├── services/
│   └── run/
│       ├── start.ts        # Run creation + job queuing
│       ├── control.ts      # Pause/resume/cancel logic
│       └── progress.ts     # Progress calculation
└── queue/
    └── handlers/           # Job handlers for probe_scenario
```

**What Needs to Be Added**:
- CSV export endpoint (REST, not GraphQL - for file download)
- Available models query (for model picker)
- Access tracking middleware (lastAccessedAt updates)
- System health/status endpoints (LLM providers, queue, workers)
- Expanded scenarios query (with full prompt text)

---

### Decision 2: System Health Validation (Phase 2b)

**Chosen**: Dedicated Settings panel with LLM provider status + queue/worker health checks

**Rationale**:
- Must validate Stages 5-6 integration before run UI is useful
- Users need visibility into provider connectivity (not just key existence)
- Queue/worker status prevents mysterious "jobs not processing" issues
- Pattern established in devtool (see `devtool/src/client/App.tsx` lines 328-362)

**Components**:
1. **LLM Provider Status** (Settings page):
   - Lists all supported providers (OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral)
   - Shows for each: icon, name, configured (key exists), connected (health check passed)
   - Triggers health check on page load or manual refresh

2. **Queue Worker Status**:
   - Shows if PgBoss worker is connected and processing
   - Shows recent job throughput (completed/failed in last hour)
   - Warning if worker appears offline

3. **Python Worker Health**:
   - Runs health_check.py on first job (lazy check)
   - Shows Python version, package status, API key validation
   - Results cached to avoid repeated checks

4. **Expanded Scenarios View** (Definition detail):
   - Query scenarios from database (not just frontend preview)
   - Show dimension values and full prompt text
   - Confirm scenarios were properly generated/stored

**Health Check Flow**:
```
User visits Settings
  → Frontend calls GET /api/health/providers
  → Backend tests each provider with minimal API call
  → Returns { providers: [{ id, name, configured, connected, error? }] }

User views Definition
  → Frontend queries scenarios { where: { definitionId } }
  → Shows list with expandable prompt text
```

---

### Decision 3: Polling-Based Progress Updates

**Chosen**: urql polling with 5-second interval

**Rationale**:
- Per product spec: "Use polling (5-second intervals) instead of GraphQL subscriptions"
- urql built-in polling support via `pollInterval` option
- Stop polling when run reaches terminal state

**Implementation**:
```typescript
// useRunProgress hook pattern
const [result] = useQuery({
  query: RUN_PROGRESS_QUERY,
  variables: { id: runId },
  pollInterval: isActive ? 5000 : undefined,
  requestPolicy: 'network-only', // Always fresh data
});
```

**Alternatives Considered**:
- GraphQL subscriptions: More complex, not needed per spec
- Shorter polling interval: Unnecessary API load

---

### Decision 3: CSV Export via REST Endpoint

**Chosen**: REST endpoint `/api/export/runs/:id/csv` with streaming response

**Rationale**:
- File downloads work better with REST than GraphQL
- Can stream large exports without buffering
- Browser handles download natively

**Implementation**:
```typescript
// apps/api/src/routes/export.ts
router.get('/runs/:id/csv', authMiddleware, async (req, res) => {
  const transcripts = await getRunTranscripts(req.params.id);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="run_${req.params.id}_${date}.csv"`);

  // BOM for Excel compatibility
  res.write('\uFEFF');
  res.write(csvHeader);
  for (const transcript of transcripts) {
    res.write(transcriptToCSVRow(transcript));
  }
  res.end();
});
```

**Alternatives Considered**:
- GraphQL mutation returning download URL: Adds complexity for temporary URLs
- Base64 in GraphQL response: Memory issues for large exports

---

### Decision 4: Run Form as Modal/Dialog

**Chosen**: Modal dialog triggered from Definition detail page

**Rationale**:
- Keep run creation close to definition context
- Follow existing dialog pattern (ForkDialog)
- Avoid full page navigation for quick operation

**Flow**:
1. User views definition detail → Click "Start Run" button
2. Modal opens with model selection and options
3. On submit: Create run, redirect to run detail page
4. Modal can also be opened from Runs page with definition picker

---

### Decision 5: Results Display Without Analysis

**Chosen**: Simple score table without charts/visualizations (deferred to Stage 11)

**Rationale**:
- Stage 9 scope is basic results viewer
- Analysis and visualizations come in Stage 11
- Show raw data: per-model scores, transcript counts, completion status

**What to Show**:
- Summary: Total scenarios, models, completion status
- Per-model breakdown: Scenario count, completion rate
- Individual transcripts: Expandable/navigable list
- CSV export button

---

## Project Structure

### Existing Structure (No Changes)

```
apps/api/src/
├── graphql/
│   ├── mutations/run.ts     # Already has startRun, pauseRun, etc.
│   ├── queries/run.ts       # Already has run, runs queries
│   └── types/run.ts         # Already has Run, RunProgress types
├── services/run/            # Already has start, control, progress
└── queue/                   # Already has PgBoss handlers
```

### New/Modified Files

```
apps/api/src/
├── routes/
│   ├── export.ts            # NEW: CSV export endpoint
│   └── health.ts            # MODIFY: Add provider health checks
├── graphql/
│   └── queries/
│       ├── models.ts        # NEW: Available models query
│       ├── scenarios.ts     # NEW: Expanded scenarios query
│       └── health.ts        # NEW: System health queries
├── services/
│   └── health/
│       ├── providers.ts     # NEW: LLM provider health checks
│       ├── queue.ts         # NEW: Queue status checks
│       └── workers.ts       # NEW: Python worker health
├── middleware/
│   └── access-tracking.ts   # NEW: Update lastAccessedAt

apps/web/src/
├── components/
│   ├── settings/            # NEW: Settings components
│   │   ├── ProviderStatus.tsx    # LLM provider health display
│   │   ├── QueueStatus.tsx       # Queue worker status
│   │   └── SystemHealth.tsx      # Combined health panel
│   ├── definitions/
│   │   └── ExpandedScenarios.tsx # NEW: Show DB scenarios
│   └── runs/                # NEW: All run components
│       ├── RunForm.tsx           # Run creation form/modal
│       ├── ModelSelector.tsx     # Multi-select model picker
│       ├── RunCard.tsx           # Run list item
│       ├── RunProgress.tsx       # Progress bar + per-model breakdown
│       ├── RunControls.tsx       # Pause/Resume/Cancel buttons
│       ├── RunResults.tsx        # Results summary table
│       ├── TranscriptList.tsx    # Transcript listing
│       └── TranscriptViewer.tsx  # Single transcript detail
├── hooks/
│   ├── useSystemHealth.ts       # NEW: Provider/queue/worker health
│   ├── useExpandedScenarios.ts  # NEW: DB scenarios for definition
│   ├── useRuns.ts               # NEW: List runs query
│   ├── useRun.ts                # NEW: Single run + polling
│   ├── useRunMutations.ts       # NEW: Start/pause/resume/cancel
│   └── useAvailableModels.ts    # NEW: Model list for picker
├── pages/
│   ├── Runs.tsx                 # MODIFY: Implement run dashboard
│   └── RunDetail.tsx            # NEW: Single run view
└── api/
    └── export.ts                # NEW: CSV download helper
```

---

## GraphQL Schema Additions

### New Query: availableModels

```graphql
type Query {
  """
  List available LLM models for running evaluations.
  Returns models with configured API keys.
  """
  availableModels: [AvailableModel!]!
}

type AvailableModel {
  id: ID!                    # e.g., "gemini-1.5-pro"
  providerId: String!        # e.g., "google"
  displayName: String!       # e.g., "Gemini 1.5 Pro"
  versions: [String!]!       # e.g., ["gemini-1.5-pro-001", "gemini-1.5-pro-002"]
  defaultVersion: String
  isAvailable: Boolean!      # API key configured
}
```

### Existing (No Changes Needed)

The following already exist and support Stage 9 requirements:

```graphql
# mutations/run.ts
mutation startRun(input: StartRunInput!): StartRunPayload!
mutation pauseRun(runId: ID!): Run!
mutation resumeRun(runId: ID!): Run!
mutation cancelRun(runId: ID!): Run!

# queries/run.ts
query run(id: ID!): Run
query runs(definitionId: ID, status: String, limit: Int, offset: Int): [Run!]!

# types/run.ts
type Run {
  id: ID!
  status: String!
  progress: JSON
  runProgress: RunProgress
  transcripts(modelId: String): [Transcript!]!
  definition: Definition!
  recentTasks(limit: Int): [TaskResult!]!
  # ... other fields
}

type RunProgress {
  total: Int!
  completed: Int!
  failed: Int!
  percentComplete: Float!
}
```

---

## REST API Additions

### CSV Export Endpoint

```
GET /api/export/runs/:id/csv

Headers:
  Authorization: Bearer <jwt>

Response:
  Content-Type: text/csv; charset=utf-8
  Content-Disposition: attachment; filename="run_{id}_{date}.csv"

CSV Columns:
  scenario_id, model_id, model_version, decision, turn_count, word_count,
  duration_ms, created_at, run_id

Notes:
  - UTF-8 with BOM for Excel compatibility
  - Streams response for large exports
  - Requires authentication
```

---

## Component Specifications

### RunForm (Modal)

**Purpose**: Configure and start a new run

**Props**:
```typescript
interface RunFormProps {
  definitionId: string;
  onClose: () => void;
  onSuccess: (runId: string) => void;
}
```

**Features**:
- Model multi-select with provider grouping
- Optional model version selection per model
- Shows scenario count from definition
- Submit creates run and redirects to detail page

---

### RunProgress

**Purpose**: Show real-time progress for active run

**Props**:
```typescript
interface RunProgressProps {
  runId: string;
  status: RunStatus;
  progress: { total: number; completed: number; failed: number };
  onStatusChange?: (status: RunStatus) => void;
}
```

**Features**:
- Overall progress bar with percentage
- Per-model breakdown (if multiple models)
- Failed task count highlighted in red
- Auto-polls every 5s when status is RUNNING/PENDING
- Stops polling when terminal state reached

---

### RunControls

**Purpose**: Pause/Resume/Cancel actions

**Props**:
```typescript
interface RunControlsProps {
  runId: string;
  status: RunStatus;
  onStatusChange: (status: RunStatus) => void;
}
```

**Features**:
- Pause button (RUNNING → PAUSED)
- Resume button (PAUSED → RUNNING)
- Cancel button with confirmation (any active → CANCELLED)
- Disabled states based on current status
- Loading states during mutation

---

### RunResults

**Purpose**: Display completed run results

**Props**:
```typescript
interface RunResultsProps {
  runId: string;
  transcripts: Transcript[];
}
```

**Features**:
- Summary stats: total scenarios, models, completion rate
- Per-model table: model name, version, transcript count, completion rate
- Expandable rows to see individual transcripts
- CSV export button
- Click transcript to view detail

---

## Testing Strategy

### Unit Tests (Vitest)

**Components** (apps/web/src/components/runs/):
- RunForm: Form validation, model selection, submission
- RunProgress: Progress calculation, polling behavior, status changes
- RunControls: Button states, mutation calls, confirmation dialogs
- RunResults: Data formatting, CSV export trigger

**Hooks** (apps/web/src/hooks/):
- useRuns: Query variables, pagination
- useRun: Polling behavior, data transformation
- useRunMutations: Success/error handling

### Integration Tests (apps/api/tests/)

- CSV export endpoint: Auth, data format, large exports
- Access tracking: lastAccessedAt updates on queries

### Coverage Targets

| Package | Target |
|---------|--------|
| @valuerank/api | 80%+ (maintain current ~89%) |
| @valuerank/web | 80%+ (new components) |

---

## Implementation Phases

### Phase 1: Backend Additions
1. Available models query
2. CSV export endpoint
3. Access tracking middleware

### Phase 2: Core Run UI Hooks
4. Run hooks (useRuns, useRun, useRunMutations)
5. Available models hook

### Phase 2b: System Health & Validation (E2E Integration)
6. Provider health check service + endpoint
7. Queue status service + endpoint
8. Python worker health integration
9. SystemHealth components (ProviderStatus, QueueStatus)
10. Settings page integration
11. ExpandedScenarios component for definition detail
12. useSystemHealth + useExpandedScenarios hooks
13. **E2E Validation**: Manual test run to verify full pipeline

### Phase 3: Run Creation UI
14. ModelSelector component
15. RunForm modal
16. RunProgress component with polling
17. RunControls component
18. Integration with DefinitionDetail

### Phase 4: Results & Dashboard
19. RunResults component
20. TranscriptList/TranscriptViewer
21. Runs page implementation
22. RunDetail page

### Phase 5: Export & Polish
23. CSV export integration
24. Access tracking verification
25. Edge case handling
26. Tests

---

## Dependencies

### NPM Packages (Already Installed)
- urql (GraphQL client with polling)
- lucide-react (icons)
- tailwindcss (styling)

### No New Dependencies Required

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Large transcript exports timeout | Stream CSV, don't buffer in memory |
| Polling hammers server | Stop polling on terminal state, network-only policy |
| Model versions out of date | Query available models on form open |
| Race condition on pause/cancel | Optimistic UI + refetch after mutation |

---

## Out of Scope (Deferred)

- Analysis visualizations (Stage 11)
- Cost estimation (Stage 10)
- Experiment linking (Stage 10)
- Re-run to different model version UI (P3, stretch goal)
- Sampling configuration (Stage 16)
