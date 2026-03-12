# Dominance Section Split Plan

## Scope

Implement the structural split described in [spec.md](/Users/chrislaw/valuerank-dominance-section-split/docs/workflows/dominance-section-split/spec.md) without changing how the domain-analysis ranking and cycles section behaves.

This plan stays narrow on purpose. It covers the `DominanceSection.tsx` split only.

## Why This Slice, Not `RunForm.tsx`

`DominanceSection.tsx` is the better frontend-only compaction target right now because:

- it has one page consumer
- it does not overlap with the active backend `run.ts` mutation split lane
- its seams are mostly presentational and derived-data seams
- its state is local to one view instead of spread across run-start flows

`RunForm.tsx` is still a valid later compaction target, but it is riskier in this parallel window because:

- it has multiple consumers
- it sits close to active run-start backend work
- its likely extraction path pushes toward a `useRunForm` hook that owns validation and submit logic
- a narrow split there is easier to turn into behavior work by accident

This slice does not need to wait, but it does need to stay on a clean branch base. The current repo root has unrelated dirty workflow work, so implementation and PR prep should happen in the clean `codex/dominance-section-split` worktree.

## Implementation Steps

1. Confirm the current component usage stays narrow:
   - [cloud/apps/web/src/pages/DomainAnalysis.tsx](/Users/chrislaw/valuerank-dominance-section-split/cloud/apps/web/src/pages/DomainAnalysis.tsx)
   - no other live frontend consumers
2. Create a focused local split under `cloud/apps/web/src/components/domains/`.
3. Move derived graph data into `useDominanceGraph.ts`:
   - edges
   - contested pairs
   - node positions
   - value angles
   - chart color range inputs
4. Move the large SVG block into `DominanceSectionChart.tsx`.
5. Move the lower explanation and contestable-pairs panel into `DominanceSectionSummary.tsx`.
6. Keep [cloud/apps/web/src/components/domains/DominanceSection.tsx](/Users/chrislaw/valuerank-dominance-section-split/cloud/apps/web/src/components/domains/DominanceSection.tsx) as the public shell for:
   - selected model state
   - focus and hover state
   - reduced-motion preference
   - animation phase
   - header and model picker row
7. Add one focused component test for the split:
   - heading, helper copy, and SVG `aria-label` render
   - selector shows available and unavailable models correctly
   - changing the selected model updates visible summary content so the shell-to-hook-to-child path is covered
   - keep this as one meaningful interaction test instead of broad snapshots
8. Run the required web verification suite.
9. Prepare the canonical diff artifact and run the mandatory diff review before merge.

## Constraints

- No backend work
- No `RunForm.tsx` compaction in this PR
- No visual redesign
- No broad renames
- No intentional animation retuning
- No new shared abstraction layer beyond the local split described in the spec
- No changes to [cloud/apps/web/src/pages/DomainAnalysis.tsx](/Users/chrislaw/valuerank-dominance-section-split/cloud/apps/web/src/pages/DomainAnalysis.tsx) unless a tiny import-only adjustment becomes necessary

## Verification Suite

Required verification for the later implementation PR:

```bash
cd /Users/chrislaw/valuerank-dominance-section-split
rg -n "DominanceSection" cloud/apps/web/src
```

```bash
cd /Users/chrislaw/valuerank-dominance-section-split/cloud
npm test --workspace=@valuerank/web -- --run tests/components/DominanceSection.test.tsx
npm run lint --workspace=@valuerank/web
npm run typecheck --workspace=@valuerank/web
```

If the component test needs a more stable target than text-only assertions, prefer checking existing accessible text, current selector output, and the current SVG `aria-label` rather than snapshotting the whole chart markup.

## Review Reconciliation

- review: reviews/spec.codex.architecture.review.md | status: accepted | note: Keep the public shell stable and limit the split to chart, summary, and derived graph data.
- review: reviews/spec.gemini.requirements.review.md | status: accepted | note: Add the focused component test so the no-behavior-change claim covers shell, selector, and summary content.
- review: reviews/plan.codex.architecture.review.md | status: accepted | note: Keep the shell boundary small and use one meaningful interaction test that covers selector behavior and summary updates.
- review: reviews/plan.gemini.testability.review.md | status: accepted | note: Keep the shell boundary small and use one meaningful interaction test that covers selector behavior and summary updates.
- review: reviews/diff.codex.correctness.review.md | status: accepted | note: Keep the split structural; the focused test and local web verification covered selector and summary behavior without surfacing regressions.
- review: reviews/diff.gemini.regression.review.md | status: accepted | note: Keep the split structural; the focused test and local web verification covered selector and summary behavior without surfacing regressions.

## Ready-To-Implement Gate

Implementation should start only after:

1. The spec dual review is saved under `reviews/` and reconciled here.
2. The plan dual review is saved under `reviews/` and reconciled here.

## Notes

- This plan keeps the model picker row in the shell because splitting that small block would add little value.
- No default review-lens override is needed for this slice. The default pairs are a good fit.
