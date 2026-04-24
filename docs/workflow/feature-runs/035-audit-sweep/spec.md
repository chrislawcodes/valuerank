# Feature 035 — Audit Sweep

**Branch**: feat/035-audit-sweep
**Created**: 2026-04-24
**Status**: Draft
**Context**: STATUS.md follow-up #3 from PR #745 ([feature 033](../033-run-state-reconciliation/)). Companion to the hygiene fixes from [feature 034](../034-hygiene-follow-ups/).

---

## Background

Feature 033 shipped the run-state reconciliation sweep with six anomaly detectors gated by thresholds (pair-asymmetry delta, model-shortfall rates, stall window, etc.). 034 tuned those thresholds down — but the question remains: **how do we know we haven't set them too high?** A run with a real problem at 25pp asymmetry would fall below the (currently 0pp) gate but a future operator might raise it to 15pp to cut noise. Without an independent signal, we won't notice if that tightening hides real problems.

The audit sweep is that independent signal. It runs the same detectors on the same runs, but with all severity gates zeroed (keeping only statistical/in-flight filters that prevent nonsense). Operators can compare default-sweep anomalies to audit-sweep anomalies: if the audit sweep catches something the default missed on a production run that visibly went wrong, the default thresholds need to come down.

This is a **data surface** feature. No UI is added. Anomalies are exposed via the existing `run.anomalies` GraphQL field with a new `source` discriminator.

---

## User Stories

### US-1 (P0): `RunAnomaly` distinguishes default vs audit anomalies

**As an** operator,
**I want** each anomaly row to carry a `source` tag,
**so that** I can separate the default-sweep findings from the audit-sweep findings when reviewing a run.

**Acceptance criteria:**
- New Prisma enum `RunAnomalySource` with values `default` and `audit`.
- New column `RunAnomaly.source` of type `RunAnomalySource`, default `default`, NOT NULL.
- Existing unique constraint `(runId, type, subject)` is extended to `(runId, type, subject, source)`.
- Migration backfills `source = 'default'` on every existing row in a single `UPDATE`, idempotent.
- `run.anomalies` GraphQL field exposes the new `source` enum.

### US-2 (P0): Audit sweep job runs daily

**As the** system,
**I want** a separate PgBoss job `run_state_audit` that runs the anomaly detectors with zero severity thresholds,
**so that** the audit finds every anomaly the detectors can detect, not just those above the tuned bar.

