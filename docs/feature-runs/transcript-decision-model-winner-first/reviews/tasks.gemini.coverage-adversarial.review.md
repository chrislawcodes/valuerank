---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/feature-runs/transcript-decision-model-winner-first/tasks.md"
artifact_sha256: "bdda2d57690125fde7316b228e360315ec4854a13409a157e1284d4d7e2af30b"
repo_root: "."
git_head_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
git_base_ref: "origin/fix/conditions-matrix-paired-transcripts"
git_base_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted: slice 1 now validates the db package, malformed and stale cache rows, and the handler-to-GraphQL path; slice 2 keeps the component regression test narrow; and the export blast radius is called out in the plan."
raw_output_path: "docs/feature-runs/transcript-decision-model-winner-first/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

1.  **Insufficient Fallback Testing for Cache Corruption:** The plan requires the resolver to fall back to the computed path when encountering "malformed" or "stale" cached data. However, the verification plan is not explicit enough about adversarially testing this. The tests must go beyond simple `null` or `undefined` checks and actively inject multiple forms of corruption to validate the fallback's robustness. Missing test cases include:
    *   Partially stale data (e.g., correct `responseSha256` but old `parserVersion`).
    *   Type corruption (e.g., `strength` is a number instead of a string, `favoredValueKey` is a boolean).
    *   Structurally valid JSON with unexpected or missing keys.
    *   A test that confirms a change in the underlying `definition` metadata correctly invalidates the cache via the `responseSha256` mismatch and forces a re-computation.

2.  **Lack of Visual Regression Testing for UI Changes:** Slice 2 aims to fix a data mapping in a React component while leaving the "visible layout, labels, and report structure unchanged." Unit tests can verify the data flow but cannot guarantee against unintended visual side effects (e.g., changes in element wrapping, alignment, or styling). This poses a risk of visual regressions that would not be caught by the specified `*.test.tsx` files.

3.  **Missing "Empty Cache" Compatibility Test:** The exit rule for Slice 1 is "old transcripts still resolve through the compatibility path." The test plan must explicitly include a scenario where a transcript has a `decisionMetadata.summaryCache` object that is present but its `summary` property is `null` or an empty object `{}`. This simulates a potential state for data between schema versions and is distinct from the entire `summaryCache` being `null`. Failure to test this state could lead to `TypeError: Cannot read properties of null` if the resolver isn't guarded properly.

4.  **Implicit Trust in Shared Utility Logic:** The same utility, likely covered by `transcriptDecisionModel.test.ts`, is used in both the Node.js (API) and browser (web) environments. The verification plan runs tests in both workspaces but does not explicitly call for tests that ensure environment-specific differences (e.g., date parsing, float precision) do not cause the utility to produce different outputs given the exact same inputs.

## Residual Risks

1.  **Silent Cache-Related Data Errors:** If the cache fallback logic is not hardened against all forms of corruption, it's possible for a resolver to interpret malformed data without crashing, leading to subtly incorrect `decisionState` or `strength` values being served via the GraphQL API. This is more dangerous than a crash because the data appears valid but is wrong, potentially corrupting downstream analysis.

2.  **Unintended UI Degradation:** The B-first data fix in Slice 2 could cause a visual component to reflow incorrectly on specific viewport sizes or with certain data patterns (e.g., long value names). Without visual regression testing, a purely cosmetic but user-facing bug could be introduced and missed until manual QA or a user report.

3.  **Post-Deployment Hotfix or Backfill Required:** The "no-backfill" goal is a critical constraint. An untested edge case in the compatibility logic for old transcripts (e.g., the "empty cache" case described above) could force an emergency patch and potentially a data backfill to correct the state of records that were resolved incorrectly after the deployment.

## Token Stats

- total_input=1889
- total_output=752
- total_tokens=16038
- `gemini-2.5-pro`: input=1889, output=752, total=16038

## Resolution
- status: accepted
- note: Accepted: slice 1 now validates the db package, malformed and stale cache rows, and the handler-to-GraphQL path; slice 2 keeps the component regression test narrow; and the export blast radius is called out in the plan.
