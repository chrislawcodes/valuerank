---
reviewer: "codex"
lens: "feasibility-adversarial"
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
raw_output_path: "docs/workflow/feature-runs/finding-2-graphql-tightening/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- **HIGH [CODE-CONFIRMED]** FR-004 is based on a false shape assumption. The `DomainSettings` GraphQL type already exposes `defaultModelIds`, `sentencePrefix`, and `labelPrefix` directly, and the current resolver populates those fields on `DomainSettingsShape`; there is no `domain { ... }` child selection to move them under. As written, the spec would require an API shape change outside the stated “query-document tightening only” scope. See [domains.graphql](/Users/chrislaw/valuerank/.claude/worktrees/finding-2-graphql-tightening/cloud/apps/web/src/api/operations/domains.graphql#L302), [domain.ts](/Users/chrislaw/valuerank/.claude/worktrees/finding-2-graphql-tightening/cloud/apps/api/src/graphql/types/domain.ts#L128), and [domain-settings.ts](/Users/chrislaw/valuerank/.claude/worktrees/finding-2-graphql-tightening/cloud/apps/api/src/graphql/queries/domain-settings.ts#L19).

- **MEDIUM [CODE-CONFIRMED]** FR-005 overstates what query tightening can accomplish for `analysisStatus`. The committed generated type still emits `analysisStatus?: string | null`, so the current manual wrapper is not just stylistic. Changing the query selection alone will not remove the `undefined` and therefore will not let consumers use the generated type directly without either a codegen config change or a small adapter. See [generated/graphql.ts](/Users/chrislaw/valuerank/.claude/worktrees/finding-2-graphql-tightening/cloud/apps/web/src/generated/graphql.ts#L4185) and the current consumer shape in [DomainEvaluationStatusPanel.tsx](/Users/chrislaw/valuerank/.claude/worktrees/finding-2-graphql-tightening/cloud/apps/web/src/components/domains/domainTrials/DomainEvaluationStatusPanel.tsx#L22).

- **MEDIUM [CODE-CONFIRMED]** FR-007 is underspecified about where the backfill mutation must live, and one of its suggested implementation paths cannot work with the current build. The web codegen only reads `src/**/*.graphql`, so keeping `BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION` as a `gql\`\`` block in `domains.ts` will not make it discoverable. The spec should explicitly require moving it into `domains.graphql` and also call out deletion of the manual backfill result/variables aliases that remain in `domains.ts`. See [codegen.ts](/Users/chrislaw/valuerank/.claude/worktrees/finding-2-graphql-tightening/cloud/apps/web/codegen.ts#L5) and [domains.ts](/Users/chrislaw/valuerank/.claude/worktrees/finding-2-graphql-tightening/cloud/apps/web/src/api/operations/domains.ts#L60).

## Residual Risks

- `estimateConfidence` still comes from GraphQL as a `String`, so the helper-based narrowing path needs to stay explicit or the UI typing will drift again.
- If the backfill mutation is moved into `.graphql`, the stale manual `BackfillDomainEvaluationModelsMutationResult` and `BackfillDomainEvaluationModelsMutationVariables` aliases need to be removed in the same change or the cleanup goal remains incomplete.
- The ESLint rule will need focused tests around both plain object-literal aliases and reshaped aliases like `Omit<...> & { ... }`; the spec covers this, but the implementation risk is still real.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 