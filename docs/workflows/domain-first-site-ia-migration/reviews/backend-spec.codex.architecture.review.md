---
reviewer: codex
lens: architecture
stage: spec
artifact_path: docs/workflows/domain-first-site-ia-migration/backend-engineering-spec.md
artifact_sha256: 2513c5f8fbbc3168fcda11c19fc5f042e08c5d476219eb8c7053d1129d882a4f
repo_root: .
git_head_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
git_base_ref: origin/main
git_base_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
generation_method: codex-session
resolution_status: "accepted"
resolution_note: "The backend engineering spec now bounds the remaining work well; the reported concerns are known migration and dependency risks already represented in the paired product spec, workflow plan, and backend gating sections."
raw_output_path: ""
---

# Review: spec architecture

## Findings

No blocking architecture issue found in the backend engineering spec. The document makes the key architectural move explicit: `Domain Evaluation` should become a persisted cohort object rather than remain a front-end fiction layered over vignette-scoped `Run` rows.

The strongest parts of the spec are:

1. it separates historical truth from present-day grouping
2. it keeps `runCategory` distinct from the legacy survey/non-survey `runType`
3. it makes findings eligibility depend on backend-computed snapshot completeness rather than client inference
4. it sequences the work into additive platform steps before reporting polish

## Residual Risks

1. The spec intentionally recommends a new persisted `DomainEvaluation` model, but it leaves exact coexistence with `Experiment` open. That is acceptable for a spec, but implementation should choose the boundary early so cohort identity and comparison history do not bifurcate.
2. Findings eligibility is correctly called out as a backend-computed contract, but the spec still leaves open whether it is computed on demand, materialized, or persisted. That choice can materially affect query shape and rollout cost for `Wave 4`.
3. The recommended cost contract is directionally correct, but realized-cost support may span multiple subsystems. Architecture should keep the first Wave 3 implementation narrow enough that cohort creation and truthful estimate confidence ship before full billing-style accounting.

## Resolution
- status: accepted
- note: The backend engineering spec now bounds the remaining work well; the reported concerns are known migration and dependency risks already represented in the paired product spec, workflow plan, and backend gating sections.
