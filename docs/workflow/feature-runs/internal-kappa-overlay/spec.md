# Internal-Kappa Diagnostic Overlay for Model Groups

## Summary

On the Model Groups page (`/models/groups`), models are grouped into clusters by their log-odds value profiles — a summary of *what each model values*. That summary can hide real behavioral disagreement: two models can have nearly identical value profiles yet still make different choices on individual tradeoff prompts.

This feature adds a diagnostic overlay. When models are grouped by value profile (log-odds or win-rate data source), each cluster card shows the **mean pairwise Cohen's kappa** across its members — a measure of *whether the models actually behave alike*. When that internal agreement is low, the value is shown in a warning style, flagging a cluster that "looks alike on paper but behaves differently."

This slice is **web-only**. The pairwise Cohen's kappa matrix is already loaded on the page — `ModelsGroups.tsx` builds `pairwiseKappaMap` from the `modelAgreementOnTradeoffs` query — but it is currently passed only to the similarity table, not to the cluster component. The work is to thread that data into `ModelGroupsSection`, compute a per-cluster mean, and render it. No analysis math, backend contract, GraphQL schema, codegen, or migration changes.

## Goals

- Pass the already-loaded `pairwiseKappaMap` from `ModelsGroups.tsx` into `ModelGroupsSection`.
- For each cluster, compute the unweighted mean of pairwise Cohen's kappa across all member pairs.
- Show that mean internal kappa on each cluster card when grouped by value profile.
- Render the value in a warning style when it is below the low-agreement threshold.
- Show a neutral placeholder (not a warning) when internal kappa cannot be computed.
- Extend the Model Groups help panel to explain what internal kappa means and how to read the warning.
- Keep the page working with no API, GraphQL, codegen, or migration changes.

## Non-Goals

- No reverse overlay — showing value-profile spread per kappa cluster when grouped in `kappa-agreement` mode is a separate follow-up.
- No internal-agreement score for ad-hoc groups created by multi-selecting models in `individual` display mode. The overlay is for the pre-computed clusters only; an ad-hoc-group agreement score is a reasonable but separate follow-up.
- No API-side caching of internal kappa in `clusterAnalysisByMethod`; this stays a client-side computation unless per-render cost later becomes a measured problem.
- No changes to the clustering algorithm, linkage options (UPGMA / Ward), distance methods, or the data-source set.
- No new GraphQL fields, schema changes, codegen runs, or database migration.
- No changes to the dot map, bar chart, radar chart, or dendrogram visualizations themselves.
- No changes to the Model Groups page outside the cluster cards and help panel.

## Required Changes

### Threading the kappa data

