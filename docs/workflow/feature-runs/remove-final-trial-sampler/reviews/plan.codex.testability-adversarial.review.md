---
reviewer: "codex"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/remove-final-trial-sampler/plan.md"
artifact_sha256: "ba1097ead9cd78af1474b964c939ca523619518c182eeb1a4c41a69429799304"
repo_root: "."
git_head_sha: "e0daf3607e91b17e7b307b850dca3abfbfc86459"
git_base_ref: "origin/main"
git_base_sha: "e0daf3607e91b17e7b307b850dca3abfbfc86459"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (Slice B grep-only verification) is the same circular concern as spec reviews, already addressed in spec section 4 non-goal via the three-part guardrail (TypeScript build on unused imports, file-scoped grep, zod schema drop of isFinalTrial). LOW (helper-only alias test vs mutation boundary) is rebutted in spec section 3.7.6: the deleted plan-final-trial.test.ts never covered the lifecycle.ts mutation boundary either. The new aliases.test.ts is strictly stronger because it tests all four paths (exact match, alias hit, unknown id, empty equivalents) directly as pure functions rather than indirectly through one mocked call site."
raw_output_path: "docs/workflow/feature-runs/remove-final-trial-sampler/reviews/plan.codex.testability-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1. Medium - The plan removes the final-trial follow-up flow from `aggregate-analysis.ts`, but Slice B only verifies that with build/lint and a grep. The current code path is a single queue-driven block that can still enqueue a new run via `planFinalTrial(...)` and `startRun(...)`, so a partial deletion or refactor mistake would still satisfy the stated validation without any executable test proving the behavior is gone. [CODE-CONFIRMED]

2. Low - Slice A replaces the removed `plan-final-trial.test.ts` with isolated helper tests for `resolveModelIdFromAvailable` and `getEquivalentModelIds`, but the production alias wiring now lives in the real `startRun` entry point (`cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`). A helper-only test will not catch a resolver bug that breaks alias handling at the mutation boundary. [CODE-CONFIRMED]

## Residual Risks

- The plan leans on grep and codegen for removal checks. If a stale reference survives outside the searched paths or `schema.graphql` / generated output is not refreshed in the same run, the cleanup can still look complete.
- The sanitizer coverage in Slice E is narrow. It checks one dead-key object case and optionally one primitive case, but not arrays or exotic objects.
- There may be other `startRun` callers outside the provided snippets. Those call sites are not proven clean by the artifact itself.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (Slice B grep-only verification) is the same circular concern as spec reviews, already addressed in spec section 4 non-goal via the three-part guardrail (TypeScript build on unused imports, file-scoped grep, zod schema drop of isFinalTrial). LOW (helper-only alias test vs mutation boundary) is rebutted in spec section 3.7.6: the deleted plan-final-trial.test.ts never covered the lifecycle.ts mutation boundary either. The new aliases.test.ts is strictly stronger because it tests all four paths (exact match, alias hit, unknown id, empty equivalents) directly as pure functions rather than indirectly through one mocked call site.
