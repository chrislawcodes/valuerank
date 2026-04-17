---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/summarizer-fallback-removal/plan.md"
artifact_sha256: "f48bcbaa251a8ef5ad4489074e0e24a5dc868001dd09d7d805eacb4f52e4fab7"
repo_root: "."
git_head_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
git_base_ref: "origin/main"
git_base_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "TEST-1 known risk noted in plan. TEST-2 fixed — shared service extracted. TEST-3 fixed — explicit test requirements added. TEST-4 accepted — tasks will include positive ambiguous test cases."
raw_output_path: "docs/workflow/feature-runs/summarizer-fallback-removal/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "full review with orchestrator reconciliation"
---

# Review: plan testability-adversarial

## Findings

| Severity | ID | Finding | Evidence |
| --- | --- | --- | --- |
| HIGH | TEST-1 | The SQL branch relying on the deep JSONB path `decision_metadata->'summaryCache'->'summary'->'canonicalDecision'->>'decisionState'` is untyped and brittle. Any upstream worker output change silently breaks the count. | [CODE-CONFIRMED] |
| HIGH | TEST-2 | The plan implied duplicating the complex DB query across the GraphQL resolver and MCP tool, violating DRY and doubling maintenance burden. | [CODE-CONFIRMED] |
| MEDIUM | TEST-3 | The validation plans only mentioned running existing test suites, not adding new tests for the new SQL logic and conditional UI rendering. | [UNVERIFIED] |
| LOW | TEST-4 | Tests were framed as fixing failures, not as an opportunity to add positive test cases for the new `parseClass: 'ambiguous'` state. | [UNVERIFIED] |

## Residual Risks

- **Technical Debt:** The plan adds more logic depending on untyped JSONB fields, deepening the dependency on this pattern. The JSONB path for summaryCache is a known risk documented in the plan.
- **Inconsistent Resolution States:** `classify_decision_with_llm` remains in `summarize_llm.py` for manual use. This is intentional per the spec.

## Token Stats

- total_input=2227
- total_output=1114
- total_tokens=36725
- `gemini-2.5-pro`: input=2227, output=1114, total=36725

## Resolution
- status: accepted
- note: TEST-1 known risk noted in plan. TEST-2 fixed — shared service extracted. TEST-3 fixed — explicit test requirements added. TEST-4 accepted — tasks will include positive ambiguous test cases.