- `ModelsGroups.tsx` already builds `pairwiseKappaMap` (a model-by-model lookup of pairwise Cohen's kappa) from the `modelAgreementOnTradeoffs` query and passes it to `ModelSimilarityTableSection`.
- Pass the same `pairwiseKappaMap` into `<ModelGroupsSection>` as a new optional prop.
- Also pass the agreement query's **status** into `<ModelGroupsSection>` as a prop. A bare "fetching" boolean is not enough: the `modelAgreementOnTradeoffs` query in `ModelsGroups.tsx` also has a **paused** state (it is paused via `pause: !showAgreementSection` when the signature is empty or fewer than two models are visible) and an **error** state. All three — paused, fetching, errored — leave `pairwiseKappaMap` undefined, and the component must not mislabel "not requested" or "failed" as ordinary "no data."
- This requires widening the existing query destructuring. The hook is currently read as `const [{ data: agreementData }] = useModelAgreementOnTradeoffsQuery(...)`, which discards `fetching` and `error`. That destructuring must be widened to also read `fetching` and `error`, and the parent must account for the paused state (`!showAgreementSection`) when deriving the status. This is a small, expected refactor in `ModelsGroups.tsx` — not a scope expansion.
- The parent derives a single status value with four cases and passes it down:
  - `loading` — the query is fetching;
  - `needs-more-models` — the query is paused because fewer than two models are visible (e.g. the user used "Clear all" on the Models filter). This is a common, user-caused state and must be distinguishable from a real data problem — its tooltip is actionable ("select at least two models to see internal agreement").
  - `unavailable` — the query errored, has no signature selected, or returned an empty result. This bucket is intentionally cause-agnostic: from the user's point of view the view simply has no agreement data, and the rare "every model pair shares zero scenarios" result is honestly described the same way. Its tooltip is "no agreement data for this view."
  - `ready` — `pairwiseKappaMap` is present.
- `ModelGroupsSection` must accept both the map and the status without requiring them — if the map is absent, the component still renders (see "Loading and missing data"); the status only changes the placeholder's tooltip text.

### Cluster scope vs. kappa scope

- `pairwiseKappaMap` is built from the `modelAgreementOnTradeoffs` query, which is scoped to the **visible model set** (`visibleModelIds` in `ModelsGroups.tsx`).
- The cluster cards, however, render from `clusterAnalysisByMethod`, which is **not** scoped to the visible model set — it comes from the domain-analysis query. A cluster can therefore contain members that were never part of the kappa query.
- `ModelGroupsSection` already receives the visible model set as its `models` prop. Use it: a cluster is **fully covered** only if every one of its members appears in the `models` prop.
- If a cluster has any member outside the visible model set, its internal kappa is **not** fully computable — that cluster shows the neutral placeholder, **not** a partial mean. A mean computed over only the visible subset would be silently misleading, because the displayed number would not represent the cluster the card describes.

### Computing mean internal kappa

- The overlay value is computed only for **fully covered** clusters (all members present in the `models` prop).
- For a fully covered cluster, take every unordered pair of member models and look up that pair's Cohen's kappa in `pairwiseKappaMap`.
- The cluster's internal kappa is the **unweighted mean** of all member-pair kappa values that are present.
- The denominator is the count of member pairs that **have** a kappa value — not the total count of member pairs in the cluster. Dividing by the total count would treat missing pairs as zero by the back door and understate agreement.
- Even among fully covered members, a pair may still be absent from `pairwiseKappaMap` if the two models share no scenarios. Such pairs are **excluded from the mean** — they do not count as zero. Given the high prompt overlap in ValueRank runs this is expected to be rare, but it must still be handled.
- A cluster with **one member** has no member pairs and therefore no internal kappa.
- A cluster where **no member pair** has a computable kappa also has no internal kappa.
- The computation should be memoized so it only recomputes when the clusters, the visible model set, or the kappa map change.
- If a small helper is useful, it may live in `clusterVisualizationUtils.ts` ("mean pairwise kappa over a list of member model ids"); this is optional and a judgment call for the plan.

### Rendering on cluster cards

- The overlay renders only when **both** of these are true:
  - the data source is `log-odds` or `win-rate` (not `kappa-agreement` — the overlay would be circular there, since the clusters are already built from kappa);
  - the display mode is `groups` (not `individual` — individual mode has no multi-model clusters).
- When it renders, each cluster card shows its mean internal kappa as a short labeled value (for example, an "internal agreement" line with the kappa value).
- When the cluster's mean internal kappa is **below 0.4**, the value is shown in a visually distinct warning treatment (warning/amber styling consistent with how the page already shows low-emphasis warnings). At or above 0.4 it uses normal styling.
- When the cluster has no computable internal kappa — a singleton cluster, a cluster with any member outside the visible model set, or a cluster where no member pair has a kappa value — the card shows a neutral placeholder — an em dash — in normal styling, **not** a warning. An uncomputable cluster is not a "bad" cluster; it is just one the metric does not apply to.
- The placeholder must carry an explanatory affordance — at minimum a `title` tooltip on the overlay line — so it does not read as a bug. Without it, a user sees a card labeled with several model names but a non-informative "—" and reasonably assumes something is broken. The tooltip text must state *why* the value is unavailable and distinguish the reasons:
  - **singleton cluster** — "only one model — no pair to compare";
  - **members outside the current selection** — "this cluster includes models outside the current view — internal agreement is only computed for models in the current selection." Note: do **not** promise a specific fix such as "adjust the Models filter." The Models picker is built only from ACTIVE models, so a cluster member that is deprecated/inactive cannot be added through that control at all — an actionable-sounding message would point some users at an impossible fix. The wording must be true whether or not the missing model is selectable.
  - **no shared scenarios** — "these models share no scenarios";
  - plus the page-level statuses from "Loading and missing data" — `loading`, `needs-more-models`, and `unavailable` tooltips — when the whole map is absent.
- When a cluster matches more than one non-computable case, the tooltip uses a fixed precedence: **(1) singleton**, then **(2) members outside the current selection**, then **(3) no shared scenarios**. Singleton wins because it is the most fundamental reason — a one-model cluster has no internal agreement to compute even if the user widens the model selection, so the members-outside-selection message would be misleading.
- The kappa value should be shown with a small fixed precision (two decimal places).
- Adding the line must not break the existing cluster-card layout, selection behavior (`aria-pressed`, click to toggle), or color-dot styling.
- The cluster card is a single `<Button>` whose **accessible name is currently derived from its text content** (the member labels). Existing tests assert exact button names (e.g. `Model A`, `Claude Sonnet 4.5`). Adding the overlay text inside the button would change that accessible name and break those tests and screen-reader behavior. The implementation must keep the button's accessible name exactly the member-label text — by rendering the overlay outside the button, hiding it from the accessible name, or pinning the name with an explicit `aria-label`. The existing button-name tests must still pass unchanged.

### Threshold

- The low-agreement threshold is a fixed **0.4** — the Landis & Koch boundary below which agreement is considered "fair" or worse.
- The threshold is a single named constant in `ModelGroupsSection.tsx`. It is not user-configurable in this slice.

### Loading and missing data

- The `pairwiseKappaMap` comes from a different query (`modelAgreementOnTradeoffs`) than the cluster analysis. The two can settle at different times.
- To avoid layout shift ("pop-in"), the overlay line is **always rendered** in `log-odds`/`win-rate` + `groups` mode, including while `pairwiseKappaMap` is still loading. While the map is absent or empty, the line shows the neutral em-dash placeholder; once the map arrives, the line fills in with the computed value on the next render. The card's height does not change between the two states.
- All placeholder states look the same (an em dash); only the `title` tooltip differs. When the map is absent the tooltip reflects the page-level status prop — `loading` ("agreement data is loading…"), `needs-more-models` ("select at least two models to see internal agreement"), or `unavailable` ("no agreement data for this view"). When the map is present, the tooltip reflects the per-cluster reason (singleton, members outside selection, no shared scenarios).
- There must be no error when the map is absent.

### Help panel

- The Model Groups help panel (the expandable explanation block in `ModelGroupsSection.tsx`) gains a short new subsection.
- It should explain, in plain language: internal kappa measures whether the models in a cluster actually made the same choices on the same prompts (not just whether they have similar value profiles); a low value means the cluster looks alike on paper but behaves differently; the warning style marks clusters below the 0.4 "fair agreement" line.
- The copy must describe the metric honestly for what it is: the **average Cohen's kappa across the model pairs in the cluster**. It must not imply a single holistic whole-group inter-rater statistic (such as Fleiss' kappa) — that would require raw per-prompt ratings the web client does not have. "Average agreement across the pairs of models in the group" is the accurate framing.
- The copy must also state that internal kappa is computed for the **currently selected signature** and will change when the signature picker changes. It is not a signature-independent property of the cluster — the same cluster can show different internal agreement under different signatures.
- Keep the tone and reading level consistent with the existing help-panel copy.

