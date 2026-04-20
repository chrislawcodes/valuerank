---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/remove-decision-code/plan.md"
artifact_sha256: "95a4b183debafbf474ac7e0cb80546daa2329ab587ed1dca476a9063a04e1d09"
repo_root: "."
git_head_sha: "fe2d375f349891708ea81efa9f6958fbcc592998"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Plan round 6 accepted. MEDIUM other maps to ambiguous not unparseable -> will update T3.3 example mapping (decisionCode other -> parseClass ambiguous, not unparseable). MEDIUM W10 refusal conflation before apply finishes -> acknowledged: backfill-reparse-decisions should only run AFTER migration --apply has tagged all refusals. P-steps in tasks.md operational section already have this ordering. LOW W9 workspace import path -> acknowledged; implementation will use the existing cross-workspace tsx import pattern used by other scripts (e.g. via @valuerank/api package alias or direct relative import)."
raw_output_path: "docs/workflow/feature-runs/remove-decision-code/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- **Medium [CODE-CONFIRMED]** W3’s test-rewrite guidance maps current `"other"`/`None` cases to `"unparseable"`, but the worker code does not do that. In [summarize.py], unresolved cases from `extract_decision_result()` are returned with `parseClass: "ambiguous"` when `decision_code == "other"`; that behavior is also covered by the existing tests in [test_summarize.py]. If the rewrite only checks for `unparseable` or `refusal` absence, it will stop protecting the ambiguity paths that actually exist today.
- **Medium [CODE-CONFIRMED]** W10 assumes `canonicalDecision.decisionState === "unknown"` means “pure parser failure,” but the current code explicitly says v1 rows conflate refusal and unknown. The comment in [decision-model-types.ts] and the backfill logic in [backfill-canonical-v2-migration.ts] both document that `cacheVersion: 1` does not distinguish those states. That means any retained `backfill-reparse-decisions.ts` run before the `--apply` migration finishes can still mis-target refusal rows as parse failures.
- **Low [UNVERIFIED]** W9 depends on importing the live resolver into a standalone script, but the provided code only shows the current migration as a self-contained module with local helpers. The plan does not show the workspace/bootstrap path needed for a `cloud/scripts` entrypoint to safely import application resolver code, so the migration’s execution path is not yet proven.

## Residual Risks

- The plan’s central claim in A2, that the truth-table migration is wrong for paired-v2/job-choice-v2 probes, is not demonstrated by the provided code. The current repo artifacts still implement and test that truth table, so the real source of drift is still uncertain.
- I did not review the missing resolver/mutation/validator files referenced by the plan, so the exact impact of removing `decisionCode` from persistence and API paths remains partly unverified.
- The plan relies on a clean deploy order plus a later `--apply` backfill. Any operator action or background job that runs before that backfill completes still needs careful handling of mixed v1/v2 rows.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Plan round 6 accepted. MEDIUM other maps to ambiguous not unparseable -> will update T3.3 example mapping (decisionCode other -> parseClass ambiguous, not unparseable). MEDIUM W10 refusal conflation before apply finishes -> acknowledged: backfill-reparse-decisions should only run AFTER migration --apply has tagged all refusals. P-steps in tasks.md operational section already have this ordering. LOW W9 workspace import path -> acknowledged; implementation will use the existing cross-workspace tsx import pattern used by other scripts (e.g. via @valuerank/api package alias or direct relative import).
