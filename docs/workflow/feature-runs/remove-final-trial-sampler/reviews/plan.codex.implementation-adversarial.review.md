---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/remove-final-trial-sampler/plan.md"
artifact_sha256: "ba1097ead9cd78af1474b964c939ca523619518c182eeb1a4c41a69429799304"
repo_root: "."
git_head_sha: "e0daf3607e91b17e7b307b850dca3abfbfc86459"
git_base_ref: "origin/main"
git_base_sha: "e0daf3607e91b17e7b307b850dca3abfbfc86459"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (no drain window for in-flight final-trial jobs) has empirically zero blast radius: discovery confirmed every caller hardcodes finalTrial false (evaluation.ts:202, execute-runs.ts:62 and 141, useRunForm.ts:193); no in-flight final-trial run is expected at deploy time. MEDIUM (intermediate broken states across slices B C D) is acceptable because all 6 slices land as a single PR, so main branch never sees a broken intermediate state; the breakage is strictly local to the PR branch during implementation. The plan explicitly requires the slices to land together."
raw_output_path: "docs/workflow/feature-runs/remove-final-trial-sampler/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- HIGH [CODE-CONFIRMED] Slice B deletes the only adaptive-sampling continuation path in `aggregate-analysis.ts`. That block is the only code that checks `config.isFinalTrial === true` and then calls `planFinalTrial(...)` and `startRun(...)` for follow-up work. The plan gives no drain or compatibility window for already-running final-trial jobs, so any in-flight final-trial run that reaches aggregation after this commit will stop scheduling more samples.
- MEDIUM [CODE-CONFIRMED] The plan deliberately leaves the repo in broken intermediate states. After B, `start-plan.ts` and `aggregate-analysis.ts` still import the deleted `plan-final-trial.ts`; after C, `lifecycle.ts`, `start-run.ts`, `evaluation.ts`, and `execute-runs.ts` still reference `finalTrial` until D lands. Because the plan explicitly expects build failures in the middle, later validation cannot tell planned breakage from a new regression.

## Residual Risks

- Cached web bundles and any non-browser GraphQL client that still sends `finalTrial` can fail or behave differently until they are refreshed against the new schema.
- The sanitizer in `start.ts` only strips `isFinalTrial` from `configExtras`. If any other config source can inject that key later, it would still reach `run.config`; that path is not shown in the provided code, so this is lower confidence.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH (no drain window for in-flight final-trial jobs) has empirically zero blast radius: discovery confirmed every caller hardcodes finalTrial false (evaluation.ts:202, execute-runs.ts:62 and 141, useRunForm.ts:193); no in-flight final-trial run is expected at deploy time. MEDIUM (intermediate broken states across slices B C D) is acceptable because all 6 slices land as a single PR, so main branch never sees a broken intermediate state; the breakage is strictly local to the PR branch during implementation. The plan explicitly requires the slices to land together.
