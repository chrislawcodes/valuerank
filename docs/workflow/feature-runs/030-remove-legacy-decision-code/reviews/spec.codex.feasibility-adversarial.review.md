---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/spec.md"
artifact_sha256: "3b720b6be5a3b6579283dbc8f00b0f6a4a6ea92bd6e3f65e2cfc273f283467bf"
repo_root: "."
git_head_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
git_base_ref: "origin/fix/audit-mode-no-legacy-fallback"
git_base_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- **Medium [UNVERIFIED]** The spec breaks the MCP response contract while saying MCP versioning is out of scope. It explicitly puts `cloud/apps/api/src/mcp/tools/get-transcript-summary.ts` in scope to remove `decisionCode` from the response and replace it with a canonical label. That is a wire-format change, not just an internal cleanup. If any MCP client still reads the old field, this cutover is not safe without a compatibility field or a versioned response.
- **Medium** The new sort contract is underspecified. The spec says `getTranscriptDecisionSortValue` should use canonical direction/strength instead of the numeric score, but it never defines a total order for ties, neutral vs unknown, or equal-strength opposite directions. The old 1-5 score implicitly carried a stable ordering; the canonical model does not. Without an explicit tie-break rule, the same rows can sort differently across implementations.
- **Medium [UNVERIFIED]** The removal of legacy numeric paths is not paired with a complete transition plan for persisted legacy payloads. The spec removes acceptance of `'1'`-`'5'` codes in `decisionDistributionDisplay.ts`, `ks-test.ts`, `aggregate-logic.ts`, and Python workers, but the only mitigation is a vague note about a normalizer or legacy documentation. There is no explicit migration or compatibility boundary for stored analysis JSON, queued jobs, or cached distributions, so older payloads can become unreadable after deploy.

## Residual Risks

- Historical analysis artifacts may still need a compatibility reader if they outlive the rollout window.
- The “semantically equivalent” claims for variance analysis and KS-test need fixture-based verification on real legacy data, not just code review.
- This spec assumes every decision consumer flows through `resolveTranscriptDecisionModel`; any alternate path will need separate cleanup or it will keep the legacy behavior alive.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
