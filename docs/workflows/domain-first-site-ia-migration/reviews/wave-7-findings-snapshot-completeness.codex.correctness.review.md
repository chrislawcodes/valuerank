---
reviewer: codex
lens: correctness
stage: diff
artifact_path: docs/workflows/domain-first-site-ia-migration/reviews/wave-7-findings-snapshot-completeness.diff.patch
artifact_sha256: 75ec6d0cc4c3eaef080a24701525390b28e00f38dd23f4885aab64721d30ea6c
repo_root: .
git_head_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
git_base_ref: origin/main
git_base_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
generation_method: codex-session
resolution_status: "accepted"
resolution_note: "No blocking correctness issue remains in the Wave 7 slice; new runs now persist the resolved findings snapshot boundary and the eligibility query can promote completed production-style work to auditable findings when those fields are present."
raw_output_path: ""
---

# Review: wave-7-findings-snapshot-completeness correctness

## Findings

No blocking correctness issue found in the Wave 7 slice.

The implementation matches the intended snapshot-completeness behavior:

1. [start.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/services/run/start.ts) now stamps each new run with a structured findings snapshot boundary, including resolved preamble, context, value statements, level words, target model configuration, and evaluator/summarizer metadata.
2. [infra-models.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/services/infra-models.ts) now supports an explicit `judge` infrastructure-model purpose, so evaluator configuration can be resolved without inventing a separate ad hoc lookup path.
3. The implementation stays additive by storing the new snapshot fields inside `Run.config`, which is consistent with the engineering spec’s “resolved launch-time snapshot capture” direction and avoids introducing half-finished version tables in this wave.
4. [domain.test.ts](/Users/chrislaw/valuerank/cloud/apps/api/tests/graphql/queries/domain.test.ts) now proves the key behavior change on the read side: a completed production evaluation becomes `ELIGIBLE` only when the required persisted snapshot fields are present.
5. [start.test.ts](/Users/chrislaw/valuerank/cloud/apps/api/tests/services/run/start.test.ts) verifies the write side directly, so this wave is protected against both silent launch-path regressions and eligibility drift.

Targeted verification passed:

1. `npm run typecheck --workspace=@valuerank/api`
2. `npm run typecheck --workspace=@valuerank/web`
3. `npm test --workspace=@valuerank/api -- tests/services/run/start.test.ts tests/graphql/queries/domain.test.ts`

## Residual Risks

1. Target model lookup is still `modelId`-based, so if multiple providers expose the same `modelId`, the stored `targetModelConfigs` can include more than one provider record. That reflects current backend reality rather than a regression in this wave, but it remains a precision gap in the launch contract.
2. This wave captures resolved launch inputs in `Run.config`, but it does not add first-class version tables for `DomainContext` or `ValueStatement`. That is an intentional tradeoff for migration safety, not a hidden omission.
3. Older completed runs remain diagnostic-only unless they already carry the new snapshot boundary. That is the correct conservative behavior, but it means findings eligibility will improve over time rather than instantly across historical data.

## Resolution
- status: accepted
- note: No blocking correctness issue remains in the Wave 7 slice; new runs now persist the resolved findings snapshot boundary and the eligibility query can promote completed production-style work to auditable findings when those fields are present.
