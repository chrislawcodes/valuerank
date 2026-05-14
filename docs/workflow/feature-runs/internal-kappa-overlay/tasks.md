# Internal-Kappa Diagnostic Overlay — Tasks

## Status

- Slice 1: complete
- Slice 2: complete
- Web lint / test / build: passed (0 lint errors, 1466 tests pass, build OK)
- Coverage verification (real domain, default selection): not run

## Slice 1: Mean-internal-kappa helper and agreement-status type

Pure computation and types. No UI, no query wiring. This is the stable interface that Slice 2 consumes. Full requirements are in spec.md and plan.md (Architecture Choices 1 and 3, Slice 1).

Files in scope:

- `cloud/apps/web/src/components/domains/clusterVisualizationUtils.ts`
- `cloud/apps/web/tests/components/clusterVisualizationUtils.test.ts` (create if absent)

- [x] In `cloud/apps/web/src/components/domains/clusterVisualizationUtils.ts`, export an `AgreementStatus` type with the four string values `'loading' | 'needs-more-models' | 'unavailable' | 'ready'`.
- [x] In `clusterVisualizationUtils.ts`, export a discriminated result type for the helper: either `{ kind: 'value'; mean: number }` or `{ kind: 'not-computable'; reason: 'singleton' | 'members-outside-selection' | 'no-shared-scenarios' }`.
- [x] In `clusterVisualizationUtils.ts`, add a pure helper `meanInternalKappa(memberModelIds, visibleModelIdSet, pairwiseKappaMap)` with this exact precedence: (1) one member → not-computable `singleton`; (2) any member not in `visibleModelIdSet` → not-computable `members-outside-selection`; (3) any member pair missing from `pairwiseKappaMap` → not-computable `no-shared-scenarios` (any missing pair, not only all); (4) otherwise → `value` with the unweighted mean over every member pair (denominator is the full pair count). Reuse the same model-id space `pairwiseKappaMap` is keyed by.
- [x] In `cloud/apps/web/tests/components/clusterVisualizationUtils.test.ts`, add unit tests for the helper: all-pairs-present 3-model cluster returns the correct mean (denominator = 3 pairs); singleton → `singleton`; a member outside the visible set → `members-outside-selection`; one member pair missing → `no-shared-scenarios` (not a partial mean); precedence singleton + member-outside-selection → `singleton`; precedence member-outside-selection + a missing pair → `members-outside-selection`.
- [x] From `cloud/`, run `npm run lint --workspace @valuerank/web` and `npm run build --workspace @valuerank/web` and the focused test for `clusterVisualizationUtils.test.ts`; fix all errors. Do not use `any` or `@ts-ignore`. Commit the slice.
- [CHECKPOINT]

## Slice 2: Thread data, render the overlay, extend the help panel

Consumes the Slice 1 helper. Wiring in the page, rendering in the component, help copy, component tests. Full requirements are in spec.md and plan.md (Architecture Choices 2, 4, 5, Slice 2).

Files in scope:

- `cloud/apps/web/src/pages/ModelsGroups.tsx`
- `cloud/apps/web/src/components/domains/ModelGroupsSection.tsx`
- `cloud/apps/web/tests/components/ModelGroupsSection.test.tsx`

- [x] In `cloud/apps/web/src/pages/ModelsGroups.tsx`, widen the `useModelAgreementOnTradeoffsQuery` destructuring to also read `fetching` and `error` (it currently reads only `data`).
- [x] In `ModelsGroups.tsx`, derive the four-case `AgreementStatus` with this explicit priority: `pairwiseKappaMap` present → `ready` (even during a stale refetch); else `fetching` → `loading`; else paused for fewer than two visible models → `needs-more-models`; else → `unavailable`. Pass `pairwiseKappaMap` and the derived status into `<ModelGroupsSection>` as new props.
- [x] In `cloud/apps/web/src/components/domains/ModelGroupsSection.tsx`, accept the two new optional props (`pairwiseKappaMap`, agreement status) and add a single named `LOW_AGREEMENT_THRESHOLD = 0.4` constant.
- [x] In `ModelGroupsSection.tsx`, memoize per-cluster internal kappa via the Slice 1 `meanInternalKappa` helper (memo deps: clusters, the `models` prop, `pairwiseKappaMap`).
- [x] In `ModelGroupsSection.tsx`, render the overlay line on each cluster card — only in log-odds/win-rate data source + `groups` display mode — as a sibling element **outside** the cluster-card `<Button>` inside a wrapping card container, so the button's accessible name is unchanged. Always render the line in that mode (em-dash placeholder while the map is absent) to avoid pop-in. Show the value at two-decimal precision, warning style below 0.4 and normal style at/above. For not-computable or absent-map cases show the em-dash placeholder with the reason as real accessible text (not `title` alone): per-cluster reason (singleton / members-outside-selection / no-shared-scenarios) when the map is present; page-level status text (`loading` / `needs-more-models` / `unavailable`) when the map is absent.
- [x] In `ModelGroupsSection.tsx`, add the help-panel subsection: internal kappa is the average Cohen's kappa across the cluster's model pairs (not a Fleiss-style whole-group statistic), it is computed for the currently selected signature and changes with it, and the 0.4 line marks "fair or worse" agreement.
- [x] In `cloud/apps/web/tests/components/ModelGroupsSection.test.tsx`, add/extend tests: value renders for an all-pairs-present cluster; warning style below 0.4 and normal at/above; placeholder + correct accessible reason text for singleton, members-outside-selection, and no-shared-scenarios (including a cluster with exactly one missing pair); no overlay in `kappa-agreement` data-source mode; no overlay in `individual` display mode; placeholder renders with no error while the map is absent; the overlay value/reason is reachable as accessible text (not `title`-only); existing cluster-card button-name tests still pass unchanged.
- [x] From `cloud/`, run `npm run lint --workspace @valuerank/web`, the focused test for `ModelGroupsSection.test.tsx`, and `npm run build --workspace @valuerank/web`; fix all errors. Do not use `any` or `@ts-ignore`. Commit the slice.
- [CHECKPOINT]

## Verification Plan

Per slice: the final task in each slice runs the focused web tests for the files touched, `npm run lint --workspace @valuerank/web`, and `npm run build --workspace @valuerank/web` from `cloud/`.

Final combined diff (orchestrator, after Slice 2):

- run `npm run test --workspace @valuerank/web`
- run `npm run lint --workspace @valuerank/web` and `npm run build --workspace @valuerank/web`
- coverage verification on a real domain in the default model selection (plan Risk: "Low coverage in the default view") — count how many clusters are fully covered; if near zero, raise before merge