## Likely Files

- `cloud/apps/web/src/pages/ModelsGroups.tsx` — thread `pairwiseKappaMap` into `<ModelGroupsSection>`.
- `cloud/apps/web/src/components/domains/ModelGroupsSection.tsx` — new prop, per-cluster mean-kappa memo, cluster-card rendering, threshold constant, help-panel copy.
- `cloud/apps/web/src/components/domains/clusterVisualizationUtils.ts` — optional helper for mean pairwise kappa over a member list.
- `cloud/apps/web/tests/components/ModelGroupsSection.test.tsx` — component tests for the overlay (create if it does not already exist).

## Acceptance Criteria

- In `log-odds` or `win-rate` data-source mode with `groups` display mode, every cluster card shows its mean internal Cohen's kappa.
- The mean is the unweighted average of member-pair kappa values, excluding pairs with no computable kappa.
- A cluster whose mean internal kappa is below 0.4 shows that value in a distinct warning style; at or above 0.4 it uses normal styling.
- A singleton cluster shows a neutral em-dash placeholder in normal styling, not a warning.
- A cluster containing any member outside the visible model set shows the neutral em-dash placeholder — not a partial mean and not a warning.
- A cluster where no member pair has a computable kappa shows a neutral em-dash placeholder in normal styling, not a warning.
- The em-dash placeholder carries a `title` affordance explaining why the value is unavailable, with text that distinguishes the singleton, members-outside-selection, and no-shared-scenarios cases.
- The agreement query's status (`loading` / `needs-more-models` / `unavailable` / `ready`) is passed into `ModelGroupsSection`; while the map is absent the placeholder tooltip reflects that status — distinguishing a still-loading view, a "select at least two models" state, and a view with no agreement data.
- When a cluster matches multiple non-computable cases, the tooltip follows the fixed precedence singleton → members-outside-selection → no-shared-scenarios.
- In `kappa-agreement` data-source mode, no internal-kappa overlay is shown on any card.
- In `individual` display mode, no internal-kappa overlay is shown.
- While `pairwiseKappaMap` is unavailable, the overlay line still renders (showing the em-dash placeholder) so there is no layout shift when the data later arrives; there are no errors.
- The Model Groups help panel includes a subsection explaining internal kappa and the warning style.
- Existing cluster-card behavior — selection toggle, `aria-pressed`, color dots, member labels, the dot/bar/radar/dendrogram views — is unchanged.
- The cluster card button's accessible name is unchanged after the overlay is added — it remains exactly the member-label text, and the existing button-name tests pass without modification.
- No API, GraphQL schema, codegen, or migration changes are made.
- `npm run lint --workspace @valuerank/web`, `npm run test --workspace @valuerank/web`, and `npm run build --workspace @valuerank/web` all pass.

