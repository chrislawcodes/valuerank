---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/remove-decision-code/plan.md"
artifact_sha256: "33c221a08db543266041458aac83cebff45766767edd25e104475fa7e8af712f"
repo_root: "."
git_head_sha: "a50a4b6e54d0816f0ff99be3defba99d0315f4ad"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Plan round 4 accepted. HIGH buildSummaryCacheRecord hardcodes decisionCode/decisionCodeSource -> W2 step 1 now explicitly names buildSummaryCacheRecord at summarize-persistence.ts:18-46 as a required update site in addition to the type shape itself."
raw_output_path: "docs/workflow/feature-runs/remove-decision-code/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

- High [CODE-CONFIRMED] The plan omits the actual cache serialization site that still emits `decisionCode` and `decisionCodeSource`. `buildSummaryCacheRecord()` in [`summarize-persistence.ts`](/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/queue/handlers/summarize-persistence.ts#L18-L46) hardcodes both fields into every persisted `summaryCache`, and [`isSummaryCacheSummary()`](/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/queue/handlers/summarize-types.ts#L96-L109) still requires them. If W2 is applied as written, the new cache shape will not converge: new writes will keep reintroducing the removed fields or the validator will reject the row.
- Medium [CODE-CONFIRMED] W8 introduces a first-class `refusal` manual-override state, but the current validator path cannot accept it. [`validateManualAppliedDecision()`](/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model-helpers.ts#L286-L329) only allows `neutral`, `unknown`, `favor_first`, and `favor_second`; there is no `refusal` branch. The plan does not include this helper file, so refusal overrides would be rejected even though the new API claims to support them.

## Residual Risks

- The rollout still depends on old summarize workers not writing v1 caches after the backfill. The current worker path still emits `cacheVersion: 1` in [`summarize-transcript.ts`](/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/queue/handlers/summarize-transcript.ts#L96-L147), so the operational sequencing needs a real drain/rollout check, not just a deploy order.
- The provided code shows many remaining `decisionCode` call sites outside the plan’s headline files. The broad grep cleanup looks plausible, but the exact read-path surface should be re-grepped before merge to avoid one hidden consumer keeping the legacy shape alive.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Plan round 4 accepted. HIGH buildSummaryCacheRecord hardcodes decisionCode/decisionCodeSource -> W2 step 1 now explicitly names buildSummaryCacheRecord at summarize-persistence.ts:18-46 as a required update site in addition to the type shape itself.
