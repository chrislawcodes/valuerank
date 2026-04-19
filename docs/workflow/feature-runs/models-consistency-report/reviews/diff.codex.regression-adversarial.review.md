---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/models-consistency-report/reviews/implementation.diff.patch"
artifact_sha256: "807072ce5c22e01dcf57979c51cbeaeb969625bfaa2be3b76be4c082c432edbf"
repo_root: "."
git_head_sha: "f8aeaf754a4045379bffa6785415b2d1b955bc47"
git_base_ref: "b65967cf"
git_base_sha: "b65967cf93803a8699a04505be0a4a057172831d"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/models-consistency-report/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

1. **Medium: signature lookup failures are silently converted into a fallback report.** In `cloud/apps/web/src/pages/ModelsConsistency.tsx`, `signatureError` is never surfaced. If `DOMAIN_AVAILABLE_SIGNATURES_QUERY` fails, the page falls back to `DEFAULT_SIGNATURE` and continues rendering, which can show a report for the wrong batch instead of telling the user the signature lookup broke.

2. **Medium: switching to `All domains` keeps the prior domain’s signature filter.** In `cloud/apps/web/src/pages/ModelsConsistency.tsx`, `handleDomainChange(null)` writes `domainId=all` but preserves `signatureParam` when it exists. Because the backend query still filters by `signature`, the “all domains” view can remain pinned to a domain-specific batch from the previous selection instead of resetting to a valid cross-domain batch.

3. **[UNVERIFIED] Medium: transcript drilldown links hardcode `repeatPattern: 'noisy'`.** Both `cloud/apps/web/src/components/models/ConsistencyDrill.tsx` and `cloud/apps/web/src/components/models/ConsistencyTable.tsx` build transcript URLs with a fixed `repeatPattern` even though the linked data does not provide a repeat-pattern value. If the transcripts page treats that param literally, these links can land on an unrelated or empty transcript view.

## Residual Risks

- The page still depends on backend conventions for `signature`, `repeatPattern`, and paired run IDs. If those meanings drift, the links can become misleading without a compile-time failure.
- `providerId`, `minScenarios`, and the selected model are local UI state only. Reloads and shared links will not reconstruct the exact same view.
- The insufficient-coverage footer omits model IDs and only shows label/provider, so duplicate labels from the same provider can be hard to disambiguate.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
