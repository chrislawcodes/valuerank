# Plan — `pairedBatchCount` as `min(A-first complete, B-first complete)`

**Slug:** `paired-batch-count-min-of-two`
**Spec:** [spec.md](spec.md)

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: MED (jobChoiceValueFirst not paired-batch-guarded) — already addressed in residual risks (§11 R3b); plan-phase will add a defensive test. MED (broken-pair glossary too strong) — accepted; clarified that incompleteBatchCount only counts COMPLETED-but-incomplete runs, not failed/cancelled (this is current code behavior, unchanged). LOW (UI fallback) — already addressed in §2b.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: MED (loose-pairing cross-launch parameters) — already chosen explicitly in §2a as accepted trade-off. MED (no read-time validation of jobChoiceValueFirst) — already noted in residual risks; the >2 fallback warns at log.warn level so prod-data drift surfaces in logs. Both are reviewer disagreements with chosen position.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH (inconsistent paired-batch vs trial-count) — already explicitly chosen as accepted divergence in §5.7. Glossary now adds 'Note on metric divergence within a cell' that explains the within-cell asymmetry. MED (paired-batch guard) and MED (glossary disambiguation) — addressed via that new glossary note. LOW (getCoverageBatchIncrement dead code) — out of scope, flagged for closeout.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: MED (groupKey fallback for ungrouped runs) — already addressed in spec residual risks (§11 R3b); plan §3.5 case I3 (legacy) and getCoverageDirection defensive test assert the trust-but-don't-validate behavior. MED (definitionId/aggregateRunId anchor mismatch) — pre-existing behavior unchanged by this slice; tie-break update in A8b/§3.1 keeps the anchor stable.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH (manual log monitoring) — §3.5 I5 case now adds an automated vi.fn() spy assertion on log.warn. MED (inner-loop construction under-tested) — §3.5 now has 5 integration tests (I1-I5) exercising the inner loop end-to-end. MED (metric divergence manual) — §3.5 I2 automates the assertion of both pairedBatchCount and minTrialCount on the same fixture. LOW (legacy data not tested) — §3.5 I3 covers it explicitly.
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: HIGH (T1.4 slice boundary conflict) — restructured Slice 1 to be backwards-compatible: add new helper alongside old one (additive), no temp ts-expect-error needed, branch fully green at slice 1 boundary. Slice 2 now removes old helper + renames new. MED (PM2 ambiguity) — PM2 rewritten to list all 8 lint/test/build commands explicitly, all required, DB setup explicitly skipped. MED (selectPrimaryDefinitionCounts only one call site) — verified via grep before tasks were authored; documented in plan §10.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: HIGH F-1 (test coverage gap from replacement) — added explicit old-to-new test mapping table; T1.3 also adds a samplesPerScenario tripwire test. MED F-2 (insufficient integration coverage) — preserved 5 I-cases plus the helper-level 9 cases; the 5 I-cases test end-to-end resolver behavior. MED F-3 (T2.12 skippable) — T2.11 (renumbered) is now non-skippable; alternative resolver-shape integration test required if local fixtures absent. LOW F-4 (build failures may mask real errors) — addressed by the additive Slice 1 design; no temporary breakage.

## 1. Architectural shape

The change is API-side and self-contained. It edits one inner loop in `domain-coverage.ts`, rewires one helper in `domain-coverage-utils.ts`, updates one GraphQL field description, and updates the test file and glossary. No schema changes, no migrations, no new GraphQL fields, no UI changes (per spec §2b).