**Acceptance criteria:**
- New job type `run_state_audit` with handler at `cloud/apps/api/src/queue/handlers/run-state-audit.ts`.
- The handler reuses the same detector functions as the default sweep but overrides all severity thresholds to 0 — `PAIR_ASYMMETRY_THRESHOLD_PCT`, `MODEL_SHORTFALL_ABSOLUTE_RATE`, `MODEL_SHORTFALL_RELATIVE_RATE`, `MODEL_SHORTFALL_PEER_RATE`.
- Statistical/in-flight filters are PRESERVED (`MIN_PROBES`, `ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS`, `SUMMARIZING_STALL_MINUTES`) — audit should flag real deviations, not in-flight races.
- Anomalies persisted by the audit handler use `source='audit'`.
- The audit handler does NOT reconstruct orphan transcripts or advance run state — it is read-only except for `RunAnomaly` writes.
- **Detector scope restricted to terminal-or-stable signals.** Per adversarial review, the audit sweep must NOT run `detectStrandedTranscript` or `detectScheduledCountMismatch` on `RUNNING`/`SUMMARIZING`/`PAUSED` runs — the default sweep uses those as repair triggers on active runs, not diagnostic signals; running them as audit checks would flood the anomaly table with normal in-flight transcripts or expected progress-total drift. Allowed detectors in audit mode:
  - On any scanned run: `detectPairAsymmetry`, `detectModelTranscriptShortfall`, `detectOrphanTranscript` (orphan detector already has the 60s age gate, so it's safe on active runs).
  - On `COMPLETED` runs only: `detectStrandedTranscript`, `detectSummarizingStall` (never meaningful on COMPLETED but kept to mirror default sweep semantics for that edge case), `detectScheduledCountMismatch` (only after completion; never auto-repairs in audit mode).
- Scheduled via PgBoss `schedule('run_state_audit', '0 9 * * *', ...)` — daily at 09:00 UTC (operator-visible morning).

### US-3 (P0): Detectors accept threshold overrides

**As the** detector functions (`detectPairAsymmetry`, `detectModelTranscriptShortfall`, etc.),
**I want** to accept an optional `thresholds` parameter that overrides the constants-file defaults,
**so that** the same detector code can be driven by either the default sweep (using constants) or the audit sweep (using zero-gate overrides) without code duplication.

**Acceptance criteria:**
- Each threshold-driven detector signature: `detectX(run, thresholds?: Partial<Thresholds>)`.
- When `thresholds` is undefined, the existing constant imports are used (no behavior change for default sweep).
- When a field is set in `thresholds`, that value overrides the constant for that call only.
- Audit handler passes `{ pairAsymmetryThresholdPct: 0, modelShortfallAbsoluteRate: 0, modelShortfallRelativeRate: 0, modelShortfallPeerRate: 0 }`.
- Statistical filters (`MIN_PROBES`, etc.) are NOT overridable — they protect from noise regardless of mode.

### US-4 (P1): Anomaly persistence is scoped by source

**As the** audit sweep,
**I want** my anomaly upserts + resolutions to never touch default-source rows,
**so that** an audit run doesn't accidentally resolve or overwrite a default anomaly that's actively tracking a real problem.

**Acceptance criteria:**
- `upsertAnomaly(draft)` extended: `draft` includes `source: 'default' | 'audit'`. Upsert key uses the 4-column unique constraint.
- `resolveAnomaly({runId, type, subject, source})` — new `source` parameter required.
- `syncAnomalies(runId, type, drafts, source)` — existing function extended with `source` parameter; the existing-anomalies read is filtered by source, so resolution only affects the same-source set.
- Default sweep handler passes `source='default'` everywhere. Audit handler passes `source='audit'`.

### US-5 (P1): Operators can query both sources via GraphQL

**As an** operator inspecting a run,
**I want** `run.anomalies` to return rows from both sources, each tagged with its source,
**so that** I can compare default and audit findings side-by-side without running two queries.

**Acceptance criteria:**
- `RunAnomaly` GraphQL type exposes the new `source` enum field.
- No filtering by source in the resolver — the client filters as needed.
- Order preserved: `firstSeenAt DESC`.
- Anomalies with the same `(runId, type, subject)` but different `source` are two separate rows in the result.

---

## What is NOT in scope

- Any UI for comparing default vs audit anomalies. Operators can use GraphQL / MCP.
- Auto-tuning default thresholds based on audit findings. Manual review stays for now.
- Alerts or Slack notifications on audit findings.
- STATUS.md follow-ups #2 (janitor) and #7 (load test).
- Backfill audit rows for historical runs — audit sweep populates going forward only.
- Any change to the default sweep's schedule, orphan reconstruction, or run-state advancement logic.
- CLAUDE.md, AGENTS.md, cloud/CLAUDE.md, MEMORY.md, `.gitignore`.

---

## Design

### Schema change

```prisma
enum RunAnomalySource {
  default
  audit
}

model RunAnomaly {
  // ... existing fields ...
  source RunAnomalySource @default(default)

  @@unique([runId, type, subject, source])
}
```

Migration steps (single file, ordered):
1. `CREATE TYPE "RunAnomalySource" AS ENUM ('default', 'audit')`.
2. `ALTER TABLE run_anomalies ADD COLUMN source "RunAnomalySource" NOT NULL DEFAULT 'default'`. The `DEFAULT 'default'` clause backfills existing rows atomically — no separate `UPDATE` needed.
3. Drop the old 3-column unique constraint.
4. Create the new 4-column unique constraint `(run_id, type, subject, source)`.

### Audit sweep handler

```typescript
// cloud/apps/api/src/queue/handlers/run-state-audit.ts
const AUDIT_THRESHOLDS: ThresholdOverrides = {
  pairAsymmetryThresholdPct: 0,
  modelShortfallAbsoluteRate: 0,
  modelShortfallRelativeRate: 0,
  modelShortfallPeerRate: 0,
  // MIN_PROBES, AGE, STALL kept at defaults
};

export function createRunStateAuditHandler() {
  return async (jobs: Job<{}>[]) => {
    // Find all non-terminal + recent-completed runs (same scope as default sweep)
    const runs = await findRunsForReconciliation();
    for (const run of runs) {
      const anomalies = await collectAnomaliesWithThresholds(run, AUDIT_THRESHOLDS);
      await persistAnomaliesWithSource(run.id, anomalies, 'audit');
    }
  };
}
```

`collectAnomaliesWithThresholds` and `persistAnomaliesWithSource` are new helpers that share code with the default sweep's per-run loop.

### Threshold override plumbing

Each detector signature:
```typescript
export type AnomalyThresholds = {
  pairAsymmetryThresholdPct?: number;
  modelShortfallAbsoluteRate?: number;
  modelShortfallRelativeRate?: number;
  modelShortfallPeerRate?: number;
};

export async function detectPairAsymmetry(
  run: RunSnapshot,
  thresholds?: AnomalyThresholds,
): Promise<AnomalyDraft | null> {
  const pctThreshold = thresholds?.pairAsymmetryThresholdPct
    ?? PAIR_ASYMMETRY_THRESHOLD_PCT;
  // ... existing body, uses pctThreshold instead of the constant directly
}
```

Detectors without threshold constants (`detectStrandedTranscript`, `detectOrphanTranscript`, `detectScheduledCountMismatch`) skip the parameter entirely — nothing to override.

### Scheduling

Two options:

**Option A — PgBoss scheduled jobs**: `boss.schedule('run_state_audit', '0 9 * * *', {})`. Runs daily at 09:00 UTC. PgBoss handles the cron.

**Option B — Scheduler tick**: extend `scheduler.ts` to enqueue an audit job once per day, checking last-audit timestamp in a small marker table or run config.

Option A is simpler and standard PgBoss usage. Plan phase picks the winner.

### Anomaly persistence

`anomaly-persistence.ts` changes. The existing signatures stay stable — `runId` is a separate argument (not inside `AnomalyDraft`, per current convention). `source` is a new separate argument.

```typescript
export async function upsertAnomaly(
  runId: string,
  draft: AnomalyDraft,
  source: RunAnomalySource,
) {
  return db.runAnomaly.upsert({
    where: {
      runId_type_subject_source: {
        runId,
        type: draft.type,
        subject: draft.subject,
        source,
      },
    },
    create: {
      runId,
      type: draft.type,
      subject: draft.subject,
      source,
      details: draft.details,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: {
      lastSeenAt: new Date(),
      details: draft.details,
      resolvedAt: null,  // CRITICAL: re-detecting a resolved anomaly must un-resolve it
    },
  });
}

export async function resolveAnomaly(key: {
  runId: string; type: RunAnomalyType; subject: string; source: RunAnomalySource;
}) {
  // Where clause includes source; never touches cross-source rows.
  return db.runAnomaly.updateMany({
    where: {
      runId: key.runId,
      type: key.type,
      subject: key.subject,
      source: key.source,
      resolvedAt: null,
    },
    data: { resolvedAt: new Date() },
  });
}

export async function syncAnomalies(
  runId: string,
  type: RunAnomalyType,
  drafts: AnomalyDraft[],
  source: RunAnomalySource,
) {
  // Persist current drafts under the given source
  for (const draft of drafts) {
    await upsertAnomaly(runId, draft, source);
  }

  // Resolve stale rows: read existing rows FILTERED BY SOURCE, so audit never
  // touches default rows and vice versa. This scoping is load-bearing — without
  // it, an empty audit run would mass-resolve real default-sweep anomalies.
  const currentSubjects = new Set(drafts.map((d) => d.subject));
  const existing = await db.runAnomaly.findMany({
    where: { runId, type, source, resolvedAt: null },  // source filter REQUIRED
    select: { subject: true },
  });

  for (const row of existing) {
    if (!currentSubjects.has(row.subject)) {
      await resolveAnomaly({ runId, type, subject: row.subject, source });
    }
  }
}
```

**Load-bearing invariant**: every `findMany` of existing anomalies in `syncAnomalies` must include the `source` filter. Without that filter, a per-source sweep finding no anomalies would resolve the other source's real anomalies. The tests must cover this — see AC-3 below.

### Handler registration

The audit handler must be registered in `cloud/apps/api/src/queue/handlers/index.ts` alongside the other handlers. Specifically: the `handlerRegistrations` array (or equivalent — check the exact symbol at merge time) must include an entry for `run_state_audit` pointing at `createRunStateAuditHandler()`. Without this, no queue is created and the PgBoss `schedule()` call has nothing to trigger.

### GraphQL

`RunAnomaly` GraphQL type gains `source: RunAnomalySource` (non-null). The enum is exposed as `RunAnomalySource` with `DEFAULT` and `AUDIT` values (Pothos convention — TS enums are uppercase in GraphQL by default). No filtering in the resolver.

---

## Files in Scope

| File | Change |
|---|---|
| `cloud/packages/db/prisma/schema.prisma` | Add `RunAnomalySource` enum; add `source` column on `RunAnomaly` with default; extend unique constraint |
| `cloud/packages/db/prisma/migrations/<timestamp>_run_anomaly_source/migration.sql` | Schema DDL + backfill note (DEFAULT clause handles it) |
| `cloud/apps/api/src/services/run/anomaly-detection.ts` | Add `AnomalyThresholds` type; thread `thresholds?` through the 2 detectors that have override-able gates (`detectPairAsymmetry`, `detectModelTranscriptShortfall`) |
| `cloud/apps/api/src/services/run/anomaly-persistence.ts` | Add `source` parameter to `upsertAnomaly`, `resolveAnomaly`, `syncAnomalies`; update queries |
| `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts` | Pass `source='default'` to all persistence calls; no behavior change otherwise |
| `cloud/apps/api/src/queue/handlers/run-state-audit.ts` | **New** — audit sweep handler |
| `cloud/apps/api/src/queue/handlers/index.ts` | Register `run_state_audit` handler |
| `cloud/apps/api/src/queue/types.ts` | Add `run_state_audit` job type and `RunStateAuditJobData = {}` |
| `cloud/apps/api/src/services/run/scheduler.ts` | Schedule the audit job via `boss.schedule` (Option A) at server startup |
| `cloud/apps/api/src/graphql/types/run-anomaly.ts` | Add `source` field + `RunAnomalySource` enum |
| `cloud/apps/api/tests/services/run/anomaly-persistence.test.ts` | Tests for source scoping |
| `cloud/apps/api/tests/queue/handlers/run-state-audit.test.ts` | **New** — handler tests |
| `cloud/apps/api/tests/graphql/run.test.ts` | Test `run.anomalies.source` field |
| `STATUS.md` | Remove follow-up #3 |

---

## Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-1 | Migration applies cleanly on a fresh DB and on an existing DB with `RunAnomaly` rows — all existing rows end up with `source='default'` |
| AC-2 | Unique key `(runId, type, subject, source)` enforced — an audit anomaly and a default anomaly with same first three values coexist |
| AC-3 | `resolveAnomaly({source:'default'})` does not affect `source='audit'` rows, and vice versa |
| AC-4 | `run_state_audit` job fires daily at 09:00 UTC (verified by PgBoss schedule inspection in test) |
| AC-5 | Audit handler flags a run with 25pp pair asymmetry that the default sweep (at 0pp threshold after 034) also catches — both rows persisted, same first three key fields, different source |
| AC-6 | Audit handler does NOT reconstruct orphan transcripts or advance run state |
| AC-7 | `detectPairAsymmetry(run, { pairAsymmetryThresholdPct: 0 })` fires on any non-zero delta; same function without override behaves as before |
| AC-8 | `run.anomalies` GraphQL field returns `source` on each anomaly |
| AC-9 | Lint + build + full test suite pass |
| AC-10 | No regression in default-sweep behavior (round-trip test: run default sweep before and after, get same set of default-source anomalies) |

---

## Edge Cases

| Case | Behavior |
|---|---|
| First deploy — no audit rows yet | `run.anomalies` returns only `source='default'` rows; no error |
| Audit sweep fires before default sweep on a fresh run | Audit writes `source='audit'` rows; default sweep later writes `source='default'` rows; they coexist |
| Operator runs MCP `trigger_recovery` | Triggers default sweep only; no change in audit cadence |
| Audit detectors find a new anomaly type that default sweep rejected | Audit row persisted; default row absent. Operator comparison surfaces the miss. |
| Audit sweep crash mid-run | Per-run try/catch; one run's failure doesn't prevent others |
| `boss.schedule` call fails at startup | Logged; next deploy re-attempts. Audit cadence falls behind until next successful startup. Documented risk. |
| Run deleted (`deletedAt` set) between audit and default sweep | Both skip it via existing `deletedAt IS NULL` filter |

---

## Constitution Validation

| Requirement | Status |
|---|---|
| Type safety — no `any` | PASS — enum, thresholds typed |
| File size ≤ 400 lines prod | PASS — audit handler ~150 lines, detector edits small |
| Test coverage ≥ 80% | PASS — new handler + persistence changes have paired tests |
| Structured logging | PASS — audit handler uses `createLogger('queue:run-state-audit')` |
| Prisma `migrate dev` (never `db push`) | PASS — one migration file |
| Soft-delete filter | PASS — no change to existing filters |
| Protected files untouched | PASS — CLAUDE.md / AGENTS.md / MEMORY.md / .gitignore off-limits; STATUS.md only the resolved-item cleanup |

---

## Residual Risks (each with `verification:`)

- **Risk: `boss.schedule` is a one-shot registration at server start. If the process restarts frequently and the call is inside a startup race, the schedule may be registered twice or missed.**
  verification: before merge, `boss.schedule` wrapped in a try/catch with an `info` log confirming registration; startup integration test asserts the schedule is visible in `boss.getSchedules()` after boot.

- **Risk: audit sweep writes anomalies every day, so the `run_anomalies` table grows unboundedly across years.**
  verification: for this PR, document the growth rate in STATUS.md as a known follow-up. A janitor for resolved anomalies older than N days is in scope for #2 of STATUS.md (separate effort). Audit-table growth is acceptable for now.

- **Risk: threshold-override plumbing changes every call site of `detectPairAsymmetry` and `detectModelTranscriptShortfall`.**
  verification: before merge, grep every call site and confirm each passes an explicit threshold argument (or omits it, keeping defaults).

- **Risk: GraphQL enum names in Pothos are SCREAMING_CASE by default (`DEFAULT`, `AUDIT`) but Prisma enum values are lowercase (`default`, `audit`). Need to align or map between them.**
  verification: before merge, confirm the Pothos enum declaration maps Prisma `default` → GraphQL `DEFAULT`. Test asserts a round-trip through the resolver preserves the source value.

- **Risk: daily-at-09:00-UTC cadence means a US-east operator sees audit results at 04:00 their local time. Fine for review, but might surprise if operators expected morning-only.**
  verification: acceptable; documentable in STATUS.md if we want configurable cadence later.
