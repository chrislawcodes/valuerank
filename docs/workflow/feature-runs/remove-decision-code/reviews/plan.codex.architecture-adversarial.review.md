---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/remove-decision-code/plan.md"
artifact_sha256: "95a4b183debafbf474ac7e0cb80546daa2329ab587ed1dca476a9063a04e1d09"
repo_root: "."
git_head_sha: "fe2d375f349891708ea81efa9f6958fbcc592998"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Plan round 6 accepted. HIGH resolver preserves stale resolved rows -> A2 restructured to classify each row first: good canonicals (decisionState in resolved/neutral/refusal AND strength non-unknown) preserve verbatim; suspicious rows force re-derivation by passing cachedDecision null. HIGH refusal wiring incomplete -> A9 expanded: add refusal field to RawDecisionEvidence, buildRawDecisionEvidence copies it from decisionMetadata, resolver early-checks raw.refusal before parseClass gate, resolver cached-decision branch adds explicit refusal special-case symmetric to neutral. MEDIUM decisionState unknown broader than parser-failure -> acknowledged; W10 reparse target filter documented as broader scope in earlier reconciliation."
raw_output_path: "docs/workflow/feature-runs/remove-decision-code/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

- **HIGH** [CODE-CONFIRMED] The proposed migration primitive in W9 is wrong for the job. The live resolver explicitly prefers any cached canonical with `decisionState !== 'unknown'` and only falls back to raw evidence when the cache is unknown ([`decision-model.ts`](./Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model.ts#L139-L177)). That means a backfill that calls `resolveCanonicalDecision` can preserve already-bad cached canonicals instead of recomputing them, so the drift the plan is trying to remove may survive the migration.

- **HIGH** [CODE-CONFIRMED] The refusal refactor is incomplete in two places. First, the plan says the resolver should read `decisionMetadata.refusal`, but `RawDecisionEvidence` and `DecisionModelInput` do not carry any refusal bit today ([`decision-model-types.ts`](./Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model-types.ts#L14-L26), [`decision-model-types.ts`](./Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model-types.ts#L76-L85)), and `buildRawDecisionEvidence` never copies one. Second, even if refusal reaches the raw path, the cached-decision branch in `resolveCanonicalDecision` never special-cases `decisionState: 'refusal'`, so a cached refusal row will still fall through to unknown ([`decision-model.ts`](./Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model.ts#L141-L177)), even though the validator already accepts refusal cached rows ([`decision-model-helpers.ts`](./Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model-helpers.ts#L44-L89)).

- **MEDIUM** [CODE-CONFIRMED] W10 assumes `canonicalDecision.decisionState === 'unknown'` now means “parser failure only,” but the resolver uses `"unknown"` for several unrelated cases: invalid or missing pair, invalid manual override, non-`exact`/`fallback_resolved` parse class, invalid cached decision, missing orientation flag, and unresolved job-choice text ([`decision-model.ts`](./Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model.ts#L120-L177), [`decision-model.ts`](./Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model.ts#L180-L214)). A reparse filter built on that field will pull in rows that cannot be recovered by reparsing and can still miss rows whose failure mode is not parsing.

## Residual Risks

- The plan still depends on the live resolver staying stable between code deploy and the backfill run. If resolver logic changes before `--apply`, the historical rewrite will track the newer behavior, not the behavior that produced the original rows.

- The plan does not yet define a separate signal for “parser failure” versus other unknown states. If reparsing remains an operational workflow, that classification needs to be explicit or the unknown bucket will stay too broad.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Plan round 6 accepted. HIGH resolver preserves stale resolved rows -> A2 restructured to classify each row first: good canonicals (decisionState in resolved/neutral/refusal AND strength non-unknown) preserve verbatim; suspicious rows force re-derivation by passing cachedDecision null. HIGH refusal wiring incomplete -> A9 expanded: add refusal field to RawDecisionEvidence, buildRawDecisionEvidence copies it from decisionMetadata, resolver early-checks raw.refusal before parseClass gate, resolver cached-decision branch adds explicit refusal special-case symmetric to neutral. MEDIUM decisionState unknown broader than parser-failure -> acknowledged; W10 reparse target filter documented as broader scope in earlier reconciliation.