```
┌──────────────────────────────────────────────────────────────────────┐
│ domain-coverage.ts (queryField domainValueCoverage)                  │
│ ───────────────────────────────────────────────────────────────────  │
│   Inner loop over completed runs:                                    │
│     - batchCount  : unchanged (per-definition counter)               │
│     - incompleteBatchCount : unchanged                               │
│     - pairedBatchCount path:                                         │
│         OLD: groupId-based dedup via getCoverageBatchGroupId         │
│         NEW: directionalGroupsByDefinitionId                          │
│              Map<defId, Map<direction, Set<groupKey>>>               │
│   Per-cell aggregation:                                              │
│     - selectPrimaryDefinitionCounts(...) signature changes:          │
│         removes pairedBatchGroupIdsByDefinitionId,                   │
│                 pairedBatchIncrementsByGroupId,                      │
│                 pairedBatchCountByDefinitionId                        │
│         adds   directionalGroupsByDefinitionId                       │
│     - Returns same shape: { primaryDefinitionId, batchCount,         │
│                              pairedBatchCount }                      │
│   Trial-count path: UNCHANGED                                        │
│     - Still calls deduplicateRunsByGroupId for                       │
│       computePerModelTrialCounts.                                    │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. Wave breakdown

| Wave | Scope | Diff size | Verifiable |
|---|---|---|---|
| W1 | `domain-coverage-utils.ts` — add `getCoverageDirection`, rewrite `selectPrimaryDefinitionCounts` to take `directionalGroupsByDefinitionId` and emit `pairedBatchCount` from it | ~80 lines changed | Helper unit tests in domain-coverage.test.ts pass |
| W2 | `domain-coverage.ts` — replace inner-loop pairedBatchCount machinery with directional-group counters; rewire call to `selectPrimaryDefinitionCounts` | ~50 lines changed | Existing integration tests still pass; new direction-based unit tests in W3 |
| W3 | `domain-coverage.test.ts` — update `selectPrimaryDefinitionCounts` test cases for the new signature; add direction-based test cases (legacy missing field, single direction, both directions, mixed cell, retry-duplicate, >2 corruption fallback) | ~200 lines changed (replace ~80 + add ~120) | `npm run test --workspace @valuerank/api` green |
| W4 | `domain-coverage-gql-types.ts` (field description) + `docs/canonical-glossary.md` (Paired Batch + Incomplete Batch entries + notes) | ~30 lines changed | Lint passes; doc reads correctly |

W1, W2, W3, W4 land in a single PR (not separate PRs), but split across 2 commits with `[CHECKPOINT]` boundaries:

- **Slice 1 (`[CHECKPOINT]` after W1+W3-utils-tests):** add `getCoverageDirection`, rewrite `selectPrimaryDefinitionCounts`, add the helper-level unit tests for the new signature. The integration test wiring may temporarily fail until Slice 2; we accept this within-PR since the diff stays small.
- **Slice 2 (`[CHECKPOINT]` after W2+W3-integration-tests+W4):** wire up `domain-coverage.ts` to the new helper, update integration tests, update GQL field description, update glossary.

This split keeps each diff under ~300 lines and checkpoint-reviewable independently.

## 3. Concrete implementation

### 3.1 `domain-coverage-utils.ts`

Add new export:

```ts
/**
 * Read the direction token off a Run's config. Returns null for missing,
 * blank, or non-string `jobChoiceValueFirst`. Trimmed.
 */
