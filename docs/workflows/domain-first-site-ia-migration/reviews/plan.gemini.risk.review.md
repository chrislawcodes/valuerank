---
reviewer: "gemini"
lens: "risk"
stage: "plan"
artifact_path: "docs/workflows/domain-first-site-ia-migration/plan.md"
artifact_sha256: "ed372ac697a4766401bf9dc0995524b7030314d23af4ff4528b49dc48a213d99"
repo_root: "."
git_head_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
git_base_ref: "origin/main"
git_base_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The plan still has real migration risk, but those items are intentionally represented as pending Phase 0 deliverables and wave blockers rather than hidden assumptions."
raw_output_path: "docs/workflows/domain-first-site-ia-migration/reviews/plan.gemini.risk.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan risk

## Findings

1.  **Phase 0 Deliverables Pending:** Critical foundational items like the route compatibility matrix, terminology decision table, and file/route inventory are listed as "still pending."
2.  **Review Checkpoints Unreconciled:** Spec and plan review checkpoints are also marked as "still pending reconciliation."
3.  **Wave Dependencies:** Waves 3, 4, and 5 are explicitly blocked on critical items such as "immutable launch provenance," "domain-level cost preview contract," and "findings eligibility contract."
4.  **AI-Centric Review Process:** The workflow mandates AI (Codex, Gemini) reviews as primary gates, with human intervention reserved only for critical conflicts or missing decisions.
5.  **Missing Migration Artifacts:** Several mandatory artifacts from the "Migration Appendix Requirements" (e.g., canonical edit vs. attach vs. fork contract) are not explicitly confirmed as completed.
6.  **Analytics Instrumentation Gap:** The plan acknowledges the need for an analytics instrumentation plan but states it "lives separately from this document" and is not yet defined.

## Residual Risks

1.  **High Risk: Incomplete Foundational Elements:** The absence of completed Phase 0 deliverables (e.g., route compatibility matrix, terminology decision table) poses a significant risk. Without these, subsequent waves may be built on incorrect assumptions, leading to costly rework, misaligned architecture, and potential product inconsistencies.
2.  **High Risk: Over-reliance on AI Review & Insufficient Human Oversight:** The heavy reliance on AI (Codex, Gemini) for critical review checkpoints, with limited human intervention, introduces a risk of subtle regressions, architectural drift, or incomplete verification. The effectiveness of AI in identifying "high-severity conflict" or reconciling complex decisions is a key uncertainty. The "repo-compatible repair" path for unresolved reviews could also prove insufficient.
3.  **High Risk: Critical Dependency Blockages:** Waves 3, 4, and 5 are explicitly blocked on foundational backend contracts and provenance strategies. Failure to resolve these dependencies will directly halt progress on significant feature areas, delaying the entire migration timeline and potentially leading to scope creep or abandonment of subsequent waves.
4.  **Medium Risk: Unspecified Migration Contracts:** Missing or unconfirmed "Migration Appendix Requirements" (e.g., canonical edit vs. attach vs. fork contract) indicate gaps in defining clear boundaries and rules for implementation, potentially leading to inconsistencies in how different parts of the system are migrated.
5.  **Medium Risk: Lack of Observability and Verification:** The absence of a defined analytics instrumentation plan means the success and impact of the migration waves will be difficult to quantify. The current verification expectations, while broad, may not fully capture the nuances of a "large_structural" change without defined analytics to measure adoption and identify issues.
6.  **Low Risk: Potential for Unforeseen Regressions:** The inherent complexity of a "large_structural" migration involving "route, wording, and category changes" carries a general risk of regressions that might be missed by automated checks or AI reviews. While the plan attempts to mitigate this with structured checkpoints and test coverage, the sheer scale could still hide issues.

## Token Stats

- total_input=3662
- total_output=662
- total_tokens=18891
- `gemini-2.5-flash-lite`: input=3662, output=662, total=18891

## Resolution
- status: accepted
- note: The plan still has real migration risk, but those items are intentionally represented as pending Phase 0 deliverables and wave blockers rather than hidden assumptions.
