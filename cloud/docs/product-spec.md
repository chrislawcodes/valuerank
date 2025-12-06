# Cloud ValueRank - Product Specification

> Version 1.0 | December 2024

This document defines the product requirements for Cloud ValueRank's initial release. It captures key product decisions and serves as the source of truth for what we're building.

---

## Product Vision

Cloud ValueRank is an internal tool for evaluating how AI models prioritize moral values in ethical dilemmas. It transforms the existing command-line pipeline into a collaborative, experiment-driven platform.

**Core Value Proposition:** Enable systematic experimentation with scenario framing to understand how small changes affect AI moral reasoning.

---

## Target Users

### Initial Release: Internal Team Only

- Researchers designing moral dilemma scenarios
- Analysts interpreting model behavior
- Engineers iterating on the evaluation pipeline

**Implications:**
- No public registration or onboarding flows
- Simplified authentication (shared credentials or invite-only)
- No billing, usage limits, or abuse protection needed
- All data is visible to all users (public within team)

---

## Key Product Decisions

### 1. Single Tenant Architecture

We will **not** build multi-tenancy. All users share a single workspace.

**Rationale:** Multi-tenancy adds complexity to every query, every UI, and every feature. For internal use, it's unnecessary overhead.

**Migration Note:** If we ever need multi-tenancy, it will require schema changes and data migration. We accept this tradeoff for faster initial development.

### 2. Server-Side LLM API Keys

LLM provider API keys are stored and managed server-side.

**How it works:**
- Admin configures API keys for each provider (OpenAI, Anthropic, etc.) via environment variables or secure config
- All runs use these shared keys
- Users don't need to provide their own keys

**Exception:** Users connecting their local LLM via MCP would use their own local setup.

**Rationale:** Enables async background processing without requiring users to keep browsers open. Simpler UX for internal team.

### 3. Public Visibility (Within Team)

All definitions, runs, experiments, and results are visible to all authenticated users.

**No private data.** Every user can:
- View any definition or run
- Fork any definition
- Compare any runs

**Future consideration:** May add explicit sharing controls if needed, but starting with full transparency.

### 4. Hybrid Version Naming

Definitions use a git-like identity model with optional user-defined labels.

**Implementation:**
- Each definition has a unique system ID (e.g., `def_a1b2c3`)
- Automatic lineage tracking via `parent_id`
- Users can optionally assign display names/labels (e.g., "safety-v2", "experiment-A")
- If no label provided, show truncated ID or auto-generated label

**Example:**
```
def_a1b2c3 (label: "baseline")
├── def_d4e5f6 (label: "softer-framing")
└── def_g7h8i9 (no label, shows as "def_g7h8...")
```

### 5. Transcript Retention: 14 Days

Full transcript content is retained for 14 days after run completion.

**After 14 days:**
- Transcript content is deleted
- Metadata (turn count, timestamps, model, scenario) is retained
- Analysis results (computed from transcripts) are retained indefinitely

**Rationale:** Transcripts are rarely accessed after initial analysis. This controls storage costs while preserving computed insights.

**Adjustment:** Can extend retention if usage patterns show need.

---

## Feature Priorities

### Phase 1: Core Pipeline (Must Have)

| Feature | Description | Why Critical |
|---------|-------------|--------------|
| Definition Authoring | Create/edit scenario definitions with versioning | Foundation for all experiments |
| Run Execution | Queue and execute evaluation runs | Core functionality |
| Results Viewing | View basic analysis and scores | See what happened |
| Run Comparison | Compare two runs side-by-side | Understand deltas |

### Phase 2: Experimentation (Must Have)

| Feature | Description | Why Critical |
|---------|-------------|--------------|
| Experiment Framework | Group runs, track hypotheses, controlled variables | **Primary driver for cloud migration** |
| Forking/Branching | Create variants of definitions | Enable systematic iteration |
| Delta Analysis | Statistical comparison of run differences | Quantify changes |

### Phase 3: AI Integration (High Priority)

| Feature | Description | Why Important |
|---------|-------------|---------------|
| MCP Interface | AI agent access to data and authoring | Interactive analysis via local chat |
| Read Tools | Query runs, summaries, experiments | Let AI reason over results |
| Write Tools | Create definitions, start runs | AI-assisted scenario authoring |

