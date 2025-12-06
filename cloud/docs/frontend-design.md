# Frontend Design

> Part of [Cloud ValueRank Architecture](./architecture-overview.md)
>
> See also: [Product Specification](./product-spec.md) for context on these decisions

## Recommendation: React + TypeScript + Vite

The existing DevTool provides a solid foundation. Same tech stack for Cloud.

## Features by Phase

### Phase 1: Core Pipeline
1. **Simple Auth**: Login form (email/password), JWT token storage
2. **Definition Editor**: Create/edit/fork scenario definitions
3. **Run Dashboard**: List runs with status, progress (polling-based)
4. **Queue Controls**: Pause/resume/cancel buttons
5. **Results Viewer**: Basic analysis, per-model scores

### Phase 2: Experimentation
6. **Run Comparison**: Side-by-side delta analysis
7. **Experiment Management**: Create experiments, track hypothesis
8. **Version Tree**: Visualize definition lineage

### Phase 3: AI Integration
9. **API Key Manager**: Generate keys for MCP access

### Deferred
- ~~Real-time Progress~~: Polling (5s) is sufficient
- ~~Deep Analysis (PCA, outliers)~~: Tier 1+2 first
- ~~Sampled Runs~~: Nice to have
- ~~Multi-tenancy~~: Not needed (single tenant)

## Component Architecture

```
src/
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx           # Simple email/password
│   │   └── ApiKeyManager.tsx       # Generate MCP keys
│   ├── definitions/
│   │   ├── DefinitionEditor.tsx    # (port from DevTool)
│   │   ├── DefinitionList.tsx      # With version tree view
│   │   ├── DefinitionFork.tsx      # Fork with label
│   │   └── VersionTree.tsx         # Visualize lineage (Phase 2)
│   ├── runs/
│   │   ├── RunDashboard.tsx        # List all runs
│   │   ├── RunProgress.tsx         # Polling-based progress
│   │   ├── RunControls.tsx         # Pause/resume/cancel
│   │   ├── RunConfig.tsx           # Model selection
│   │   └── ResultsViewer.tsx       # Basic analysis display
│   ├── analysis/
│   │   ├── BasicStats.tsx          # Tier 1: Win rates, scores
│   │   ├── ModelAgreement.tsx      # Tier 2: Correlations
│   │   └── DimensionImpact.tsx     # Tier 2: Which dimensions matter
│   ├── comparison/
│   │   ├── RunComparison.tsx       # Side-by-side delta view
│   │   ├── DeltaChart.tsx          # Visualize differences
│   │   └── DivergenceTable.tsx     # Most divergent scenarios
│   ├── experiments/
│   │   ├── ExperimentList.tsx      # All experiments
│   │   ├── ExperimentDetail.tsx    # Runs within experiment
│   │   └── HypothesisTracker.tsx   # Track outcomes
│   └── queue/
│       └── QueueStatus.tsx         # Global queue stats
├── hooks/
│   ├── usePolling.ts               # Generic polling hook
│   ├── useRunProgress.ts           # Poll run status (5s)
│   └── useAuth.ts                  # JWT token management
└── api/
    └── client.ts                   # API client with auth headers
```

## State Management

Recommended approach:
- **urql** or **Apollo Client** for GraphQL queries
- Built-in polling support (`pollInterval: 5000` for active runs)
- Optimistic updates for mutations (pause/resume/cancel)
- **Zustand** or React Context for UI state (current view, filters)

### GraphQL Client Setup

```typescript
// api/client.ts
import { createClient, cacheExchange, fetchExchange } from 'urql';

export const client = createClient({
  url: '/graphql',
  exchanges: [cacheExchange, fetchExchange],
  fetchOptions: () => ({
    headers: { Authorization: `Bearer ${getToken()}` },
  }),
});
```

### Example Query Hook

```typescript
// hooks/useRunProgress.ts
import { useQuery } from 'urql';

const RUN_PROGRESS_QUERY = `
  query RunProgress($id: ID!) {
    run(id: $id) {
      status
      progress { total completed failed }
    }
  }
`;

export function useRunProgress(id: string, isActive: boolean) {
  return useQuery({
    query: RUN_PROGRESS_QUERY,
    variables: { id },
    pollInterval: isActive ? 5000 : undefined,
  });
}
```

## Key UI Flows

### Run Creation Flow
1. Select definition (with version tree browser)
2. Choose models to evaluate
3. Configure sampling (10%, 50%, 100%)
4. Review estimated cost
5. Start run → redirect to progress view

### Analysis Flow
1. View run dashboard
2. Select completed run
3. View basic analysis (instant)
4. Trigger deep analysis (10-30s, async)
5. Explore PCA, correlations, outliers
6. Read LLM-generated summary

### Comparison Flow
1. Select baseline run
2. Select comparison run (or create variant)
3. View delta analysis
4. Highlight most divergent scenarios
5. Statistical significance indicators

## Components from DevTool to Reuse

- `ScenarioEditor` → `DefinitionEditor` - Definition authoring
- `ScenarioGenerator` - AI-assisted generation (if needed)
- Chart components (Recharts-based)

## Components to Build New

| Component | Phase | Complexity |
|-----------|-------|------------|
| LoginForm | 1 | Low - simple form |
| DefinitionList | 1 | Medium - with tree view |
| RunDashboard | 1 | Medium - list with filters |
| RunProgress | 1 | Low - polling-based |
| ResultsViewer | 1 | Medium - tables and charts |
| RunComparison | 2 | Medium - side-by-side layout |
| ExperimentList | 2 | Medium - grouping runs |
| VersionTree | 2 | Medium - DAG visualization |
| ApiKeyManager | 3 | Low - simple CRUD |

## What We're NOT Building

| Feature | Reason |
|---------|--------|
| WebSocket integration | Polling is sufficient |
| Complex auth flows | Internal team, simple JWT |
| User management UI | CLI-based for internal team |
| PCA visualization | Defer to later phase |
| Outlier detection UI | Defer to later phase |
| Sampling configuration | Nice to have, not MVP |
