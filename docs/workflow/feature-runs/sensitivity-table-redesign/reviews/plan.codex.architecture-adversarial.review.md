---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/plan.md"
artifact_sha256: "a2e036485c53bdfb6f8f04f3dd9ba3627bd2988e5af4d15c5b68608558396613"
repo_root: "."
git_head_sha: "037325feb2617aa96b68cfb204a023144a68c88a"
git_base_ref: "origin/main"
git_base_sha: "4772ae79f8e1580ee31c0f10f32e6d86a842ef68"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (cross-model row estimator unspecified) RESOLVED. Decision 2 now contains an explicit Cross-model summary row estimator contract section locking Low pressure, High pressure, and Win rate Delta to be unweighted means over the same measured-pair set, with the FR-006b caveat that arithmetic Low minus High does NOT necessarily equal the Delta cell. MEDIUM (HeaderTooltip composition) RESOLVED. Decision 3 markup composition note explicitly verifies against the existing TableHead onClick markup at PressureSensitivitySummary.tsx 115 to 118 and confirms no button-in-button. MEDIUM (last-write-wins still possible) ACKNOWLEDGED in Residual Risks; deferred."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

- [UNVERIFIED] Medium: The plan never defines a single estimator for the cross-model summary row’s `Low pressure` and `High pressure` cells. It only defines the delta as a pair-weighted mean over per-pair deltas with a t-based interval. If the low/high columns are computed with a different weighting scheme than the delta, the row will be internally inconsistent: the displayed components will no longer describe the same statistic. That is an architectural ambiguity, not just a presentation detail.

- [UNVERIFIED] Medium: `HeaderTooltip` is specified as a `button` inside table headers, but the plan does not pin down the composition strategy for sortable headers. If the header itself is also interactive, this creates nested-control or event-handling conflicts that can break keyboard navigation and screen-reader behavior. The plan only addresses click bubbling, not the underlying semantics.

- [UNVERIFIED] Medium: The source-run collision case is intentionally left as “last write wins” with only a warning. That means the resolver can still silently overwrite one definition’s data and ship a biased report even when the collision is known. Logging is useful, but it is not a correctness fix, so this remains a real data-integrity risk.

## Residual Risks

- The transcript-cap banner warns users about bias, but it does not remove the bias. Any consumer outside the page UI, or any user who misses the banner, can still treat truncated results as complete.

- The statistical choices are opinionated and may still confuse readers. In particular, the cross-model “CI” is really a spread measure, not a precision interval, and the plan relies heavily on tooltip copy to keep that distinction clear.

- Sparse-data edge cases still look fragile even with the proposed guards. Rows with one measured pair, zero qualifying cells, or boundary win rates can still produce output that is technically valid but easy to misread.

- The removal of legacy GraphQL fields is done atomically, which is clean but brittle. Any stale fixtures, snapshots, or out-of-band references outside the grep checkpoint can still break the build after schema regeneration.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (cross-model row estimator unspecified) RESOLVED. Decision 2 now contains an explicit Cross-model summary row estimator contract section locking Low pressure, High pressure, and Win rate Delta to be unweighted means over the same measured-pair set, with the FR-006b caveat that arithmetic Low minus High does NOT necessarily equal the Delta cell. MEDIUM (HeaderTooltip composition) RESOLVED. Decision 3 markup composition note explicitly verifies against the existing TableHead onClick markup at PressureSensitivitySummary.tsx 115 to 118 and confirms no button-in-button. MEDIUM (last-write-wins still possible) ACKNOWLEDGED in Residual Risks; deferred.
