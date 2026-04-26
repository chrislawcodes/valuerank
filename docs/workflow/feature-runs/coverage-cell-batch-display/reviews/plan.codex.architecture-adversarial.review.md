---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/coverage-cell-batch-display/plan.md"
artifact_sha256: "fe8cece0f5f003224ec65cb46794adce0820f07d76b3a1d1240a51db0bcf0469"
repo_root: "."
git_head_sha: "0842af56c8b34162a05e3b010f28873378ec6bb2"
git_base_ref: "origin/main"
git_base_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
generation_method: "codex-runner"
resolution_status: "rejected"
resolution_note: "All findings are false positives or intentional design — no code changes required; see Resolution section"
raw_output_path: "docs/workflow/feature-runs/coverage-cell-batch-display/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

- High: The plan drops an existing public filter on `domainValueCoverage`. The resolver still accepts `modelIds` and currently applies `run.transcripts.some(...)` to honor it, but the plan only describes replacing that gate with the `effectiveModelIds.every(...)` check. If implemented as written, any caller that relies on `modelIds` will get a different matrix even though the API still advertises the argument. [CODE-CONFIRMED]

- Medium: The new `aFirstBatchCount` / `bFirstBatchCount` logic assumes `jobChoiceValueFirst` tokens can be used directly as matrix value keys, but `getCoverageDirection()` only trims an arbitrary string and never normalizes or validates it against `COVERAGE_VALUE_KEYS`. That means token drift, casing changes, or alternate labels will silently collapse the new directional counts to zero. [CODE-CONFIRMED]

- Medium: The plan changes the counted cohort but leaves `aggregateRunId` selection untouched. In the resolver, the aggregate link target is chosen from `latestAggregateRunIdByDefinitionId` before any model-set gating, so the cell can show filtered counts while the “View Vignette Analysis” link still opens an aggregate run that does not match the filtered cohort. [CODE-CONFIRMED]

## Residual Risks

- The provided code does not prove what exact strings are stored in `jobChoiceValueFirst`, so the directional-count change still depends on a data-format assumption that may be false in some environments.

- The plan does not say whether the analysis link is supposed to stay global or follow the same filtered cohort as the cell counts. If product expects one behavior and the implementation keeps the other, users will still see a mismatch between the matrix and the drill-down target.

- Any existing downstream consumer of `domainValueCoverage` outside this UI will see changed `batchCount` and `pairedBatchCount` semantics once the model-set gate lands, even though the query shape itself does not change.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: rejected
- note: All findings are false positives or intentional design — no code changes required; see Resolution section
Finding 1 (HIGH, modelIds filter dropped) — FALSE POSITIVE. The existing matchesModelFilter
    check (lines 238-240) for the explicit filterModelIds query arg is preserved unchanged.
    matchesEffectiveModelSet is an additional gate applied before it. Both filters co-exist.

    Finding 2 (MEDIUM, direction token case sensitivity) — captured as Residual Risk 2 in plan.
    Pre-merge verification V2 (SELECT DISTINCT prod query) will surface real mismatches.
    No code change warranted without evidence of actual casing divergence in prod data.

    Finding 3 (MEDIUM, aggregateRunId cohort mismatch) — INTENTIONAL DESIGN. Aggregate runs
    bypass the model-set filter by design (fix d9588174): the analysis link target is the
    domain-wide aggregate, not scoped to the filtered model cohort. This preserves access
    to vignette analysis regardless of which model set is active.