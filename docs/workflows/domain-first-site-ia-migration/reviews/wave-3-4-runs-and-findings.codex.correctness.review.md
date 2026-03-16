---
reviewer: codex
lens: correctness
stage: diff
artifact_path: docs/workflows/domain-first-site-ia-migration/reviews/wave-3-4-runs-and-findings.diff.patch
artifact_sha256: cb2ccc0292745b0c7480687849f4908f892a3fbe93a620bcda523f32f15e940e
repo_root: .
git_head_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
git_base_ref: origin/main
git_base_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
generation_method: codex-session
resolution_status: "accepted"
resolution_note: "No blocking correctness issue remains in the Wave 3 and 4 slice; the Runs surface now consumes the domain-evaluation backend contracts directly and Findings stays conservatively gated behind explicit eligibility checks."
raw_output_path: ""
---

# Review: wave-3-4-runs-and-findings correctness

## Findings

No blocking correctness issue found in the Wave 3 and 4 slice.

The scoped diff lands the intended behavior without overpromising backend support:

1. `DomainTrialsDashboard` now launches and monitors scoped `Domain Evaluation` cohorts through the first-class backend contracts instead of the legacy domain-trials path.
2. the launch flow exposes setup-summary context, estimate-confidence labeling, fallback notes, and known exclusions before confirmation.
3. the confirmation surface is now an accessible dialog and links the user into the cohort-level summary instead of collapsing everything into one run detail.
4. `domainFindingsEligibility(domainId)` is intentionally conservative and keeps `Findings` in a diagnostics-only state until the required auditable snapshot fields are truly present.
5. `DomainAnalysis` reflects that contract explicitly instead of implying that current charts are already auditable findings.
6. focused API and web coverage exercise the new launch-summary, findings-eligibility, and diagnostics-only behaviors.

Targeted verification passed:

1. `npm run typecheck --workspace=@valuerank/api`
2. `npm run typecheck --workspace=@valuerank/web`
3. `npm test --workspace=@valuerank/api -- tests/graphql/queries/domain.test.ts`
4. `npm test --workspace=@valuerank/web -- tests/pages/DomainTrialsDashboard.test.tsx tests/pages/DomainAnalysis.test.tsx`

## Residual Risks

1. `domainFindingsEligibility` is deliberately conservative and currently keeps domains in a diagnostics-only state until fuller snapshot support lands. That is the correct migration behavior, but Wave 5+ work still needs to turn those placeholder checks into a durable auditable findings contract.
2. `DomainTrialsDashboard` now depends on several polling query surfaces (`domainEvaluation`, `domainEvaluationStatus`, `domainRunSummary`, `domainTrialRunsStatus`). Later status-center work should keep those surfaces aligned as cancellation, retries, and stalled-run handling get richer.
3. The focused diff still sits on top of earlier accepted backend-foundation work in some of the same files, so closeout should continue to reconcile behavior against the saved wave manifests rather than assuming each file maps to exactly one wave forever.

## Resolution
- status: accepted
- note: No blocking correctness issue remains in the Wave 3 and 4 slice; the Runs surface now consumes the domain-evaluation backend contracts directly and Findings stays conservatively gated behind explicit eligibility checks.