export function getCoverageDirection(runConfig: unknown): string | null {
  const config = runConfig as { jobChoiceValueFirst?: unknown } | null;
  if (config == null || typeof config.jobChoiceValueFirst !== 'string') return null;
  const trimmed = config.jobChoiceValueFirst.trim();
  return trimmed.length > 0 ? trimmed : null;
}
```

Rewrite `selectPrimaryDefinitionCounts`. New signature:

```ts
export function selectPrimaryDefinitionCounts(
  definitionIds: readonly string[],
  batchCountByDefinitionId: ReadonlyMap<string, number>,
  // NEW: per-definition map from direction token -> Set of (groupId | "__ungrouped__:<runId>")
  directionalGroupsByDefinitionId: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
  log?: { warn: (obj: object, msg: string) => void },  // Optional for tests
  cellKey?: string,                                     // Optional for warn context
): { primaryDefinitionId: string | null; batchCount: number; pairedBatchCount: number };
```

Internal logic:

1. Choose `primaryDefinitionId` using the new tie-break (spec A8b):
   - Sort `defIdsForPair` by `(batchCount desc, directionCount desc, defId asc)`.
   - `directionCount = directionalGroupsByDefinitionId.get(defId)?.size ?? 0`.
   - Take the first.

2. Compute `batchCount` as `sum(batchCountByDefinitionId.get(defId) ?? 0)` — unchanged.

3. Compute `pairedBatchCount` per spec §5.4:
   - For each `defId` in `defIdsForPair`, fetch `Map<direction, Set<groupKey>>`.
   - Merge across defs into a single cell-level `Map<direction, Set<groupKey>>` by `Set.union`.
   - Reduce to `Map<direction, number>` via `set.size`.
   - Apply: 0 entries → 0; 1 entry → 0; 2 entries → `min(...)`; >2 entries → `min` of two largest, plus optional `log.warn({ cellKey, directions: keys }, '>2 directions in cell')`.

Keep `deduplicateRunsByGroupId`, `getCoverageBatchGroupId`, `computePerModelTrialCounts`, `getCoverageBatchIncrement`, `selectPrimaryDefinitionCount` (singular) unchanged.

### 3.2 `domain-coverage.ts`

Replace these locals:
```ts
const pairedBatchCountByDefinitionId = new Map<string, number>();
const pairedBatchGroupIdsByDefinitionId = new Map<string, Set<string>>();
const pairedBatchIncrementsByGroupId = new Map<string, Map<string, number>>();
```

with:
```ts
const directionalGroupsByDefinitionId =
  new Map<string, Map<string /* direction */, Set<string /* groupKey */>>>();
```

In the inner loop (after `complete` check, replacing `domain-coverage.ts:291–314`):

```ts
batchCountByDefinitionId.set(
  run.definitionId,
  (batchCountByDefinitionId.get(run.definitionId) ?? 0) + 1,
);

