# Implementation Plan: Models Tab

**Branch:** `claude/magical-mcclintock` | **Date:** 2026-04-15 | **Spec:** `docs/workflow/feature-runs/models-tab/spec.md`

## Summary

Add a `/models` top-level page with a model×value matrix showing pooled win rate and cross-domain stability per cell. The API resolver reads from existing domain analysis snapshots (no new DB tables). The web layer uses the existing codegen pipeline. Three implementation slices: API types + resolver, web routing + GraphQL layer, then UI components.

---

## Technical Context

| Aspect | Detail |
|---|---|
| Language | TypeScript (strict) |
| API framework | Pothos (code-first GraphQL schema builder) |
| API schema exposure | `cloud/apps/web/schema.graphql` — manually maintained SDL snapshot; codegen reads this |
| Web framework | React + urql + Vite |
| Codegen | `npm run codegen --workspace @valuerank/web` — reads `src/**/*.graphql` + `schema.graphql`, writes `src/generated/graphql.ts` |
| DB access | Prisma — reads `assumptionAnalysisSnapshot` table for domain analysis data |
| Testing | Vitest (web), Vitest (API) |
| File size limit | 400 lines max per file |
| New DB tables | None — reads from existing snapshots |
| Performance | Trivial at current scale (~10 domains × ~10 models × 10 values); no caching needed in v1 |

---

## Architecture Decisions

### Decision 1: API data source — existing snapshots, not live recalculation

**Chosen:** Read from `assumptionAnalysisSnapshot` rows (same as `domainAnalysis` resolver), aggregate per-domain counts in memory, compute pooled win rate and stability server-side.

**Rationale:**
- The snapshot table already has per-domain, per-model, per-value counts (`prioritized`, `deprioritized`, `neutral`) stored as JSON
- No new data collection required — `modelsAnalysis` is a cross-domain view of data that already exists
- Each domain's "latest CURRENT snapshot" is the source of truth, consistent with `domainAnalysis`

**How the resolver works:**
1. Query `assumptionAnalysisSnapshot` for all domains (or one domain if `domainId` is supplied), filtering for `status: 'CURRENT'` and `analysisType: 'domain_overview'`
2. Parse each snapshot's `output` JSON using `parseSnapshotOutput` from `domain-analysis-snapshot-builder.ts`
3. For each model × value pair, collect per-domain `{prioritized, deprioritized}` counts
4. Compute domain win rate: `prioritized / (prioritized + deprioritized) * 100` — skip if sum is 0
5. Pool across eligible domains (weighted mean, weight = `prioritized + deprioritized`)
6. Compute stability via weighted MAD formula from spec

**Alternative considered:** Live re-aggregation from transcripts — rejected because it duplicates the snapshot builder logic and would be significantly slower.

### Decision 2: Stability and win rate computed server-side

**Chosen:** The resolver returns pre-computed `pooledWinRate`, `stabilityScore`, and per-domain breakdowns. The client does not compute.

**Rationale:**
- Formula involves weighted MAD across multiple domains — non-trivial client work
- Server has direct access to all snapshot data in one query

### Decision 3: Pothos type in new types file, query in new queries file

**Chosen:**
- `cloud/apps/api/src/graphql/types/models-analysis.ts` — registers Pothos object types
- `cloud/apps/api/src/graphql/queries/models-analysis.ts` — registers the query field (auto-imported via `autoImportDir`)

**Rationale:** Matches the existing pattern (`available-model.ts` in types + `models.ts` in queries). `types/index.ts` needs one new import; `queries/index.ts` does NOT need modification.

### Decision 4: `schema.graphql` is manually extended

**Chosen:** Codex manually appends the new SDL type definitions to `cloud/apps/web/schema.graphql`.

**Rationale:** No schema export/introspection script exists. All prior features added types manually in the same commit. The SDL must be consistent with the Pothos definitions.

### Decision 5: Web operations use the codegen pattern

**Chosen:** `modelsAnalysis.graphql` + `modelsAnalysis.ts` re-exporting from `../../generated/graphql`.

**Rationale:** Modern repo pattern (see `models.graphql` + `models.ts`, `domainCoverage.graphql` + `domainCoverage.ts`).

### Decision 6: `Models` nav is a plain `NavLink`, not a dropdown

**Chosen:** Plain `NavLink` styled like the `Status` tab.

