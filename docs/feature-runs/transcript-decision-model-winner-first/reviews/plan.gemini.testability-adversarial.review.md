---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/transcript-decision-model-winner-first/plan.md"
artifact_sha256: "661ab99fdfe137d37c0558138ebcd5dc43de2d2a9a7228264a60060a770ae285"
repo_root: "."
git_head_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
git_base_ref: "origin/fix/conditions-matrix-paired-transcripts"
git_base_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted: slice 1 now covers equivalence, malformed cache, stale cache, and malformed definition cases; slice 2 keeps the utility contract under test; and verification includes db plus web compatibility paths."
raw_output_path: "docs/feature-runs/transcript-decision-model-winner-first/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **High Severity: Undefined Failure Conditions for Cache.** The plan relies on a fallback mechanism for "stale" or "malformed" cache data but never defines these states. This creates significant testing ambiguity. A robust test suite cannot be written without a clear specification for what constitutes a malformed entry (e.g., missing keys, incorrect data types, logically inconsistent values) or a stale one. The implementation of the read-path logic could make incorrect assumptions, leading to silent failures where corrupted cache data is trusted over a correct re-computation.

2.  **High Severity: Inadequate Verification Plan for Fallback Logic.** The verification plan lists test files but fails to specify the critical test *scenarios*. It omits any mention of testing the core architectural defense: the fallback path. There are no planned tests to verify that the system correctly rejects invalid cache entries and gracefully falls back to the legacy computation path. This oversight means the primary risk-mitigation strategy is left unverified. Tests must explicitly cover:
    *   Cache is absent (legacy data).
    *   Cache is present and fresh (new data).
    *   Cache is stale (mismatched freshness keys).
    *   Cache is structurally malformed (missing properties).
    *   Cache contains invalid data types.

3.  **Medium Severity: Potential for Inconsistent Data Export.** The plan correctly identifies `export.ts` in the blast radius but does not explicitly verify that the fixes, particularly the B-first mapping, propagate to all export formats (e.g., XLSX). The UI-centric nature of Slice 2 creates a risk that the fix is only applied in the `PairedRunComparisonCard` while data exports continue to use the old, flawed logic. Verification for Slice 2 should include a test confirming the exported data correctly applies the canonical ordering regardless of the original `presentationOrder`.

4.  **Medium Severity: Ambiguous Test Scope for Paired Comparisons.** The goal for Slice 2 is to "Map B-first rows so the first and second values stay in canonical order." However, the verification is scoped only to the `PairedRunComparisonCard.test.tsx`. This component may have downstream consumers or sister components that rely on the same utility functions. The tests must be located at the level of the logical transformation (`cloud/apps/web/src/utils/transcriptDecisionModel.ts` is mentioned in the blast radius but not in the verification plan), not just in one consuming UI component.

## Residual Risks

1.  **Long-Term Maintenance Burden:** The decision to not backfill historical data creates two parallel logic paths (cached reads and legacy computation) that must be maintained indefinitely. This introduces a significant long-term risk. Any future change to decision modeling logic must be implemented and tested in both paths, increasing complexity and the likelihood of divergence or bugs. While pragmatic for this feature, the plan accepts technical debt without outlining a strategy or trigger for eventual repayment (e.g., a future backfill once the new logic is stable).

2.  **Potential for Silent Failures:** The reliance on "freshness keys" (`responseSha256`, `parserVersion`, etc.) to detect stale cache entries is sound, but it's brittle if not implemented perfectly. If a developer forgets to update a version or a key during a future change, the system could silently serve stale, incorrect cached decisions without triggering the fallback. The plan does not mention adding monitoring or logging to detect high rates of fallback usage, which could otherwise signal such a problem.

3.  **Incomplete Definition Snapshot Validation:** The plan anchors canonical order to the `definitionSnapshot`. It does not consider or plan tests for scenarios where the snapshot itself is malformed or unusual, such as the `dimensions` array not containing exactly two values. This could lead to runtime errors in the resolver if it assumes a valid structure that isn't guaranteed by the database schema or prior validation.

## Token Stats

- total_input=2030
- total_output=823
- total_tokens=16365
- `gemini-2.5-pro`: input=2030, output=823, total=16365

## Resolution
- status: accepted
- note: Accepted: slice 1 now covers equivalence, malformed cache, stale cache, and malformed definition cases; slice 2 keeps the utility contract under test; and verification includes db plus web compatibility paths.