const direction = getCoverageDirection(run.config);
if (direction !== null) {
  const launchGroupId = getCoverageBatchGroupId(run.config);
  const groupKey = launchGroupId ?? `__ungrouped__:${run.id}`;
  const defMap = directionalGroupsByDefinitionId.get(run.definitionId)
    ?? new Map<string, Set<string>>();
  const dirSet = defMap.get(direction) ?? new Set<string>();
  dirSet.add(groupKey);
  defMap.set(direction, dirSet);
  directionalGroupsByDefinitionId.set(run.definitionId, defMap);
}
```

Imports stay the same (`getCoverageDirection` is added to the existing `from './domain-coverage-utils.js'` import).

Update the `selectPrimaryDefinitionCounts` call site to pass the new map:

```ts
const { primaryDefinitionId, batchCount, pairedBatchCount } = selectPrimaryDefinitionCounts(
  defIdsForPair,
  batchCountByDefinitionId,
  directionalGroupsByDefinitionId,
  ctx.log,
  `${valueA}::${valueB}`,
);
```

The trial-count path (`deduplicateRunsByGroupId(...)` block at `domain-coverage.ts:399`) stays exactly as-is.

### 3.3 `domain-coverage-gql-types.ts`

Update the `pairedBatchCount` field description on `DomainValueCoverageCell` (line 83):

OLD:
```
'Count of paired-batch groups where the surviving (complete) ' +
'companion run is fully complete. When both companions are complete, ' +
'the pair counts as 1. When only one is complete, that one is the ' +
'survivor and the pair counts as 1. When both are incomplete, the ' +
'pair counts as 0 here (and as 1 toward incompleteBatchCount).',
```

NEW:
```
'Count of pairable analysis-ready batches for this value pair, ' +
'computed as min(complete A-first non-aggregate runs, ' +
'complete B-first non-aggregate runs) where direction is read from ' +
'config.jobChoiceValueFirst. A launch where only one direction completed ' +
'contributes 0 here (the surviving complete run still appears in batchCount). ' +
'Runs without a recognizable direction token are excluded from both sides. ' +
'See docs/canonical-glossary.md "Paired Batch" for full semantic.',
```

### 3.4 `docs/canonical-glossary.md`

Replace the `Paired Batch` entry per spec §5.8 (full text in spec). Replace the `Incomplete Batch` entry's body with the spec §5.8 text. Append the two glossary notes from spec §5.8 ("Note on terminology overlap" and "Note on metric divergence within a cell").

### 3.5 `domain-coverage.test.ts`

Drop the existing `selectPrimaryDefinitionCounts` test cases that pass `groupIds` / `increments` arguments (lines 132–207) — they exercise the removed signature.

Add new `selectPrimaryDefinitionCounts` cases:

| Case | Input | Expected |
|---|---|---|
| Single direction only | def-a: `{vf-A: {g1}}` | pairedBatchCount=0 |
| Both directions equal | def-a: `{vf-A: {g1, g2}, vf-B: {g1, g2}}` | pairedBatchCount=2 |
| Both directions, A=3 B=2 | merged: `{vf-A: {g1,g2,g3}, vf-B: {g1,g2}}` | pairedBatchCount=2 |
| Cross-definition pair (companion structure) | def-a: `{vf-A: {g1,g2}}`, def-b: `{vf-B: {g1,g2}}` | pairedBatchCount=2 |
| Retry duplicate within group | merge sees `vf-A: {g1, g1}` (set collapses) → effectively `{g1}` | pairedBatchCount=0 if no vf-B runs |
| Empty | `[]` | pairedBatchCount=0, primaryDefinitionId=null |
| >2 directions corruption | `{vf-A:{g1,g2,g3}, vf-B:{g1}, vf-X:{g4}}` | pairedBatchCount=1 (min of 3 and 1, two largest); `log.warn` called |
| Tie-break on directionCount | def-a: batchCount=2, directions={vf-A only}; def-b: batchCount=2, directions={vf-A, vf-B} → primary=def-b | primaryDefinitionId='def-b' |
| Tie-break on defId | def-a and def-b: batchCount=2, directions={vf-A only} each → primary=defId.localeCompare → 'def-a' | primaryDefinitionId='def-a' |

Add new `getCoverageDirection` test block:

| Case | Input | Expected |
|---|---|---|
| Standard string | `{ jobChoiceValueFirst: 'career' }` | `'career'` |
| Whitespace trimmed | `{ jobChoiceValueFirst: '  career  ' }` | `'career'` |
| Empty string | `{ jobChoiceValueFirst: '' }` | `null` |
| Whitespace-only | `{ jobChoiceValueFirst: '   ' }` | `null` |
| Missing | `{}` | `null` |
| Non-string (number) | `{ jobChoiceValueFirst: 42 }` | `null` |
| Non-string (boolean) | `{ jobChoiceValueFirst: true }` | `null` |
| Null config | `null` | `null` |
| Run lacking jobChoiceLaunchMode='PAIRED_BATCH' but with valueFirst — defensive test | `{ jobChoiceLaunchMode: 'AD_HOC_BATCH', jobChoiceValueFirst: 'career' }` | `'career'` (we still return; test documents that the algorithm trusts the field. If a future change adds a launch-mode guard, this test fails as a tripwire.) |

Add **integration-style tests** on the `domainValueCoverage` resolver (matching the existing fixtures pattern). These exercise the inner loop construction of `directionalGroupsByDefinitionId` end-to-end, not just the helper:

| Integration test case | Setup | Expected |
|---|---|---|
| **I1 — Asymmetric pair** | Value pair with 2 A-first complete runs (def-a, vf-A) and 1 B-first complete run (def-b, vf-B), all in different launch groups | `pairedBatchCount = 1`, `batchCount = 3` |
| **I2 — Metric divergence (the §5.7 scenario)** | One paired-batch launch with both companions complete (1 A-first + 1 B-first, same `jobChoiceBatchGroupId`, same models, samplesPerScenario=2) | `pairedBatchCount = 1`, `minTrialCount` equals one companion's transcript count (not the sum). Comment in test: documents the deferred dedup behavior. |
| **I3 — Legacy run (no jobChoiceValueFirst)** | Two completed non-aggregate runs on def-a: one with `jobChoiceValueFirst = 'career'`, one with the field omitted entirely | `batchCount = 2`, `pairedBatchCount = 0` (only one direction has any classifiable run; legacy run does not contribute) |
| **I4 — Retry duplicate within group** | Two completed A-first runs sharing the same `jobChoiceBatchGroupId` (theoretical retry case), one B-first complete run in the same group | `batchCount = 3` (per-run), `pairedBatchCount = 1` (Set collapses A-first duplicates within group; min(1,1) = 1) |
| **I5 — `>2 directions` corruption** | Three runs on def-a with `jobChoiceValueFirst` of `vf-A` (×3), `vf-B` (×1), `vf-X` (×1), each in its own group | `pairedBatchCount = 1` (min of two largest: vf-A=3 and either of the others=1); `ctx.log.warn` mocked and asserted to have been called once with the cell key + 3 direction tokens |

**Logging assertion mechanism:** I5 (and any unit test exercising the >2 path) constructs a stub `log` object with a `warn: vi.fn()` (vitest spy), passes it into `selectPrimaryDefinitionCounts`, then asserts the spy was called with the expected shape. This makes the log-warn behavior part of the automated test surface (addresses gemini HIGH on manual log monitoring).

Keep all existing tests for `extractValuePair`, `selectPrimaryDefinitionCount` (singular), `getCoverageBatchIncrement`, `getCoverageBatchGroupId`, `computePerModelTrialCounts`, `deduplicateRunsByGroupId` untouched.

## 4. Risks and verification

| Risk | Severity | Verification |
|---|---|---|
| The new algorithm produces a *different* `pairedBatchCount` than today for an asymmetric prod cell, breaking operator's mental model | HIGH | **verification:** before deploy, run the §9 spec SQL against prod for at least 3 value pairs (one clean, one asymmetric, one legacy-only if any exist). Record current `pairedBatchCount` from the live Domain Overview page. After deploy, compare. The clean pair should be unchanged; the asymmetric should drop to the smaller-direction count; the legacy-only (if any) should drop to 0. |
| The Set-based group-key dedup is implemented incorrectly and `pairedBatchCount` is wrong even for clean data | HIGH | **verification:** unit tests in `domain-coverage.test.ts` cover the 9 cases in §3.5. CI green on `npx turbo test --filter=@valuerank/api`. Additionally, do a local manual GraphQL query against the test DB (`http://localhost:3031/graphql`) for one known value pair — verify the response shape and number match the test expectation. |
| The `selectPrimaryDefinitionCounts` tie-break change makes the cell anchor (`definitionId`, `aggregateRunId`, `definitionName`) jump to a different definition for an asymmetric pair, breaking the analysis-page link target | MEDIUM | **verification:** add a test in §3.5 (the "Tie-break on directionCount" case) that asserts the deterministic primary definition for an asymmetric input. Manually verify against prod by querying for a known asymmetric pair (use the SQL from spec §9) and confirming `definitionId` of the anchor definition stays stable. |
| Glossary update goes out of sync with the GraphQL field description (and operators read both) | MEDIUM | **verification:** lint catches malformed markdown. Manual review of `docs/canonical-glossary.md` and `domain-coverage-gql-types.ts:83` side-by-side as part of W4. Spec §5.8 is the authoritative source for both texts; W4 must paste those texts verbatim. |
| `>2 directions` warning floods logs in prod | LOW | **verification:** before deploy, query prod for any `(definition_id, direction)` count distinct values per cell using SQL: `SELECT COUNT(DISTINCT BTRIM(config->>'jobChoiceValueFirst')) FROM runs WHERE definition_id = X AND status='COMPLETED' AND deleted_at IS NULL GROUP BY definition_id HAVING COUNT(DISTINCT BTRIM(config->>'jobChoiceValueFirst')) > 2;` Expected: 0 rows. If non-zero, defer the deploy and investigate the data first. |
| The trial-count path's existing dedup-then-count behavior produces `minTrialCount > 0` while `pairedBatchCount = 0` for the same cell, confusing operators | MEDIUM | **verification:** add a test in §3.5 integration test that asserts both metrics for the asymmetric case, and document the expected divergence in the test's comment. The glossary §5.8 metric-divergence note covers operator-facing communication. No code-side mitigation in this slice — it is the explicit divergence chosen in spec §5.7. |
| The defensive Set-of-groupIds dedup changes per-cell counts for pairs that happen to have duplicate completed runs in the same group (extremely rare per §6.3) | LOW | **verification:** prod query before deploy: `SELECT config->>'jobChoiceBatchGroupId' AS bgid, config->>'jobChoiceValueFirst' AS vf, COUNT(*) FROM runs WHERE status='COMPLETED' AND deleted_at IS NULL AND (config->>'isAggregate')::boolean IS NOT TRUE GROUP BY 1,2 HAVING COUNT(*) > 1;` Expected: 0 rows. If any: those cells will see `pairedBatchCount` decrease by `(count - 1)` per duplicate (set collapses); flag them in the post-deploy verification list. |
| Anomaly detector's `detectPairAsymmetry` continues to read `jobChoiceBatchGroupId` and silently breaks if we accidentally remove the field | HIGH (but mitigated by spec scope) | **verification:** spec §3 explicitly forbids touching the launch-side writes. Plan §3 does not edit `start.ts` / `lifecycle.ts` / `plan-slots.ts` / `execute-runs.ts`. Confirm by `git diff --stat origin/main..HEAD` before pushing — only the files listed in spec §10 should appear. |

