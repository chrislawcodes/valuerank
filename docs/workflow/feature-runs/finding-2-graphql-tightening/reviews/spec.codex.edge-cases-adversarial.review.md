---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/finding-2-graphql-tightening/spec.md"
artifact_sha256: "02ae6b0a69f773e124d37970c57275156411083e421975e4d1250121144d7606"
repo_root: "."
git_head_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
git_base_ref: "origin/main"
git_base_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/finding-2-graphql-tightening/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- HIGH [CODE-CONFIRMED]: The spec still leaves the existing manual backfill mutation aliases in [`domains.ts`](/Users/chrislaw/valuerank/.claude/worktrees/finding-2-graphql-tightening/cloud/apps/web/src/api/operations/domains.ts) untouched. `BackfillDomainEvaluationModelsMutationResult` and `BackfillDomainEvaluationModelsMutationVariables` are still hand-typed in the current file, but FR-007 through FR-010 never say to delete or replace them. That means the stated “zero hand-maintained aliases” goal is still not met.
- MEDIUM [CODE-CONFIRMED]: The spec removes `ValueStatementWithVersions` without adding any replacement query requirement for `valueStatements` in [`domains.ts`](/Users/chrislaw/valuerank/.claude/worktrees/finding-2-graphql-tightening/cloud/apps/web/src/api/operations/domains.ts). FR-004 only re-homes `defaultModelIds`, `sentencePrefix`, and `labelPrefix`, so the current `valueStatements` data path is left undocumented after the cleanup. That is an underspecified break risk for any settings consumer that still depends on those values.
- LOW [UNVERIFIED]: The ESLint rule is still easy to bypass in practice. The spec only calls out object-literal aliases and a few reshape patterns, while also allowing whole-file allowlists. A developer can likely hide the same anti-pattern behind other utility types or by parking it in an allowlisted file, which weakens the regression guard.

## Residual Risks

- The allowlist approach leaves a standing escape hatch. `runs.ts` can keep accumulating manual shape debt unless the follow-up cleanup is actually filed and enforced.
- The spec depends on query-document tightening matching every consumer exactly. If one nested field or nullability assumption is missed, the failure will show up late in type-checking or smoke tests.
- The PR verification counts can still look clean while helper-level casts or boundary narrowings remain in place unless the grep patterns are expanded to cover them.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 