**Rationale:** V1 has one page at `/models` with no sub-routes.

---

## Implementation Slices

### Slice A — API: types + resolver + schema SDL [CHECKPOINT]
Estimated diff: ~180 lines

**Files:**
- `cloud/apps/api/src/graphql/types/models-analysis.ts` (NEW)
- `cloud/apps/api/src/graphql/queries/models-analysis.ts` (NEW)
- `cloud/apps/api/src/graphql/types/index.ts` (add 1 import line)
- `cloud/apps/web/schema.graphql` (append new SDL types + Query field)

**Pothos type structure in `types/models-analysis.ts`:**
```
ModelsAnalysisDomainBreakdown  { domainId: String, domainName: String, winRate: Float, evidenceWeight: Int }
ModelsAnalysisValueResult      { valueKey: String, pooledWinRate: Float?, stabilityScore: Float?, eligibleDomainCount: Int, domains: [...] }
ModelsAnalysisModelResult      { modelId: String, label: String, values: [...] }
ModelsAnalysisResult           { models: [...] }
```

**Resolver logic in `queries/models-analysis.ts`:**
```
builder.queryField('modelsAnalysis', ...)
args: domainId? (ID, optional)

Step 1: Load active models from db.llmModel (status: 'ACTIVE') for label lookup
Step 2: Query assumptionAnalysisSnapshot:
  - analysisType: 'domain_overview'
  - status: 'CURRENT'
  - deletedAt: null
  - if domainId: filter assumptionKey = `domain-analysis:${domainId}`
  - select: { id, assumptionKey, output, createdAt }
  - Deduplicate per-domain: keep only the most recent snapshot per assumptionKey
Step 3: Parse each snapshot output via parseSnapshotOutput()
Step 4: Build per-model per-value domain lists:
  Map<modelId, Map<valueKey, Array<{domainId, domainName, prioritized, deprioritized}>>>
Step 5: For each (modelId, valueKey):
  - eligible = domains where prioritized + deprioritized > 0
  - compute winRate per eligible domain: prioritized / (prioritized + deprioritized) * 100
  - pooledWinRate = weighted mean (weight = prioritized + deprioritized), or null if 0 eligible
  - stabilityScore = spec MAD formula if >=2 eligible, else null
Step 6: Return models sorted by label
```

**Computation helpers (inline in the resolver file):**
```typescript
function computeWinRate(p: number, d: number): number | null  // null if p+d=0
function computePooledWinRate(domains: Array<{winRate: number, weight: number}>): number | null
function computeStabilityScore(domains: Array<{winRate: number, weight: number}>): number | null
// stability = max(0, 100 * (1 - mad / 50))  where mad = weighted MAD
// returns null if domains.length < 2
```

**SDL to append to `schema.graphql`** (insert alphabetically or at end of type list, before closing Query):
```graphql
type ModelsAnalysisDomainBreakdown {
  domainId: String!
  domainName: String!
  evidenceWeight: Int!
  winRate: Float!
}

type ModelsAnalysisModelResult {
  label: String!
  modelId: String!
  values: [ModelsAnalysisValueResult!]!
}

type ModelsAnalysisResult {
  models: [ModelsAnalysisModelResult!]!
}

type ModelsAnalysisValueResult {
  domains: [ModelsAnalysisDomainBreakdown!]!
  eligibleDomainCount: Int!
  pooledWinRate: Float
  stabilityScore: Float
  valueKey: String!
}
```
Add to the `Query` type: `modelsAnalysis(domainId: ID): ModelsAnalysisResult!`

**Verification:**
```
npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
```

---

### Slice B — Web: GraphQL layer + routing + nav [CHECKPOINT]
Estimated diff: ~100 lines

**Files:**
- `cloud/apps/web/src/api/operations/modelsAnalysis.graphql` (NEW)
- `cloud/apps/web/src/api/operations/modelsAnalysis.ts` (NEW)
- `cloud/apps/web/src/App.tsx` (add route)
- `cloud/apps/web/src/components/layout/NavTabs.tsx` (add Models NavLink)
- `cloud/apps/web/src/components/layout/MobileNav.tsx` (add Models entry)