## 5. Residual risks (with verification)

Per the FF SKILL rule, every residual risk has a `verification:` line.

R1. **Loose-pairing across launch groups can pair runs with mismatched parameters (different `temperature`, `samplesPerScenario`, `models`).** Spec §2a accepts this trade-off. **verification:** plan-phase: add a SQL spot-check against prod that, for cells with `pairedBatchCount > 0`, samples 3 cells and reports the distinct `temperature` and `samplesPerScenario` across A-first and B-first runs. If any cell has truly mismatched parameters across directions (not just within-direction variation), record it as a known data condition for downstream analysis users. Run before deploy as part of the post-deploy verification list. The spot-check itself does not block deploy; it informs the operator.

R2. **Legacy runs (pre-2026-03-30) with no `jobChoiceValueFirst` will silently drop out of `pairedBatchCount`.** Spec §6.3 found 116 such runs (8.4% of non-aggregate completed). **verification:** prod query before deploy (spec §9 SQL) identifies any cells that would shift from `pairedBatchCount > 0` to `0` purely due to the legacy drop. If any exist, document them in the PR description and post-deploy verification list. (Verified §6.3 data shows all 90 affected definitions also have post-March-30 runs, so a complete drop to 0 is unlikely for any cell with active operations — but the verification step confirms.)

