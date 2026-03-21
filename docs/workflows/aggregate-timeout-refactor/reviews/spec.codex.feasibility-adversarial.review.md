---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflows/aggregate-timeout-refactor/spec.md"
artifact_sha256: "8f17f3ee8e65b4069a6689bcc2fa0e43bccc5eb13f3c2d4f2264985ebfabf68f"
repo_root: "."
git_head_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Eligibility-relevant state is revalidated and the claim now self-heals via lease expiry plus cleanup."
raw_output_path: "docs/workflows/aggregate-timeout-refactor/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. High: The lease is not bounded or renewable. “Orphaned claims self-heal after the lease expires” is not enough for the large recomputes this refactor targets. If a healthy Python aggregate run can outlive the lease, valid work will be rejected as stale even when no newer recompute exists. That turns the timeout fix into a new false-failure mode unless the lease is guaranteed to exceed worst-case worker time or can be renewed.

2. High: The spec does not define a coherent snapshot boundary for the pre-transaction read path. Moving reads and validation outside the transaction is only safe if the fingerprint covers every source field that affects both aggregate output and eligibility, and if it is derived from a consistent version set. As written, the worker can consume a mixed-version transcript/config set and later “revalidate” against a fingerprint that never corresponded to any real atomic state.

3. High: Claim acquisition is not specified as atomic. The proposal mentions a token, source fingerprint, and lease, but it never requires a compare-and-set or uniqueness check when the claim is written. Two concurrent recomputes can therefore both believe they own the claim, do the expensive work, and only discover the conflict at commit time, which defeats the stated goal of avoiding redundant recomputation.

4. Medium: The cleanup path can erase the wrong claim unless it is token-guarded. The spec allows best-effort claim clearing in a separate step after failure, but a delayed cleanup from an older worker can clobber a newer in-flight claim if that update is not conditional on the original token or fingerprint. That creates a new race where a valid recompute loses its reservation.

## Residual Risks

- Even with the split boundary corrected, the final transaction still depends on the same advisory lock and on source rows not changing between the read phase and commit; the spec reduces the locked window but does not eliminate contention.
- If claim state stays in existing JSON config fields, the reservation logic will remain fragile unless the implementation centralizes the conditional update and tests it directly.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Eligibility-relevant state is revalidated and the claim now self-heals via lease expiry plus cleanup.