**`modelsAnalysis.graphql`:**
```graphql
query ModelsAnalysis($domainId: ID) {
  modelsAnalysis(domainId: $domainId) {
    models {
      modelId
      label
      values {
        valueKey
        pooledWinRate
        stabilityScore
        eligibleDomainCount
        domains {
          domainId
          domainName
          winRate
          evidenceWeight
        }
      }
    }
  }
}
```

**`modelsAnalysis.ts`:**
```typescript
export { ModelsAnalysisDocument as MODELS_ANALYSIS_QUERY } from '../../generated/graphql';
export type {
  ModelsAnalysisQuery,
  ModelsAnalysisQueryVariables,
} from '../../generated/graphql';
export type ModelsAnalysisModelResult = ModelsAnalysisQuery['modelsAnalysis']['models'][number];
export type ModelsAnalysisValueResult = ModelsAnalysisModelResult['values'][number];
export type ModelsAnalysisDomainBreakdown = ModelsAnalysisValueResult['domains'][number];
```

**`App.tsx`** — add (no `fullWidth`):
```tsx
import { Models } from './pages/Models';
// ...
<Route path="/models" element={<ProtectedLayout><Models /></ProtectedLayout>} />
```
Insert after the `/domains/coverage` route.

**`NavTabs.tsx`** — add plain NavLink after Domains dropdown, before Vignettes:
```tsx
import { ..., Cpu } from 'lucide-react';
// ...in the JSX return, after domainMenuRef renderMenu call:
<NavLink
  to="/models"
  className={({ isActive }) =>
    `flex items-center gap-2 px-3 py-3 min-h-[44px] text-sm font-medium transition-colors border-b-2 ${
      isActive
        ? 'text-white border-teal-500'
        : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
    }`
  }
>
  <Cpu className="w-4 h-4" />
  <span className="hidden sm:inline">Models</span>
</NavLink>
```

**`MobileNav.tsx`** — add after the Domains navItem:
```typescript
{ name: 'Models', path: '/models', icon: Cpu },
```

**Verification:**
```
npm run codegen --workspace @valuerank/web   ← MUST run first
npm run lint --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

---

### Slice C — Web: UI components [CHECKPOINT]
Estimated diff: ~380 lines

**Files:**
- `cloud/apps/web/src/components/models/stabilityDots.ts` (NEW)
- `cloud/apps/web/src/components/models/ModelsMatrixCell.tsx` (NEW)
- `cloud/apps/web/src/components/models/ModelsMatrix.tsx` (NEW)
- `cloud/apps/web/src/components/models/ModelValueDetailDrawer.tsx` (NEW)
- `cloud/apps/web/src/pages/Models.tsx` (NEW)

**`stabilityDots.ts`** — pure utility, no React:
```typescript
export type DotState = 'full' | 'half' | 'empty' | 'muted';

// Returns 5 DotState values
// halfDots = Math.floor(score / 10); index i:
//   full if i*2+1 <= halfDots  (i.e. 2*(i+1) <= halfDots)
//   wait, simpler: fullDots = Math.floor(halfDots / 2), hasHalf = halfDots % 2 === 1
//   dots[i] = i < fullDots ? 'full' : (i === fullDots && hasHalf) ? 'half' : 'empty'
// If score is null/undefined: all 'muted'
export function computeDots(score: number | null | undefined): DotState[]

// Tooltip string from spec:
// "Cross-domain stability shows how consistent this value's win rate is across domains.
//  Score: {score}/100 — {description}. Based on {count} eligible domains."
// description: 100='identical', >=75='fairly consistent', >=50='moderately consistent', else='varies significantly'
export function formatStabilityTooltip(
  score: number | null | undefined,
  eligibleDomainCount: number,
): string
```

**`ModelsMatrixCell.tsx`:**
```tsx
type Props = {
  pooledWinRate: number | null | undefined;
  stabilityScore: number | null | undefined;
  eligibleDomainCount: number;
  muted?: boolean;   // force muted dots (single-domain filter)
  onClick: () => void;
};
// Renders:
//   Line 1: pooledWinRate formatted as "68%" or "n/a"
//   Line 2: dot string + eligibleDomainCount + "d"
// Dot char render: ● full, ◐ half, ○ empty, ○ muted (same char but gray color class)
// Click → onClick()
// title attribute on dot row = formatStabilityTooltip(...)
```

**`ModelsMatrix.tsx`:**
```tsx
import { DOMAIN_ANALYSIS_VALUE_KEYS } from '../../../api/...' // or from shared