R3. **Reading `jobChoiceValueFirst` without enforcing `jobChoiceLaunchMode === 'PAIRED_BATCH'` could miscount a manually-launched run that happens to carry the field.** Spec §11 R3b acknowledges; per §6.3 prod data, 100% of completed runs are PAIRED_BATCH. **verification:** plan-phase: include the §3.5 defensive test that exercises an `AD_HOC_BATCH` config with `jobChoiceValueFirst` set, and assert the *current* algorithm counts it (documenting the trust-but-don't-validate decision). Pre-deploy query: `SELECT COUNT(*) FROM runs WHERE config->>'jobChoiceLaunchMode' != 'PAIRED_BATCH' AND config ? 'jobChoiceValueFirst' AND status='COMPLETED' AND deleted_at IS NULL;` Expected: 0. Block deploy if non-zero.

R4. **Trial-count path (`computePerModelTrialCounts`) keeps the surviving-companion dedup, so for a healthy paired batch only one companion's transcripts feed the trial counts.** Spec §5.7 acknowledges this is unchanged this slice. **verification:** local manual GraphQL query against test DB after implementation: query a known paired batch's value-pair cell, expect `minTrialCount` to equal the per-model transcript count of *one* of the two companions (not the sum). Add a unit test asserting this behavior is preserved (a tripwire test that fails if the trial-count path is changed without intent).

R5. **The `>2 directions` corruption fallback (taking min of two largest counts) could surface a plausible-but-wrong number if a definition's tokens drift over time.** Spec §7.E3. **verification:** the algorithm calls `ctx.log.warn` with cell key + offending tokens whenever `>2` triggers. Add a unit test asserting the warn is emitted. Post-deploy, watch logs for `services:graphql:queries` `warn` lines for 24h after the rollout. If any fire, capture the cell key and investigate the underlying definition's token history.

R6. **No UI change — the `pairedBatchCount = 0` semantic does not surface in the typical default-models cell digit.** Spec §2b acknowledges this is intentional for this slice. **verification:** post-deploy, manually open Domain Overview for a known asymmetric pair on a domain with default models configured. Confirm: (a) the cell digit is `minTrialCount` (unchanged), (b) the popover Evidence line shows the new (lower) `pairedBatchCount`, (c) clicking through to the analysis page shows the new value in the URL. Capture a screenshot for closeout. The follow-up to revisit the UI fallback is recorded in `closeout.md`.

## 6. Test plan (pre-merge)

In addition to the unit tests in §3.5:

1. **`npx turbo lint --filter=@valuerank/api`** — must pass. Linting will catch unused imports left over from removing the group-id machinery.
2. **`npx turbo test --filter=@valuerank/api`** — must pass with the new tests. The new test count must be visible in CI output (record the delta in the PR description).
3. **`npx turbo build --filter=@valuerank/api`** — must pass. Type errors will catch any incomplete refactor of `selectPrimaryDefinitionCounts`'s signature.
4. **`npx turbo lint build test --filter=@valuerank/web`** — must pass. The web workspace consumes `pairedBatchCount` through the GraphQL types; the runtime semantic change does not require web changes, but the build verifies no type drift.
5. **Manual GraphQL probe** against local test DB (`http://localhost:3031/graphql`) for one known value pair seeded by the test fixtures (or by a quick `seed-data` shell command if the project has one). Verify the response shape includes `pairedBatchCount` with the expected min-of-directions value.

## 7. Files touched

Edits (verified against spec §10):

- `cloud/apps/api/src/graphql/queries/domain-coverage.ts` (W2)
- `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts` (W1)
- `cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts` (W4)
- `cloud/apps/api/tests/graphql/queries/domain-coverage.test.ts` (W3)
- `docs/canonical-glossary.md` (W4)

Forbidden (per spec §10 and task instructions):

- `cloud/apps/api/src/services/run/start.ts`
- `cloud/apps/api/src/services/run/anomaly-detection.ts`
- `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`
- `cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts`
- `cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts`
- `cloud/apps/api/src/services/analysis/**`
- `cloud/apps/api/src/services/circumplex/**`
- `cloud/apps/api/src/graphql/types/run.ts`
- Any web file
- `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`

## 8. Plan-stage Reconciliation log

- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: Auto-accepted (no actionable HIGH/MEDIUM findings).
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: MED (groupKey fallback for ungrouped runs) — already addressed in spec residual risks (§11 R3b); plan §3.5 case I3 (legacy) and the defensive `getCoverageDirection` test assert the trust-but-don't-validate behavior. MED (definitionId/aggregateRunId anchor mismatch) — pre-existing behavior unchanged by this slice; tie-break update in A8b/§3.1 keeps the anchor stable.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH (manual log monitoring) — §3.5 I5 case adds an automated `vi.fn()` spy assertion on `log.warn`. MED (inner-loop construction under-tested) — §3.5 now has 5 integration tests (I1-I5) that exercise the inner loop end-to-end. MED (metric divergence verification manual) — §3.5 I2 case automates the assertion of both `pairedBatchCount` and `minTrialCount` on the same fixture. LOW (legacy data not tested) — §3.5 I3 case explicitly covers it.
