# Plan

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Codex feasibility review completed across rounds 1, 4, and 5 (other attempts hit the runner's 120s/300s infra timeout — not review failures). All findings addressed in spec.md: (R1) cluster-scope vs kappa-scope mismatch -> added 'Cluster scope vs. kappa scope' section, full-coverage rule, verified risk; (R4) paused/error states beyond fetching -> 4-case status enum; (R4) 'adjust Models filter' impossible-fix for deprecated models -> tooltip reworded cause-agnostic; (R4) signature-scoped metric -> help-panel clause + risk; (R5) status-bucket conflation -> 'unavailable' made intentionally cause-agnostic; (R5) a11y cluster-card button accessible name -> explicit requirement + AC that button name stays exactly member-label text; (R5) empty-model-selection state -> 'needs-more-models' status with actionable tooltip. FF's 1+1 spec review budget is well exceeded; not re-running.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Gemini requirements review completed across rounds 2, 3, and 4 (other attempts hit the runner's infra timeout — not review failures). All findings addressed in spec.md: placeholder-looks-like-a-bug -> title affordance with cause-specific text; ad-hoc multi-select groups -> explicit non-goal; metric framing -> help copy describes it honestly as 'average Cohen's kappa across model pairs', not a Fleiss-style whole-group statistic; loading-state data not threaded -> status prop added; tooltip precedence ambiguity -> fixed precedence singleton/outside-selection/no-shared-scenarios; implicit query-destructuring refactor -> made explicit in 'Threading the kappa data'; null-kappa denominator -> explicit rule that denominator is count of valid pairs. Residual risks (low coverage in narrow selections, metric interpretation, threshold fitness) captured in spec Risks section; the coverage risk carries a concrete pre-merge verification action. FF's 1+1 spec review budget is well exceeded; not re-running.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: All 3 findings addressed in plan.md. HIGH (numeric mean from partial pair-set is false completeness) -> Architecture Choice 3 tightened: full-coverage rule now requires every member PAIR present, not just every member; any missing pair -> placeholder, not partial mean; plan explicitly supersedes the spec on this point. MEDIUM (title/aria-label not reliably accessible) -> Architecture Choice 4 rewritten: overlay renders as a sibling OUTSIDE the cluster-card button so the button name is naturally preserved and the overlay value/reason stay real accessible text; title is supplementary only. MEDIUM (status derivation may hide stale-but-usable data) -> Architecture Choice 2 + Slice 2 give explicit status priority: map present -> ready even during a stale refetch, then loading/needs-more-models/unavailable. Residual risks (default-view coverage, 0.4 cutoff) already carried in the plan Risks table with verification actions.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: deferred | note: Gemini testability-adversarial review could not complete: the Gemini API returned 429 'No capacity available for model gemini-2.5-pro on the server' across all retries — runner checkpoint plus a direct run at 600s timeout / 2 retries, and the Gemini CLI itself retried 10x internally. This is a Google-side capacity outage, not a timeout or a review disagreement. Deferring per the infra-failure path. The Codex implementation-adversarial plan review completed and is reconciled (3 findings, all addressed). The plan's test plan is additionally exercised at each slice's diff checkpoint; plan-stage testability review can be re-run when Gemini capacity returns.

## Summary

Add a per-cluster internal-agreement overlay to the Model Groups page. When models are grouped by value profile (log-odds / win-rate), each cluster card shows the mean pairwise Cohen's kappa across its members, with a warning style below 0.4 and an explained placeholder when the value is not computable.

The work is web-only and uses data already loaded on the page. It splits into two slices at a clean interface boundary:

1. A pure, unit-tested computation helper plus the shared status type.
2. The wiring (`ModelsGroups.tsx` threads data + status) and rendering (`ModelGroupsSection.tsx` renders the overlay and help copy).

No API, GraphQL, codegen, or migration changes.

## Architecture Choices

### 1. Keep the computation client-side and pure

The pairwise Cohen's kappa matrix is already built in `ModelsGroups.tsx` (`pairwiseKappaMap`, from the `modelAgreementOnTradeoffs` query). The mean-internal-kappa computation is a pure function over that map plus a cluster's member ids and the visible-model set. It lives in `clusterVisualizationUtils.ts` so it can be unit-tested in isolation, and `ModelGroupsSection` just memoizes a call to it.

### 2. The parent owns query state; the child is presentational

The agreement query's `loading` / `needs-more-models` / `unavailable` / `ready` status is derived in `ModelsGroups.tsx`, which already owns `fetching`, `error`, and the pause condition (`showAgreementSection`). `ModelGroupsSection` receives a single resolved status value plus the map. The child never re-derives query state — it only renders. This keeps the child a pure consumer and puts the one required refactor (widening the `useModelAgreementOnTradeoffsQuery` destructuring) in the one place that already has the query.

The status derivation has an **explicit priority** so a background refetch does not hide usable data: if `pairwiseKappaMap` is present the status is `ready` even when `fetching` is true (urql keeps stale `data` during a refetch); only then `loading` (fetching, no map yet); then `needs-more-models` (paused, fewer than two visible models); then `unavailable` (errored, no signature, or empty result). This addresses the Codex plan-review finding that a naive `fetching`-first derivation could flip a still-usable view to `unavailable`.

### 3. Full-coverage rule — members *and* pairs

A cluster's internal kappa is computed only when (a) every member is in the visible model set (the `models` prop), **and** (b) every member pair has a kappa value in `pairwiseKappaMap`. A mean over a partial member set or a partial pair set would not represent the cluster the card describes, so any incompleteness shows the explained placeholder instead.

This **tightens** the spec's rule. The spec allowed excluding individual missing pairs from the mean; the Codex plan-review HIGH finding showed that produces a false sense of completeness — a precise number computed from a minority of pairs. The plan is the implementation contract here and supersedes the spec on this point: any missing member pair → placeholder, not a partial mean. Given ValueRank's high prompt overlap, fully-covered pairs should be the normal case; when they are not, the honest placeholder is correct.

### 4. Render the overlay outside the cluster-card button

The cluster card is currently a single `<Button>` whose accessible name comes from its text content (the member labels), and existing tests assert exact button names. Rather than pinning the name with `aria-label` (which would override the visible text and hide the overlay from assistive tech) or `aria-hidden` (which hides it entirely), the overlay line renders as a **sibling element outside the button**, inside a wrapping card container. This keeps the button's accessible name naturally unchanged *and* keeps the overlay's value and placeholder-reason as real, accessible text. Per the Codex plan-review finding, `title` alone is not a dependable screen-reader channel — the value and the placeholder reason must be conveyed as visible/accessible text, with `title` only as a supplementary hover affordance.

### 5. Always render the overlay line to avoid pop-in

In log-odds/win-rate + groups mode the overlay line is always present, showing the em-dash placeholder while the map is absent and filling in when it arrives. The card height does not change between states.

## Proposed Implementation Slices

### Slice 1: Mean-internal-kappa helper and agreement-status type

Files:

- `cloud/apps/web/src/components/domains/clusterVisualizationUtils.ts`
- `cloud/apps/web/tests/components/clusterVisualizationUtils.test.ts` (create if absent)

Work:

- add an exported `AgreementStatus` type: `'loading' | 'needs-more-models' | 'unavailable' | 'ready'`
- add a pure helper that, given a cluster's member model ids, the visible model-id set, and `pairwiseKappaMap`, returns either the computed mean or a discriminated not-computable result with a `reason` of `'singleton' | 'members-outside-selection' | 'no-shared-scenarios'`
- helper rules, in this precedence order: one member -> `singleton`; any member not in the visible set -> `members-outside-selection`; any member pair missing from the map -> `no-shared-scenarios` (the `no-shared-scenarios` reason now means "at least one member pair has no kappa value", not only "every pair"); otherwise the mean over all member pairs (every pair is present, so the denominator is the full pair count)
- unit tests: all-pairs-present multi-model cluster returns the correct mean (denominator = full pair count); singleton; a member outside the visible set; a cluster with one member pair missing resolves to `no-shared-scenarios` (not a partial mean); precedence (singleton + outside-selection resolves to `singleton`; outside-selection + a missing pair resolves to `members-outside-selection`)

Expected size: ~100-140 lines changed

[CHECKPOINT]

### Slice 2: Thread data, render the overlay, extend the help panel

Files:

- `cloud/apps/web/src/pages/ModelsGroups.tsx`
- `cloud/apps/web/src/components/domains/ModelGroupsSection.tsx`
- `cloud/apps/web/tests/components/ModelGroupsSection.test.tsx`

Work:

- `ModelsGroups.tsx`: widen the `useModelAgreementOnTradeoffsQuery` destructuring to also read `fetching` and `error`; derive the four-case `AgreementStatus` with explicit priority — map present -> `ready` (even during a stale refetch); else fetching -> `loading`; else paused for fewer than two visible models -> `needs-more-models`; else -> `unavailable`; pass `pairwiseKappaMap` and the derived status into `<ModelGroupsSection>`
- `ModelGroupsSection.tsx`: accept the two new optional props; add a single named `LOW_AGREEMENT_THRESHOLD = 0.4` constant; memoize per-cluster internal kappa via the Slice 1 helper (memo deps: clusters, `models` prop, `pairwiseKappaMap`); render the overlay line as a **sibling outside the cluster-card `<Button>`** (inside a wrapping card container) so the button's accessible name is naturally preserved and the overlay text stays accessible; render it only in log-odds/win-rate + groups mode; show the value with two-decimal precision, warning style below 0.4, normal style at or above; show the em-dash placeholder otherwise, with the value/placeholder-reason conveyed as real accessible text (not `title` alone — `title` is a supplementary hover affordance only) following the precedence (singleton -> members-outside-selection -> no-shared-scenarios) when the map is present, and the page-level status text (`loading` / `needs-more-models` / `unavailable`) when the map is absent; add the help-panel subsection describing the metric honestly (average of pairwise kappa, signature-scoped, 0.4 line)
- tests: value renders for an all-pairs-present cluster; warning style below threshold; placeholder + correct accessible reason text for singleton, members-outside-selection, no-shared-scenarios (including a cluster with one missing pair); no overlay in `kappa-agreement` mode; no overlay in `individual` mode; placeholder renders (no error) while the map is absent; the overlay value/reason is reachable as accessible text (not `title`-only); existing cluster-card button-name tests still pass unchanged

Expected size: ~160-220 lines changed

[CHECKPOINT]

## Testing Plan

For each slice:

- run the focused web tests for the files touched by that slice
- run `npm run lint --workspace @valuerank/web`
- run `npm run build --workspace @valuerank/web`

For the final combined diff:

- run `npm run test --workspace @valuerank/web`
- run `npm run lint --workspace @valuerank/web` and `npm run build --workspace @valuerank/web`
- perform the coverage verification described in Risks below, on a real domain in the default model selection

## Risks and Mitigations

| Risk | Mitigation | Verification |
|---|---|---|
| **Cluster scope exceeds kappa scope.** Clusters come from the domain-analysis query (not model-scoped); `pairwiseKappaMap` is scoped to the visible model set. A naive mean would be silently partial. | Full-coverage rule — a numeric value renders only when every cluster member is in the `models` prop; otherwise the placeholder. | verification: a Slice 2 component test with a cluster whose members are a superset of the `models` prop asserts the em-dash placeholder renders, not a number. |
| **Key-shape mismatch.** `pairwiseKappaMap` is keyed by model id; `DomainCluster.members[].model` must use the same id space, or every lookup silently misses. | Use the same id field both sides already use elsewhere on the page. | verification: a Slice 2 component test seeds a known multi-model cluster with kappa values and asserts the computed mean renders — a wrong key shape makes this test fail. |
| **Low coverage in the default view.** If default-view clusters routinely contain non-default or deprecated models, most cards show the placeholder and the overlay is uninformative. | Correct behavior is preferred over a misleading number; but the feature's value depends on coverage being decent in the common case. | verification: during Slice 2 implementation, load a real domain in the default model selection and count how many clusters are fully covered. If it is near zero, raise it before merge — the overlay may need the kappa query widened to the clustered model set (currently a non-goal). |
| **Accessible name regression.** Adding overlay text inside the cluster-card `<Button>` would change its accessible name and break existing button-name tests. | Pin the button's accessible name with an explicit `aria-label` equal to the member-label text. | verification: the existing `ModelGroupsSection.test.tsx` button-name assertions must pass unchanged after Slice 2. |
| **Threshold fitness.** 0.4 is a defensible but general cutoff that may over- or under-flag for ValueRank's behavior patterns. | Single named constant, trivial to tune; the help panel states the threshold explicitly so the meaning is transparent. | verification: confirm `LOW_AGREEMENT_THRESHOLD` is a single named constant referenced everywhere the warning style is applied — grep for the literal `0.4` in the component to ensure no second hard-coded copy. |

## Acceptance Notes

- In log-odds or win-rate mode with groups display, each cluster card shows its mean internal Cohen's kappa, warning-styled below 0.4.
- Singleton clusters, clusters with any member outside the visible set, and clusters with any member pair missing a kappa value show an explained em-dash placeholder — not a warning and not a partial mean.
- No overlay in `kappa-agreement` data-source mode or in `individual` display mode.
- The placeholder's reason is reachable as accessible text (not `title`-only) and distinguishes loading, needs-more-models, unavailable, and the three per-cluster reasons.
- The help panel explains the metric honestly (average of pairwise kappa, signature-scoped, 0.4 line).
- The overlay renders outside the cluster-card button; existing cluster-card behavior and button accessible names are unchanged.
- No API, GraphQL schema, codegen, or migration changes; web lint, test, and build pass.