const VALUE_SHORT_LABELS: Record<string, string> = {
  Self_Direction_Action: 'Self-Dir',
  Universalism_Nature: 'Univ',
  Benevolence_Dependability: 'Bene',
  Security_Personal: 'Security',
  Power_Dominance: 'Power',
  Achievement: 'Achieve',
  Tradition: 'Tradition',
  Stimulation: 'Stimulate',
  Hedonism: 'Hedone',
  Conformity_Interpersonal: 'Conform',
};

type Props = {
  models: ModelsAnalysisModelResult[];
  loading: boolean;
  singleDomainActive: boolean;
  stabilityFilter: 'all' | 'stable' | 'low';
  sortColumn: string | null;
  onCellClick: (modelId: string, valueKey: string) => void;
};
// Renders <table> — sticky first column, scrollable if needed
// Column order: DOMAIN_ANALYSIS_VALUE_KEYS
// Row order: sorted by model label (default) or sortColumn win rate desc (nulls last)
// Empty state: if no rows have any data, show <p> message
```

**`ModelValueDetailDrawer.tsx`:**
```tsx
type Props = {
  model: ModelsAnalysisModelResult | null;
  valueKey: string | null;
  onClose: () => void;
};
// Right-side panel (fixed position, same pattern as other drawers in the app)
// Shows: model + value header, pooledWinRate big, stability dots, domain table
// Domain table cols: Name | Win Rate | Evidence Weight
```

**`Models.tsx`:**
```tsx
// State: selectedDomain (string|null), stabilityFilter, sortColumn (string|null), openCell ({modelId,valueKey}|null)
// Query: useQuery(MODELS_ANALYSIS_QUERY, { variables: { domainId: selectedDomain ?? undefined } })
// Also fetch domain list for the filter dropdown (use existing domains query)
// Render: title, subtitle, filter bar, <ModelsMatrix>, <ModelValueDetailDrawer>
// Pass singleDomainActive = selectedDomain != null to matrix
```

**Verification:**
```
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

---

## Key Constraints

| Constraint | Rule |
|---|---|
| No `fullWidth` | Standard `ProtectedLayout` — no `fullWidth` prop |
| Codegen precedes build | `npm run codegen` before lint/build in web workspace |
| `queries/index.ts` auto-imports | Do NOT add import there |
| `types/index.ts` needs 1 import | Add `import './models-analysis.js'` |
| No new DB tables | All data from `assumptionAnalysisSnapshot` |
| File size ≤ 400 lines | Split if approaching limit |
| No `any` types | Use `unknown` with type guards |
| `strict-boolean-expressions` | Explicit `!= null` checks, not truthiness |
| `schema.graphql` is manual SDL | Append alphabetically; add field to Query type |
| DOMAIN_ANALYSIS_VALUE_KEYS import | Import from `cloud/apps/api/src/graphql/queries/domain-analysis-values.ts` on API side; on web side use the same key strings from the generated types or define locally |

---

## Do Not Touch

DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `MEMORY.md`, `.gitignore`, or any file not listed in the implementation scope.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Active-model seeding added to A2 step 8: all active models appear in output even without snapshot data. Math helpers are specified in plan.md; tasks reference plan. Keyboard semantics are out of scope for V1.
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: Single-domain tooltip: added mutedBySingleDomain param to formatStabilityTooltip in C1; C2 now passes muted===true for that branch, yielding distinct message 'Cross-domain stability is not available when viewing a single domain.' Active-model seeding addressed in A2. DOMAIN_ANALYSIS_VALUE_KEYS: C3 notes to define inline if web side cannot import from api package.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: H-01: Scale is trivial (~10 domains); in-memory dedup is acceptable for V1. H-02: Added try/catch around parseSnapshotOutput in A2 with log+skip. M-01: Empty-state check is O(100) — trivial. M-02: stabilityScore formula uses max(0,...) which floors at 0. M-03: Addressed in C3 — define inline. L-01: Added reset to 'all' in C5 when selectedDomain changes to non-null.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: No issues found — clean pass
- review: reviews/diff.codex.regression-adversarial.review.md | status: accepted | note: No regression identified — clean pass
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: MEDIUM fixed — added comment to useMemo block warning about dependency array maintenance. LOW dismissed — memoization is correct and in place; urql already serializes variables so no actual redundant fetch risk.
