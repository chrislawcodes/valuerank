---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/remove-final-trial-sampler/spec.md"
artifact_sha256: "94f3b41a95b50a8ef7e5dd0d51febbc785440a0fafa2c0e13dcceb3df6ecd0be"
repo_root: "."
git_head_sha: "e0daf3607e91b17e7b307b850dca3abfbfc86459"
git_base_ref: "origin/main"
git_base_sha: "e0daf3607e91b17e7b307b850dca3abfbfc86459"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "All 4 findings describe pre-existing bugs in the code being deleted (Gemini explicitly frames them as 'strengthening the case for deletion'). HIGH #1 (follow-up run model ID validation fails without alias resolution) and HIGH #2 (cross-definition-version data mixing in wildcard branch) both dissolve because aggregate-analysis.ts lines 131-196 are being deleted per §3.2. MEDIUM (loose cost estimate upper bound via finalTrial?10) is fixed by §3.3's ternary collapse on line 186 — estimates now reflect the actual non-final path. LOW (finalTrialPlan query temperature inconsistency) dissolves with the query file per §3.1. No spec edits required; deletion itself is the fix for all four."
raw_output_path: "docs/workflow/feature-runs/remove-final-trial-sampler/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

Here is an adversarial review of the spec artifact. The findings focus on latent bugs in the feature being removed, which strengthen the case for its deletion as specified.

### High Severity

| Finding | Evidence |
| :--- | :--- |
| **Follow-up runs could fail due to model ID changes.** The adaptive sampling handler in `aggregate-analysis.ts` would re-trigger a `finalTrial` run by collecting model IDs from historical run configs. It then passed these raw IDs directly to the `startRun` service. However, `startRun` validates that all model IDs are `ACTIVE` and does not perform model alias resolution (e.g., mapping an old `gemini-2.5-flash-preview-05-20` to the current `gemini-2.5-flash`). The planning service (`planFinalTrial`) was alias-aware, but the service that re-launches the run was not. This would cause follow-up runs to fail with a `ValidationError` if any model ID had been superseded since the original run. | `[CODE-CONFIRMED]` |
| **Legacy aggregation jobs could mix data from different definition versions.** The adaptive sampling logic in `aggregate-analysis.ts` had a compatibility "wildcard" for jobs queued without a `definitionVersion`. In this case, it would find all `finalTrial` runs that matched the `preambleVersionId` and `temperature`, regardless of their `definitionVersion`. This could lead to it collecting models from runs based on different versions of the definition's logic and then launching a new sampling run against the *current* definition version. This cross-version data mixing is a critical flaw that could lead to incorrect stability analysis and invalid follow-up runs. | `[CODE-CONFIRMED]` |

### Medium Severity

| Finding | Evidence |
| :--- | :--- |
| **Cost estimation for follow-up runs was consistently inaccurate.** The `startRun` service estimated costs for `finalTrial` runs using a hardcoded upper bound of 10 samples per condition. However, the `planFinalTrial` service calculated the precise number of `neededSamples`, which could be less than 10. `startRun` called the cost estimator *before* it generated the actual job plan, meaning the estimate shown to the user and stored in the config was always a loose, conservative over-estimation rather than a reflection of the real plan. | `[CODE-CONFIRMED]` |

### Low Severity

| Finding | Evidence |
| :--- | :--- |
| **The GraphQL `finalTrialPlan` query was inconsistent with the backend behavior.** The `finalTrialPlan` GraphQL query provided no way to specify a `temperature`, causing it to always invoke `planFinalTrial` for the `null` (default) temperature. However, the automated follow-up logic in the `aggregate-analysis` handler *did* partition runs by temperature and passed the specific temperature to `planFinalTrial`. This meant a plan viewed in the UI via the GraphQL query could show `STABLE` (for default temperature), while the backend handler could correctly determine more samples were needed for a non-default temperature, leading to a confusing user experience. | `[CODE-CONFIRMED]` |

## Residual Risks

The specification is exceptionally thorough and proactively addresses most risks. The following are minor residual risks that remain even with the spec as written.

1.  **Stale Database Keys:** The spec correctly notes that historical `Run.config` JSON blobs will retain a dead `isFinalTrial` key. While no code will read this, it creates documentation debt. A future developer querying the database might misinterpret the key's presence as meaningful, leading to confusion or incorrect assumptions during unrelated feature work or debugging.
2.  **Brittle Grep-Based Validation:** The spec's acceptance criteria rely on a `grep` command returning an *exact* number of matches for the `isFinalTrial` string. While the primary guardrail is the unit test, this validation step is brittle. Minor, good-faith implementation changes in the sanitizer or test (e.g., adding a comment with the keyword) could break this check and cause CI friction, despite the code being functionally correct.
3.  **Stale Browser Bundles:** The spec correctly identifies that a user with a cached browser bundle could see a `startRun` mutation fail because the server will no longer accept the `finalTrial` input field. While the blast radius is noted as small, this remains a guaranteed-to-occur negative user experience for at least some users post-deployment, requiring a hard refresh to resolve.

## Token Stats

- total_input=49159
- total_output=979
- total_tokens=54449
- `gemini-2.5-pro`: input=49159, output=979, total=54449

## Resolution
- status: accepted
- note: All 4 findings describe pre-existing bugs in the code being deleted (Gemini explicitly frames them as 'strengthening the case for deletion'). HIGH #1 (follow-up run model ID validation fails without alias resolution) and HIGH #2 (cross-definition-version data mixing in wildcard branch) both dissolve because aggregate-analysis.ts lines 131-196 are being deleted per §3.2. MEDIUM (loose cost estimate upper bound via finalTrial?10) is fixed by §3.3's ternary collapse on line 186 — estimates now reflect the actual non-final path. LOW (finalTrialPlan query temperature inconsistency) dissolves with the query file per §3.1. No spec edits required; deletion itself is the fix for all four.
