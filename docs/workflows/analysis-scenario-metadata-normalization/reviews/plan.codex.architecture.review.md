---
reviewer: codex
lens: architecture
stage: plan
artifact_path: docs/workflows/analysis-scenario-metadata-normalization/plan.md
artifact_sha256: 162258117c524818de774cdb054fed67437980524633fbbf64b0247e5f7ac0aa
repo_root: .
git_head_sha: 624b0f433b3bde215339f6a95d865f7163a2cc2a
git_base_ref: origin/main
git_base_sha: ad7e0c4060f149412a4100117981a45704a5c3c0
generation_method: codex-session
resolution_status: "accepted"
resolution_note: "The plan keeps repeat-pattern math unchanged, centralizes normalization at the analysis boundary, and adds explicit precedence, dry-run, and Python verification expectations."
raw_output_path: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture

## Findings

No blocking plan-architecture issue remains. The sequencing is sound: define one normalization helper, route ingestion through it, keep repeat-pattern math unchanged, and only then consider bounded metadata backfill.

## Residual Risks

1. The plan should resist adding a canonical field in one storage path while leaving read-time normalization elsewhere. Pick one ownership model before implementation starts.
2. If job-choice preset provenance is incomplete on real records, the optional backfill step may need to be deferred rather than partially implemented.
3. UI grouping logic and transcript drilldowns depend on the same normalized metadata contract. They should be tested together so the plan does not produce a worker-only fix.

## Resolution
- status: accepted
- note: The plan keeps repeat-pattern math unchanged, centralizes normalization at the analysis boundary, and adds explicit precedence, dry-run, and Python verification expectations.