### Phase 4: Enhanced Analysis (Nice to Have)

| Feature | Description | Priority |
|---------|-------------|----------|
| Tier 2 Analysis | Correlations, inter-model agreement | Required |
| Sampling/Partial Runs | Run 10% for quick tests | Nice to have |
| Deep Analysis (PCA, outliers) | Advanced statistical methods | Defer |
| LLM-Generated Summaries | Natural language insights | Defer |

---

## Analysis Requirements

### Tier 1: Basic Statistics (Required)

- Per-model win rates for each value
- Mean/std/min/max scores by model
- Scenario-level results
- Simple aggregation across runs

### Tier 2: Correlations (Required)

- Inter-model agreement (pairwise correlation)
- Dimension impact analysis (which dimensions drive variance)
- Most contested scenarios (highest cross-model disagreement)

### Tier 3: Advanced (Deferred)

- PCA positioning
- Statistical outlier detection (Mahalanobis, Isolation Forest)
- Jackknife consistency analysis
- LLM-generated narrative summaries

---

## Technical Constraints

### API: GraphQL

Use GraphQL instead of REST for the API layer.

**Rationale:**
- LLMs can introspect schema and construct custom queries for MCP integration
- Flexible data fetching - get exactly what's needed (critical for token budgets)
- Nested relationships in single query (definition → runs → transcripts → analysis)
- Single endpoint simplifies auth and MCP integration
- Avoids pain of REST-to-GraphQL migration later

### Real-Time Updates: Polling

Use polling (5-second intervals) instead of GraphQL subscriptions for progress updates.

**Rationale:** Simpler implementation, sufficient for our use case. Can add subscriptions later if UX demands it.

### Python Workers

Heavy analysis and LLM calls run in Python workers (separate container).

**Integration:**
- Workers communicate via PostgreSQL + PgBoss queue
- Enables reuse of existing Python analysis code
- Keeps option open for Python-based AI tooling

### CLI Compatibility

Maintain ability to export data in CLI-compatible format.

**Purpose:** Business continuity. If cloud costs become unwieldy, we can fall back to the simpler CLI model.

**Requirements:**
- Export runs as file bundles (transcripts, manifests, scenarios)
- Import existing CLI data into cloud
- Round-trip fidelity for core data

---

## Non-Goals (Explicitly Out of Scope)

| Feature | Reason |
|---------|--------|
| Multi-tenancy | Internal tool, single team |
| Public registration | Internal tool |
| Billing/payments | Internal tool |
| Fine-grained permissions | All data is public within team |
| Mobile support | Desktop-first, researcher workflow |
| Offline mode | Always-connected assumption |
| Real-time collaboration | Not a collaborative editing tool |

---

## Success Criteria

### Initial Release

1. **Can create and version definitions** - With forking and lineage tracking
2. **Can run evaluations** - Queue, execute, see progress
3. **Can compare runs** - Side-by-side delta analysis
4. **Can create experiments** - Group related runs, track hypotheses
5. **Can query via MCP** - AI agents can access data

### Quality Bar

- All internal team members can use without hand-holding
- Faster iteration cycle than CLI tool
- No data loss (CLI export works as backup)

---

## Open Items for Partner Review

1. **Initial user list** - Who gets accounts at launch?
2. **LLM provider priority** - Which providers to support first?
3. **Definition migration** - Import existing CLI definitions automatically?
4. **Naming conventions** - Standard labels for definition versions?

---

## Appendix: Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Dec 2025 | Single tenant | Faster development, internal tool |
| Dec 2025 | Server-side API keys | Enable async workers |
| Dec 2025 | 14-day transcript retention | Cost control, rarely accessed |
| Dec 2025 | Polling over WebSocket | Simpler, sufficient for UX |
| Dec 2025 | Public visibility | Team transparency, simpler ACLs |
| Dec 2025 | Hybrid versioning | Git-like + optional labels |
| Dec 2025 | Python workers | Reuse existing code, AI tooling |
| Dec 2025 | CLI compatibility | Business continuity |
| Dec 2025 | GraphQL over REST | LLM schema introspection, flexible MCP queries, avoid migration pain |
