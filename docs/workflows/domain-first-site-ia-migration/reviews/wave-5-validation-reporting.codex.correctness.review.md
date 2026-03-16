---
reviewer: codex
lens: correctness
stage: diff
artifact_path: docs/workflows/domain-first-site-ia-migration/reviews/wave-5-validation-reporting.diff.patch
artifact_sha256: 7861bf721e94459d6f3aade399bf61a6b35bac6086d863e06cb05782348f108d
repo_root: .
git_head_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
git_base_ref: origin/main
git_base_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
generation_method: codex-session
resolution_status: "accepted"
resolution_note: "No blocking correctness issue remains in the Wave 5 slice; Validation now acts as a reporting hub over existing validation contracts and Runs accepts URL-driven run-category filtering without inventing a new execution model."
raw_output_path: ""
---

# Review: wave-5-validation-reporting correctness

## Findings

No blocking correctness issue found in the Wave 5 slice.

The current diff stays inside the intended reporting-and-wayfinding scope:

1. `ValidationHome` now consumes existing validation-oriented queries instead of inventing new backend contracts.
2. the page reads from the persisted `VALIDATION` run category and existing temp=0 / order-invariance reporting queries, so it strengthens information scent without creating a duplicate execution surface.
3. `Runs` accepts a URL-driven `runCategory` filter and surfaces that filter clearly, which allows Validation to deep-link into operational history while preserving the existing run-detail model.
4. the detailed assumptions pages remain live but now point back to Validation reporting and validation run history, which reduces split-brain navigation without removing compatibility access.
5. focused tests cover the new Validation reporting content and the validation-filtered Runs state.

Targeted verification passed:

1. `npm run typecheck --workspace=@valuerank/web`
2. `npm test --workspace=@valuerank/web -- tests/pages/ValidationHome.test.tsx tests/pages/Runs.test.tsx`

## Residual Risks

1. The `Runs` test suite still emits React `act(...)` warnings in existing test patterns. They do not currently fail the checkpoint, but they remain cleanup debt for the run-list surface.
2. `ValidationHome` relies on multiple queries at once. The page degrades safely through the shared error state, but later polish may want more granular loading/error treatment if one reporting source is down while the others are healthy.
3. The URL-driven `runCategory` filter currently serves deep links and reporting context rather than a full interactive workflow-category filter in the Runs UI. That is fine for this wave, but later run-management work may want to expose that state more broadly.

## Resolution
- status: accepted
- note: No blocking correctness issue remains in the Wave 5 slice; Validation now acts as a reporting hub over existing validation contracts and Runs accepts URL-driven run-category filtering without inventing a new execution model.