## Risks

- **Query timing.** `pairwiseKappaMap` and the cluster analysis come from separate queries. If the overlay is not guarded for the absent/empty case, the cluster cards could error or flash. Mitigation: explicit "render without overlay when the map is absent" path, covered by a test.
- **Cluster scope exceeds kappa scope.** Clusters come from the domain-analysis query (not model-scoped); `pairwiseKappaMap` comes from a query scoped to the visible model set. A naive mean would be computed over a partial member set and silently mislead. Mitigation: the spec requires full visible-set coverage before showing a numeric value; partially covered clusters show the placeholder. verification: a component test with a cluster whose members are a superset of the `models` prop asserts the em-dash placeholder renders, not a number.
- **Key-shape mismatch.** `pairwiseKappaMap` is keyed by model id; `DomainCluster.members[].model` must use the same id space. If they diverge, every lookup silently misses and every cluster shows the placeholder. verification: in a component test, assert a known multi-model cluster with seeded kappa values renders the computed mean, not the placeholder — a wrong key shape makes this test fail.
- **Threshold interpretation.** 0.4 is a defensible standard cutoff but still a judgment call; a poorly chosen threshold could over- or under-flag. Mitigation: single named constant, easy to tune; the help panel states the threshold explicitly so the meaning is transparent to the reader.
- **Visual noise.** Adding a line to every cluster card could clutter the compact card layout. Mitigation: keep the overlay to one short labeled line; reuse existing warning styling rather than inventing a new visual treatment.
- **Low coverage in narrow selections.** Clusters come from the domain-analysis query and can contain more models than the user's current selection. In narrow selections many clusters will be "not fully covered" and show the em-dash placeholder, reducing how much the overlay actually tells the user. This is correct behavior — an honest placeholder beats a misleading partial number — but if it also happens in the *default* model selection the feature delivers little. verification: during implementation, load a real domain in the default model selection and count how many clusters are fully covered; if it is near zero, raise it before merge — the overlay may need the kappa query widened to the clustered model set (currently a non-goal) to be useful.
- **Signature-scoped metric.** The internal kappa value depends on the selected signature; switching signatures changes it. Mitigation: the help panel states this explicitly so the number is not misread as a stable cluster property.
