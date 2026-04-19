---
reviewer: "codex"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/models-consistency-report/tasks.md"
artifact_sha256: "e018549e8ce22d92fb293c29f845f439bbadc4acb2b0176029a7ec72798a10e5"
repo_root: "."
git_head_sha: "a450f809c2b386ed7e089c87a5d4e83845aa4a68"
git_base_ref: "origin/main"
git_base_sha: "a450f809c2b386ed7e089c87a5d4e83845aa4a68"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH findings fixed in tasks.md: (1) ConsistencyPerPair extended with conditionsMeasured + perCondition array (with matches, trials, scenarioId) so MetricDisclosure Level-4 rows have the data they need; (2) A4 step 11 now explicitly says 'move' models below minScenarios (remove from models[] AND push to insufficient[]) so no double-counting. MEDIUM URL-writeback fixed in B4: defaults are written back via setSearchParams on first render. MEDIUM runMatchesSignature on historical data accepted as residual risk — acceptable v1 trade-off."
raw_output_path: "docs/workflow/feature-runs/models-consistency-report/reviews/tasks.codex.dependency-order-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

- High: `MetricDisclosure` is not implementable as written from the API contract in this artifact. D2 requires Level 4 rows with explicit counts and source links for both Repeatability and Coherence, but A3/A4 only expose per-scenario counts for Repeatability and no row-level count/source fields for Coherence pairs. That means the UI spec depends on data the resolver does not return.
- High: `minScenarios` is applied too late and without an explicit exclusion rule. A4 computes the model result first, then says models below the threshold go to `insufficient[]`, but it never says they must be removed from `models[]`. If that exclusion is not enforced, the same model will appear in both buckets, which breaks the scatter, table, and empty-state logic.
- Medium: The URL fallback path is incomplete. B4 says to infer default `domainId` and `signature` when they are absent, but it never says to write those defaults back to the URL. That leaves the page state, tab links, and shareable URL out of sync.
- Medium [UNVERIFIED]: The resolver assumes `runMatchesSignature(r.config, signature)` will correctly filter every historical aggregate run. If older runs use a config shape the helper does not understand, valid data will be filtered out and models can be mislabeled as `no-repeat-coverage`.

## Residual Risks

- The plan still relies on undefined details for Decision 4’s determinate-check rules and the canonical decision buckets, so implementation can still diverge if those rules are interpreted differently.
- The artifact assumes the existing data shape for `reliabilitySummary.perModel`, `analysisResults.status`, and `run.config` is stable enough for the new resolver. If any of those are inconsistent across historical data, more compatibility handling may be needed.
- The new route, filters, and drill-down links depend on URL state being kept consistent across navigation. If the page does not normalize missing or invalid params, deep links can still behave inconsistently.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH findings fixed in tasks.md: (1) ConsistencyPerPair extended with conditionsMeasured + perCondition array (with matches, trials, scenarioId) so MetricDisclosure Level-4 rows have the data they need; (2) A4 step 11 now explicitly says 'move' models below minScenarios (remove from models[] AND push to insufficient[]) so no double-counting. MEDIUM URL-writeback fixed in B4: defaults are written back via setSearchParams on first render. MEDIUM runMatchesSignature on historical data accepted as residual risk — acceptable v1 trade-off.
