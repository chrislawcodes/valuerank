# Dominance Section Split Spec

## Goal

Break up [cloud/apps/web/src/components/domains/DominanceSection.tsx](/Users/chrislaw/valuerank-dominance-section-split/cloud/apps/web/src/components/domains/DominanceSection.tsx) into smaller frontend-only pieces without changing behavior, visuals, or its public API.

This is a structural compaction slice. The export name, props, labels, interactions, SVG output, and page wiring must keep working the same way.

## Why This Should Be Next

`DominanceSection.tsx` is still the best frontend-only compaction target for this session.

Why it is a good fit:

- it is a self-contained domain-analysis component with one page consumer
- it does not overlap with the active backend `run.ts` mutation split lane
- it has a clear internal seam between graph data, SVG rendering, and the lower explanation panel
- it can be split without touching shared run hooks, mutation inputs, or modal flow

Why this is safer than `RunForm.tsx` right now:

- `RunForm.tsx` sits on a busier surface with two UI consumers and many run-start concerns
- `RunForm.tsx` mixes model loading, cost estimation, final-trial planning, condition-grid selection, submit validation, and modal state
- a narrow split there likely wants a `useRunForm` extraction, which is closer to the active backend run lane and raises merge risk

So the tradeoff is simple: `RunForm.tsx` may be a later useful cleanup, but `DominanceSection.tsx` is the cleaner parallel lane today.

## Assumptions

- PR #336 is already merged and this slice should stay out of the aggregate service area.
- PR #337 is already merged and this slice should not reopen backend query work.
- No one is actively editing [cloud/apps/web/src/components/domains/DominanceSection.tsx](/Users/chrislaw/valuerank-dominance-section-split/cloud/apps/web/src/components/domains/DominanceSection.tsx) in another lane while this PR is open.
- The safest first pass keeps the public entrypoint at the same file path and export name.
- There is no strong existing test coverage for this component, so this slice should add one focused component test.

## In Scope

- [cloud/apps/web/src/components/domains/DominanceSection.tsx](/Users/chrislaw/valuerank-dominance-section-split/cloud/apps/web/src/components/domains/DominanceSection.tsx)
- new helper files under `cloud/apps/web/src/components/domains/`
- one focused web test that proves the component still renders its main shell after the split
- keeping the current import in [cloud/apps/web/src/pages/DomainAnalysis.tsx](/Users/chrislaw/valuerank-dominance-section-split/cloud/apps/web/src/pages/DomainAnalysis.tsx) unchanged

## Out Of Scope

- backend `run.ts` mutation work
- `RunForm.tsx` compaction
- visual redesign of the domain-analysis page
- changing copy, colors, spacing, or animation timing on purpose
- changing GraphQL operations, data shapes, or model-ranking logic
- broad naming cleanup
- moving other domain-analysis tables into this PR

## Current File Shape

`DominanceSection.tsx` is about 700 lines and currently mixes four jobs:

1. chart constants and SVG math helpers
2. derived graph data such as edges, contested pairs, node positions, and color ranges
3. view state such as selected model, focus, hover, and motion phase
4. large JSX blocks for the chart and the lower explanation panel

The component is readable only with a lot of scrolling because the data shaping and rendering are interleaved.

## Proposed File Layout

Create a small local split that keeps [DominanceSection.tsx](/Users/chrislaw/valuerank-dominance-section-split/cloud/apps/web/src/components/domains/DominanceSection.tsx) as the public shell:

```text
cloud/apps/web/src/components/domains/
├── DominanceSection.tsx
├── DominanceSectionChart.tsx
├── DominanceSectionSummary.tsx
└── useDominanceGraph.ts
```

Keep the shell responsible for:

- selected model state
- focused and hovered value state
- reduced-motion preference
- model-switch animation phase
- header and model picker markup

Move only the heavy internal work:

- `useDominanceGraph.ts`: derived edges, contested pairs, node positions, priority range, and related chart data
- `DominanceSectionChart.tsx`: the large SVG rendering block
- `DominanceSectionSummary.tsx`: the arrow-meaning list and contestable-pairs card

Do not extract the small model picker row into its own component in this pass. That would add indirection without removing much real complexity.

## Compatibility Rules

- Keep the public import path at [cloud/apps/web/src/components/domains/DominanceSection.tsx](/Users/chrislaw/valuerank-dominance-section-split/cloud/apps/web/src/components/domains/DominanceSection.tsx).
- Keep the `DominanceSection` export name and prop shape unchanged.
- Keep the `CopyVisualButton` integration on the chart shell.
- Keep the current `aria-label="Value dominance graph"` output.
- Keep the unavailable-model options visible and disabled in the selector.

## Behavior That Must Not Change

- model selection
- focus and unfocus behavior when a value circle is clicked
- hover highlighting
- reduced-motion handling
- model-switch collapse and expand animation timing
- node colors, edge colors, edge widths, and close-win treatment
- the contestable-pairs ranking
- displayed headings and helper text

## Edge Cases To Keep Safe

- `selectedModelId` resetting when the chosen model becomes unavailable
- `focusedValue` behavior when no model is selected
- empty `models` arrays
- unavailable-model rendering in the selector
- `Hedonism` split-ring rendering
- chart refs used by `CopyVisualButton`
- chart logic drifting because computed graph data gets split across too many files

## Risks

### Risk 1: Behavior drift hidden inside the SVG split

Most of the complexity lives in the chart JSX. A structural extraction could quietly change edge opacity, animation delay, or node rendering order if props are not passed through carefully.

### Risk 2: Over-extracting a small UI

If this PR turns every small block into its own file, the split will add import noise without making the component easier to own.

### Risk 3: Weak proof of no-change

There is no current test focused on this component. Without at least one render test, review confidence would depend too much on manual reading.

## Acceptance Criteria

1. [cloud/apps/web/src/components/domains/DominanceSection.tsx](/Users/chrislaw/valuerank-dominance-section-split/cloud/apps/web/src/components/domains/DominanceSection.tsx) becomes a smaller composition shell instead of holding all graph math and all large JSX blocks.
2. The public `DominanceSection` export path and prop shape stay unchanged.
3. The chart SVG rendering moves into a dedicated component.
4. The lower explanation and contestable-pairs panel moves into a dedicated component.
5. Derived graph data moves out of the shell into one focused hook or helper module.
6. The model picker row stays in the shell unless review finds a stronger reason to move it.
7. No visual or behavior changes are introduced on purpose.
8. The PR adds one focused web test that proves the component still renders its main shell, selector, and summary content.

## Verification

Minimum verification for implementation later:

```bash
cd /Users/chrislaw/valuerank-dominance-section-split/cloud
npm test --workspace=@valuerank/web -- --run tests/components/DominanceSection.test.tsx
npm run lint --workspace=@valuerank/web
npm run typecheck --workspace=@valuerank/web
```

Before implementation, confirm current usage remains narrow:

```bash
cd /Users/chrislaw/valuerank-dominance-section-split
rg -n "DominanceSection" cloud/apps/web/src
```
