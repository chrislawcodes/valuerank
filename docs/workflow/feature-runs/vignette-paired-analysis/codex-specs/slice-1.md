# Codex spec: vignette-paired-analysis slice 1 (Backend)

You are implementing slice 1 of the `vignette-paired-analysis` Feature Factory workflow. The full workflow lives at `docs/workflow/feature-runs/vignette-paired-analysis/`.

**Read first:**

- `docs/workflow/feature-runs/vignette-paired-analysis/spec.md` (full)
- `docs/workflow/feature-runs/vignette-paired-analysis/plan.md` § 3 ("Slice 1 — Backend")
- `docs/workflow/feature-runs/vignette-paired-analysis/tasks.md` § "Slice 1" (1.1 through 1.5)
- `cloud/CLAUDE.md` § "Push And PR Checks" and § "TypeScript Standards"
- `AGENTS.md` § "Never Do" and § "Read First"

## Slice 1 scope

Add an optional `definitionId: ID` argument to the existing `pressureSensitivity` GraphQL query. Thread it through the service layer to scope eligible runs to the input definition AND its companion definition (resolved via the existing `findPairedCompanion` utility). Skip the snapshot cache on this path. Emit structured timer telemetry.

**Constraints:**

- NO new GraphQL types.
- NO new aggregation modules. Math is already correct in `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts`.
- NO new utility files (the helper goes inside `snapshot-builder.ts`).
- The existing domain-scoped query path MUST continue to behave identically when `definitionId` is null.
- The companion lookup MUST share the input's `domainId` (cross-domain `pair_key` reuse must not merge unrelated vignettes).
- File-size limits per `cloud/CLAUDE.md`: prod warn 400, error 700. Tests warn 800, error 1200.

## Files to modify (exact paths)

1. `cloud/apps/api/src/services/pressure-sensitivity/snapshot-builder.ts`
2. `cloud/apps/api/src/services/pressure-sensitivity/snapshot-cache.ts`
3. `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`

## DO NOT MODIFY

`CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `.gitignore`, `STATUS.md`, or any file outside the three listed above. If you think another file needs updating, note it in your output but do not write it.

Specifically: do NOT modify `aggregation.ts`, `snapshot-compute.ts`, `auto-pair.ts`, `paired-vignette-helpers.ts`, or any other file in the pressure-sensitivity service or graphql tree.

## Detailed task list

### 1.1 Add `expandToCompanionDefinition` helper

**File:** `cloud/apps/api/src/services/pressure-sensitivity/snapshot-builder.ts`

Add a private async function:

```typescript
import { findPairedCompanion } from '../../utils/auto-pair.js';
import { AppError, NotFoundError } from '@valuerank/shared';

export const PAIR_KEY_COMPANION_COLLISION = 'pair_key_companion_collision';
export const PAIR_KEY_COMPANION_MIRROR_FAILURE = 'pair_key_companion_mirror_failure';

export type CompanionExpansionStatus = 'paired' | 'companion_missing' | 'not_paired';

export type CompanionExpansionResult = {
  ids: string[];
  status: CompanionExpansionStatus;
};

