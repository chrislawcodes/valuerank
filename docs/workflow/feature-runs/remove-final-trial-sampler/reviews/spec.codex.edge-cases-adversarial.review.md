---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/remove-final-trial-sampler/spec.md"
artifact_sha256: "94f3b41a95b50a8ef7e5dd0d51febbc785440a0fafa2c0e13dcceb3df6ecd0be"
repo_root: "."
git_head_sha: "e0daf3607e91b17e7b307b850dca3abfbfc86459"
git_base_ref: "origin/main"
git_base_sha: "e0daf3607e91b17e7b307b850dca3abfbfc86459"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (queue handler regression test gap) is the same circular concern addressed in §4 explicit non-goal. The three-part guardrail in §3.2 (TypeScript build on unused imports, file-scoped grep on aggregate-analysis.ts, zod schema drop of isFinalTrial) is the deliberate trade-off for a pure-deletion PR. LOW (winrate blocker rationale unverified by supplied code) is acceptable — the blocker is a product-level ordering decision, not a code claim, and Gemini round 14 independently confirmed the deletion removes pre-existing bugs in aggregate-analysis.ts that would otherwise interact badly with winRate redefinition. LOW (historical data scope check narrow) is acceptable — the grep sweep in §3.6 covers cloud/apps plus cloud/packages which is the full source tree; workers and scripts do not reference isFinalTrial per independent verification. No spec edits required."
raw_output_path: "docs/workflow/feature-runs/remove-final-trial-sampler/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- Medium [CODE-CONFIRMED]: The spec deletes the live auto-relaunch path in `cloud/apps/api/src/queue/handlers/aggregate-analysis.ts` but explicitly chooses not to add any handler-level regression test. The code today really does re-launch follow-up runs from that worker, so build/grep only prove the text is gone, not that the queue behavior still stops in the right cases. That is a meaningful gap for production background automation.
- Low [UNVERIFIED]: The spec’s ordering argument for waiting on this deletion before `winrate-honest-denominator` is not established by the supplied code. `plan-final-trial.ts` consumes `varianceAnalysis` and `modelScenarioMatrix`; the provided code does not show any direct `winRate` dependency. The blocker rationale may still be true, but it is not proven here.
- Low [UNVERIFIED]: The claim that historical `Run.config.isFinalTrial` and `runMode='FINAL'` become dead data after the change is only partially checked. The provided search scope covers the API and web slices, but not other `cloud/` consumers such as workers or scripts. A hidden reader outside the supplied context would break that assumption.

## Residual Risks

- Cached web bundles can still submit the removed `finalTrial` GraphQL input once after deploy, causing a validation failure until refresh.
- The `configExtras` sanitizer is intentionally narrow. It strips `isFinalTrial`, but it does not harden `configExtras` generally.
- If any non-API/web code reads `Run.config.isFinalTrial` or `runMode='FINAL'`, this spec would not catch it.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (queue handler regression test gap) is the same circular concern addressed in §4 explicit non-goal. The three-part guardrail in §3.2 (TypeScript build on unused imports, file-scoped grep on aggregate-analysis.ts, zod schema drop of isFinalTrial) is the deliberate trade-off for a pure-deletion PR. LOW (winrate blocker rationale unverified by supplied code) is acceptable — the blocker is a product-level ordering decision, not a code claim, and Gemini round 14 independently confirmed the deletion removes pre-existing bugs in aggregate-analysis.ts that would otherwise interact badly with winRate redefinition. LOW (historical data scope check narrow) is acceptable — the grep sweep in §3.6 covers cloud/apps plus cloud/packages which is the full source tree; workers and scripts do not reference isFinalTrial per independent verification. No spec edits required.
