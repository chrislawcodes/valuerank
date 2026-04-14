---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/remove-final-trial-sampler/spec.md"
artifact_sha256: "94f3b41a95b50a8ef7e5dd0d51febbc785440a0fafa2c0e13dcceb3df6ecd0be"
repo_root: "."
git_head_sha: "e0daf3607e91b17e7b307b850dca3abfbfc86459"
git_base_ref: "origin/main"
git_base_sha: "e0daf3607e91b17e7b307b850dca3abfbfc86459"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (queue handler regression test gap) already addressed in §4 as explicit non-goal. The three-part guardrail in §3.2 is the deliberate trade-off: TypeScript build catches unused imports for planFinalTrial and startRun; file-scoped grep of aggregate-analysis.ts for the three keywords returns zero matches; zod schema zRunConfig drops isFinalTrial so future reads fail at build time. Standing up a new Prisma queue mock harness for a pure-deletion PR is scope creep. LOW (atomic deploy assumption) is addressed in §10 points 2 and 3 — API and web deploy together from cloud monorepo on Railway; aggregate-analysis.ts lives in cloud apps api; stale browser bundle window is explicitly called out."
raw_output_path: "docs/workflow/feature-runs/remove-final-trial-sampler/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- Medium: [CODE-CONFIRMED] The spec deletes a live background behavior in [`aggregate-analysis.ts`](/Users/chrislaw/valuerank/.claude/worktrees/goofy-shtern/cloud/apps/api/src/queue/handlers/aggregate-analysis.ts) but explicitly forbids a replacement regression test. The code still contains the follow-up branch that re-reads final-trial runs and can call `startRun({ finalTrial: true })`; build and grep can prove the strings are gone, but they do not exercise the queue path itself.
- Low: [UNVERIFIED] The rollout section assumes API and web deploy atomically and that stale clients only need a refresh. The provided code does not establish that deployment model, so if the schema and browser bundle can drift, removing `finalTrial` from the GraphQL input will hard-fail older clients until they refresh.

## Residual Risks

- Historical `Run.config.isFinalTrial` JSON will remain in old rows. That is intentional in the spec, but any code outside the provided files that still reads it would keep depending on dead data.
- The alias-coverage migration is safer than deleting the test outright, but it changes coverage from end-to-end behavior to pure-function behavior. If `planFinalTrial` had any integration-specific alias behavior, that path will no longer be exercised.
- The grep rules are only literal-string checks. They help catch accidental reintroductions, but they do not fully prove that no future caller can write `isFinalTrial` into `Run.config` through a different object path.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (queue handler regression test gap) already addressed in §4 as explicit non-goal. The three-part guardrail in §3.2 is the deliberate trade-off: TypeScript build catches unused imports for planFinalTrial and startRun; file-scoped grep of aggregate-analysis.ts for the three keywords returns zero matches; zod schema zRunConfig drops isFinalTrial so future reads fail at build time. Standing up a new Prisma queue mock harness for a pure-deletion PR is scope creep. LOW (atomic deploy assumption) is addressed in §10 points 2 and 3 — API and web deploy together from cloud monorepo on Railway; aggregate-analysis.ts lives in cloud apps api; stale browser bundle window is explicitly called out.