export async function expandToCompanionDefinition(
  definitionId: string,
): Promise<CompanionExpansionResult> {
  const definition = await db.definition.findUnique({
    where: { id: definitionId },
    select: { id: true, domainId: true, content: true, deletedAt: true },
  });

  if (definition === null || definition.deletedAt !== null) {
    throw new NotFoundError('Definition', definitionId);
  }

  const content = definition.content as Record<string, unknown> | null;
  const methodology =
    content !== null && typeof content === 'object' && !Array.isArray(content)
      ? (content.methodology as Record<string, unknown> | null)
      : null;
  const pairKey =
    methodology !== null && typeof methodology.pair_key === 'string' && methodology.pair_key.length > 0
      ? methodology.pair_key
      : null;

  if (pairKey === null) {
    return { ids: [definitionId], status: 'not_paired' };
  }

  const candidates = await db.definition.findMany({
    where: {
      id: { not: definitionId },
      domainId: definition.domainId,
      deletedAt: null,
      content: {
        path: ['methodology', 'pair_key'],
        equals: pairKey,
      },
    },
    select: { id: true, content: true },
  });

  if (candidates.length > 1) {
    throw new AppError(
      'Multiple companion vignettes share this pair_key',
      PAIR_KEY_COMPANION_COLLISION,
      { pairKey, definitionId, candidateCount: candidates.length },
    );
  }

  if (candidates.length === 0) {
    return { ids: [definitionId], status: 'companion_missing' };
  }

  const companion = findPairedCompanion(
    { id: definition.id, content: definition.content },
    candidates,
  );

  if (companion === null || companion === undefined) {
    throw new AppError(
      'Paired vignette companion mirroring failed',
      PAIR_KEY_COMPANION_MIRROR_FAILURE,
      { pairKey, definitionId },
    );
  }

  return { ids: [definitionId, companion.id], status: 'paired' };
}
```

Verify the exact signature of `findPairedCompanion` at `cloud/apps/api/src/utils/auto-pair.ts` first — match its expected input shape. If `AppError`'s constructor signature differs, adapt the call but keep the error code as the second argument or property (whichever the existing pattern is — see existing usages like `paired-vignette-helpers.ts`).

### 1.2 Thread `definitionId` through `preparePressureSensitivityState`

**File:** `cloud/apps/api/src/services/pressure-sensitivity/snapshot-builder.ts`

Extend the function signature:

```typescript
export async function preparePressureSensitivityState(params: {
  domainId: string | null;
  signature: string;
  definitionId?: string | null;
}): Promise<PressureSensitivityPreparedState & { companionStatus?: CompanionExpansionStatus }> {
```

When `params.definitionId` is non-null:

- Call `await expandToCompanionDefinition(params.definitionId)`.
- Build the runs `where` clause with `definitionId: { in: expanded.ids }`. Do NOT add a `domainId` filter on this path — the helper's candidate query already constrains companions to the same domain.
- Return the existing `PressureSensitivityPreparedState` shape PLUS `companionStatus: expanded.status`.

When `params.definitionId` is null, behavior is unchanged.

### 1.3 Update `getPressureSensitivityResult` to skip cache and emit telemetry

**File:** `cloud/apps/api/src/services/pressure-sensitivity/snapshot-cache.ts`

Extend the params shape:

```typescript
export async function getPressureSensitivityResult(params: {
  domainId: string | null;
  modelIds: string[] | null;
  providerId: string | null;
  signature: string;
  definitionId?: string | null;
}): Promise<PressureSensitivityResultShape> {
```

When `params.definitionId` is non-null:

- Skip the `assumptionAnalysisSnapshot.findFirst` read entirely.
- Skip the `writeSnapshot` call entirely.
- Wrap the synchronous compute in a structured timer:

```typescript
const startMs = Date.now();
let state;
try {
  state = await preparePressureSensitivityState({
    domainId: params.domainId,
    signature: params.signature,
    definitionId: params.definitionId,
  });
} catch (err) {
  if (err instanceof AppError && (err.code === PAIR_KEY_COMPANION_COLLISION || err.code === PAIR_KEY_COMPANION_MIRROR_FAILURE)) {
    log.warn({ definitionId: params.definitionId, code: err.code }, 'Vignette-paired companion expansion failed');
    return buildCompanionFailureResult(params.definitionId, err.code);
  }
  throw err;
}
const output = await buildPressureSensitivitySnapshotOutput(state);
const durationMs = Date.now() - startMs;
log.info(
  { definitionId: params.definitionId, runCount: state.eligibleRuns.length, durationMs },
  'Vignette-paired pressure sensitivity computed',
);
return filterResult(output, params.modelIds, params.providerId);
```

Add a private helper `buildCompanionFailureResult(definitionId: string, reason: string): PressureSensitivityResultShape` that returns `{ models: [], insufficient: [], excludedDefinitions: [{ definitionId, name: '<lookup-by-id-or-fallback-to-id>', reason }], pressureConditionExcludedCount: 0, pressureConditionExclusionBreakdown: emptyPressureConditionExclusionBreakdown(), directionalSanityCheck: <empty>, transcriptCapHit: false }`. Look up the name via a single `db.definition.findUnique` call; fall back to the id string if not found.

When `params.definitionId` is null, behavior is unchanged.

### 1.4 Add the `definitionId` argument on the resolver

**File:** `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`

Add the argument and validation:

```typescript
import { ValidationError } from '@valuerank/shared';

builder.queryField('pressureSensitivity', (t) =>
  t.field({
    type: PressureSensitivityResultRef,
    args: {
      domainId: t.arg.id({ required: false }),
      modelIds: t.arg.stringList({ required: false }),
      providerId: t.arg.id({ required: false }),
      signature: t.arg.string({ required: true }),
      definitionId: t.arg.id({ required: false }),
    },
    resolve: async (_root, args) => {
      const definitionId = args.definitionId != null ? String(args.definitionId) : null;
      const domainId = args.domainId != null ? String(args.domainId) : null;

      if (definitionId !== null && domainId !== null) {
        throw new ValidationError('Pass either domainId or definitionId, not both');
      }

      return getPressureSensitivityResult({
        domainId,
        modelIds: args.modelIds != null
          ? [...new Set(args.modelIds.map((v) => String(v)).filter((v) => v.length > 0))]
          : null,
        providerId: args.providerId != null ? String(args.providerId) : null,
        signature: String(args.signature),
        definitionId,
      });
    },
  }),
);
```

## Verification

After implementing, run from `cloud/`:

1. `npm run lint --workspace @valuerank/api`
2. `npm run lint --workspace @valuerank/shared` (no changes expected — sanity check)
3. `npm run test --workspace @valuerank/api` (existing tests should pass; new arg is optional and defaults to existing behavior)
4. `npm run build --workspace @valuerank/api`

If any of these fail, fix the underlying issue. Do NOT use `@ts-ignore` or skip lint rules. Do NOT modify other files to silence errors — investigate and address the root cause.

## Output expectations

- Three files modified: `snapshot-builder.ts`, `snapshot-cache.ts`, `pressure-sensitivity.ts`.
- Roughly 150 lines added, 0 removed.
- Lint, test, build all pass for `@valuerank/api`.
- The new `definitionId` argument is wired through but no caller uses it yet (frontend slice ships next).
- New exports from `snapshot-builder.ts`: `expandToCompanionDefinition`, `PAIR_KEY_COMPANION_COLLISION`, `PAIR_KEY_COMPANION_MIRROR_FAILURE`, `CompanionExpansionStatus`, `CompanionExpansionResult`. These are public so slice 4's tests can import them.

## After implementation

Commit with message:

```
ff(slice 1): backend definitionId arg + companion expansion + telemetry

Adds optional definitionId argument to pressureSensitivity GraphQL query.
Threads through to preparePressureSensitivityState which expands the input
to include the companion definition (matched by methodology.pair_key,
domain-bounded). Skips snapshot cache on this path; logs structured timer
telemetry. AppError on multi-candidate or mirror failure surfaces via
excludedDefinitions[] without breaking the existing query contract.

Refs: docs/workflow/feature-runs/vignette-paired-analysis/spec.md
Refs: docs/workflow/feature-runs/vignette-paired-analysis/plan.md § 3
```

Run `git status` after committing to confirm no stray files remain.

Report your findings (including any deviations from this spec, files you considered modifying but did not, or unexpected test failures) in your output.
