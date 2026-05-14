# Internal-Kappa Diagnostic Overlay — Tasks

## Status

- Slice 1: not started
- Slice 2: not started
- Web lint / test / build: not run
- Coverage verification (real domain, default selection): not run

## Slice 1: Mean-internal-kappa helper and agreement-status type

Pure computation and types. No UI, no query wiring. This is the stable interface that Slice 2 consumes.

Files:

- `cloud/apps/web/src/components/domains/clusterVisualizationUtils.ts`
- `cloud/apps/web/tests/components/clusterVisualizationUtils.test.ts` (create if absent)

Work:

- export an `AgreementStatus` type: `'loading' | 'needs-more-models' | 'unavailable' | 'ready'`
- export a result type for the helper: either `{ kind: 'value'; mean: number }` or `{ kind: 'not-computable'; reason: 'singleton' | 'members-outside-selection' | 'no-shared-scenarios' }`
- add a pure helper `meanInternalKappa(memberModelIds, visibleModelIdSet, pairwiseKappaMap)` implementing this precedence:
  1. one member -> `not-computable` / `singleton`
  2. any member not in `visibleModelIdSet` -> `not-computable` / `members-outside-selection`
  3. any member pair missing from `pairwiseKappaMap` -> `not-computable` / `no-shared-scenarios` (any missing pair, not only all)
  4. otherwise -> `value` with the unweighted mean over all member pairs (every pair present; denominator is the full pair count)
- unit tests:
  - all-pairs-present 3-model cluster -> correct mean (denominator = 3 pairs)
  - singleton cluster -> `singleton`
  - a member outside the visible set -> `members-outside-selection`
  - one member pair missing -> `no-shared-scenarios` (not a partial mean)
  - precedence: singleton + member-outside-selection -> `singleton`
  - precedence: member-outside-selection + a missing pair -> `members-outside-selection`

Verification:

- `npm run lint --workspace @valuerank/web`
- focused test run for `clusterVisualizationUtils.test.ts`
- `npm run build --workspace @valuerank/web`

Expected size: ~100-140 lines changed

[CHECKPOINT]

## Slice 2: Thread data, render the overlay, extend the help panel

Consumes the Slice 1 helper. Wiring in the page, rendering in the component, help copy, component tests.

Files:

- `cloud/apps/web/src/pages/ModelsGroups.tsx`
- `cloud/apps/web/src/components/domains/ModelGroupsSection.tsx`
- `cloud/apps/web/tests/components/ModelGroupsSection.test.tsx`

Work — `ModelsGroups.tsx`:

- widen the `useModelAgreementOnTradeoffsQuery` destructuring to also read `fetching` and `error`
- derive the four-case `AgreementStatus` with explicit priority: `pairwiseKappaMap` present -> `ready` (even during a stale refetch); else `fetching` -> `loading`; else paused for fewer than two visible models -> `needs-more-models`; else -> `unavailable`
- pass `pairwiseKappaMap` and the derived status into `<ModelGroupsSection>`

Work — `ModelGroupsSection.tsx`:

- accept the two new optional props (`pairwiseKappaMap`, agreement status)
- add a single named `LOW_AGREEMENT_THRESHOLD = 0.4` constant
- memoize per-cluster internal kappa via the Slice 1 helper (memo deps: clusters, `models` prop, `pairwiseKappaMap`)
- render the overlay line only in log-odds/win-rate data source + `groups` display mode
- render the overlay line as a sibling **outside** the cluster-card `<Button>`, inside a wrapping card container, so the button's accessible name is naturally preserved and the overlay text stays accessible
- always render the line in that mode (em-dash placeholder while the map is absent) so there is no pop-in
- show the value with two-decimal precision; warning style below 0.4, normal style at or above
- for not-computable / absent-map cases, show the em-dash placeholder with the reason conveyed as real accessible text (not `title` alone — `title` is supplementary): per-cluster reason (singleton / members-outside-selection / no-shared-scenarios) when the map is present; page-level status (`loading` / `needs-more-models` / `unavailable`) when the map is absent
- add the help-panel subsection: explains internal kappa as the average Cohen's kappa across the cluster's model pairs (not a Fleiss-style whole-group statistic), notes it is computed for the currently selected signature and changes with it, and explains the 0.4 warning line

Work — `ModelGroupsSection.test.tsx`:

- value renders for an all-pairs-present cluster
- warning style applied below 0.4, normal style at/above
- placeholder + correct accessible reason text for singleton, members-outside-selection, and no-shared-scenarios (including a cluster with exactly one missing pair)
- no overlay rendered in `kappa-agreement` data-source mode
- no overlay rendered in `individual` display mode
- placeholder renders with no error while the map is absent
- the overlay value/reason is reachable as accessible text, not `title`-only
- existing cluster-card button-name tests pass unchanged

Verification:

- `npm run lint --workspace @valuerank/web`
- focused test run for `ModelGroupsSection.test.tsx`
- `npm run build --workspace @valuerank/web`
- coverage check (plan Risk): load a real domain in the default model selection, count how many clusters are fully covered; if near zero, raise before merge

Expected size: ~160-220 lines changed

[CHECKPOINT]

## Verification Plan

Per slice: run the focused web tests for the files touched, `npm run lint --workspace @valuerank/web`, and `npm run build --workspace @valuerank/web`.

Final combined diff:

- `npm run test --workspace @valuerank/web`
- `npm run lint --workspace @valuerank/web`
- `npm run build --workspace @valuerank/web`
- coverage verification on a real domain in the default model selection (plan Risk: "Low coverage in the default view")
