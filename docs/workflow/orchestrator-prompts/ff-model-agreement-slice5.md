# Codex Prompt — Model Agreement on Tradeoffs · Slice 5: Wire-up + Delete Old

You are implementing **slice 5 of 5** (final slice) in a Feature Factory feature. The full design is in:

- Spec: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/spec.md`
- Plan: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/plan.md`
- Tasks: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/tasks.md`

**Read those three docs first.** This prompt is a focused task list for slice 5 only.

Slices 1-4 already shipped. The new section components exist alongside the old ones. Time to wire up the new components into `ModelsGroups.tsx` and delete the old code.

## Repo

- Working branch: `ff/model-agreement-on-tradeoffs`
- Working dir: repo root
- Do NOT push or open a PR — slice 5 commits leave the branch ready for `/ship`. The human runs `/ship` separately.

## What this slice does

1. Replace `ModelGroupingSignificanceSection` import + usage in `ModelsGroups.tsx` with `ModelAgreementSection`.
2. Delete the old API resolver, types, math library, and tests.
3. Delete the old web GraphQL operation, the table component, the table test, and the section component.
4. Re-run codegen so `graphql.ts` no longer contains the old operations.
5. Run the full preflight gate from `cloud/CLAUDE.md`.

## Files to MODIFY

### `cloud/apps/web/src/pages/ModelsGroups.tsx`

- Remove imports of `ModelGroupingSignificanceQuery*`, `ModelGroupingSignificanceQueryVariables`, `MODEL_GROUPING_SIGNIFICANCE_QUERY`, `ModelGroupingSignificanceSection`.
- Add imports of the new query types/document and `ModelAgreementSection`.
- Replace the `useQuery<ModelGroupingSignificance*>` block with the new query hook (or use `useModelAgreementOnTradeoffsQuery` if codegen produced a hook).
- Replace the `<ModelGroupingSignificanceSection ... />` usage with `<ModelAgreementSection ... />`. Pass the same set of props that ModelAgreementSection requires (modelIds, scope, domainId, signature) — read the component's props type to know the exact shape.
- Remove any pending-polling `useEffect` that was specific to the significance section IF the new section handles its own pending polling internally. (If it doesn't, port the polling pattern over.)
- DO NOT touch any other section of the page (cluster analysis, similarity metrics, etc.).

### `cloud/apps/api/src/graphql/queries/index.ts`

- Remove the `import './model-grouping-significance.js';` line.

## Files to DELETE

### API
- `cloud/apps/api/src/graphql/queries/model-grouping-significance.ts`
- `cloud/apps/api/src/graphql/types/model-grouping-significance.ts`
- `cloud/apps/api/src/services/model-grouping-significance/math.ts`
- `cloud/apps/api/tests/services/model-grouping-significance/math.test.ts`
- The directories `cloud/apps/api/src/services/model-grouping-significance/` and `cloud/apps/api/tests/services/model-grouping-significance/` if they're empty after the file deletes.

### Web
- `cloud/apps/web/src/api/operations/modelGroupingSignificance.ts`
- `cloud/apps/web/src/api/operations/modelGroupingSignificance.graphql`
- `cloud/apps/web/src/components/models/ModelGroupingSignificanceTable.tsx`
- `cloud/apps/web/src/components/models/ModelGroupingSignificanceTable.test.tsx`
- `cloud/apps/web/src/components/models/ModelGroupingSignificanceSection.tsx`
- (DO NOT delete `ModelGroupingSignificanceHeatmap.tsx` — slice 4 already renamed it to `ModelAgreementHeatmap.tsx`.)

## After deletes — re-run codegen

```bash
cd /Users/chrislaw/valuerank/cloud && npm run codegen --workspace @valuerank/web
```

This regenerates `graphql.ts` without the old `ModelGroupingSignificance*` types. Commit the regenerated file.

## Verification — full preflight gate

Run from `/Users/chrislaw/valuerank/cloud/`:

```bash
npm run lint --workspace @valuerank/shared
npm run lint --workspace @valuerank/db
npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
npm run lint --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

ALL six commands must pass with zero errors. Pre-existing warnings are fine; zero NEW warnings.

## Sanity grep — no orphan references

```bash
cd /Users/chrislaw/valuerank
rg "modelGroupingSignificance|ModelGroupingSignificance" cloud/ --glob '!cloud/apps/web/src/generated/graphql.ts'
```

Should return ZERO matches in production code (the regenerated `graphql.ts` is excluded because grep against generated files is noisy; codegen already scrubbed it anyway).

## Commit

ONE commit:

```
ff(model-agreement) slice 5: wire up new section + delete old significance code

- ModelsGroups.tsx now imports ModelAgreementSection (cluster analysis untouched)
- API queries index removes model-grouping-significance import
- DELETED (API): model-grouping-significance.ts (resolver), types/model-grouping-significance.ts,
  services/model-grouping-significance/math.ts + test, parent folders
- DELETED (Web): modelGroupingSignificance.ts, modelGroupingSignificance.graphql,
  ModelGroupingSignificanceTable.tsx + test, ModelGroupingSignificanceSection.tsx
- graphql.ts regenerated (old ModelGroupingSignificance types removed)
- Full preflight gate passes

Slice 5 of 5 (final). See docs/workflow/feature-runs/model-agreement-on-tradeoffs/.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Constraints

- DO NOT push, DO NOT open a PR. The human runs `/ship` after this slice lands.
- DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `.gitignore`, FF spec/plan/tasks files.
- DO NOT touch the cluster analysis, similarity metrics, dendrogram, or any other section of `ModelsGroups.tsx` outside the significance-section replacement.
- No `@ts-ignore`, no `eslint-disable`, no `any` casts.
- If preflight fails, fix the root cause properly before committing.
