---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/circumplex-report/reviews/implementation.diff.patch"
artifact_sha256: "f318c47f095f2b3e003313858b32fdf929e2cc852f7fc028e62c0cff3bc6f221"
repo_root: "."
git_head_sha: "03d8ef90b9cbe77b8bb67d7213019ab23eb816c1"
git_base_ref: "origin/claude/consistency-signature-dropdown"
git_base_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (aggregation dead on undefined fields): same fix as correctness review — select clause now includes status + deletedAt. MEDIUM (MDS null-as-zero fabricates geometry): fixed — null distances are now mean-imputed from the determinate cells instead of collapsed to zero. MEDIUM (pair keying inconsistency): fixed by pairKey normalization + canonical-pair ingest. Residual risks (extractValuePair contract, insufficient always [] for API consumers) addressed by eligibility wiring."
raw_output_path: "docs/workflow/feature-runs/circumplex-report/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

- **High** - The circumplex aggregation path is effectively dead because it filters on fields it never selected. In [`aggregation.ts` line 85+](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/circumplex/aggregation.ts#L85), `db.run.findMany()` only selects `id` and `config`, but the next filter reads `run.status` and `run.deletedAt`. Those are always `undefined`, so `scopedRunIds` stays empty and every analysis returns empty matrices.
- **Medium** - The MDS code treats missing correlations as exact zero distances instead of unknowns. In [`mds.ts` line 116+](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/circumplex/mds.ts#L116), `null` values are converted to `0` before centering. That fabricates geometry for sparse inputs and can place values in misleading positions even when the profile matrix has large gaps.
- **Medium [UNVERIFIED]** - The pairwise aggregation keying looks inconsistent between ingest and lookup. In [`aggregation.ts` line 44+](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/circumplex/aggregation.ts#L44), stats are stored under `pairKey(pair)` from the extracted order, but later reconstructed with a lexicographically sorted pair. If `extractValuePair()` does not already canonicalize order, counts will split across two keys and many matrix cells will remain empty or wrong.

## Residual Risks

- I could not verify whether `extractValuePair()` already canonicalizes pair order, so the keying issue may be neutralized by upstream behavior.
- The new API still returns `insufficient: []`, so any non-UI consumer of the GraphQL result may be missing server-side eligibility reasons even if the current page compensates client-side.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH (aggregation dead on undefined fields): same fix as correctness review — select clause now includes status + deletedAt. MEDIUM (MDS null-as-zero fabricates geometry): fixed — null distances are now mean-imputed from the determinate cells instead of collapsed to zero. MEDIUM (pair keying inconsistency): fixed by pairKey normalization + canonical-pair ingest. Residual risks (extractValuePair contract, insufficient always [] for API consumers) addressed by eligibility wiring.