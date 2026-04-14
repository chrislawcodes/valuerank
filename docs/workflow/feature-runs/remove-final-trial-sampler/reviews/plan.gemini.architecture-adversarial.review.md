---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/remove-final-trial-sampler/plan.md"
artifact_sha256: "ba1097ead9cd78af1474b964c939ca523619518c182eeb1a4c41a69429799304"
repo_root: "."
git_head_sha: "e0daf3607e91b17e7b307b850dca3abfbfc86459"
git_base_ref: "origin/main"
git_base_sha: "e0daf3607e91b17e7b307b850dca3abfbfc86459"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "MEDIUM ((Final) suffix downstream dependency) is empirically false. Grep of cloud tree for literal (Final) and runName patterns returns exactly one match: start.ts:258 where the suffix is produced — which is the same line Slice C removes. No workers, no scripts, no report queries, no xlsx exporter, no UI filter consumes the literal. The spec §4 non-goal already covers the web UI (grep of cloud/apps/web/src for runMode isFinalTrial (Final) returns zero). Verified post-review by direct grep. LOW (cost estimate 10x discrepancy for users manually replicating a Final Trial run) is moot because the Final Trial run type no longer exists post-deletion — there is no user workflow to replicate. The collapsed ternary (spec §3.3) makes the estimate reflect the real non-final sample count, which is what the caller passes in."
raw_output_path: "docs/workflow/feature-runs/remove-final-trial-sampler/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

### 1. Incomplete Validation for Run Name Suffix Dependency

**Severity:** MEDIUM
**Finding:** The plan correctly identifies that the ` (Final)` suffix will no longer be added to run names (Slice C, `start.ts`). However, the final validation grep sweep in Slice F fails to check for dependencies on this string literal. Downstream systems, such as reporting scripts, analytics queries, or UI filtering logic, might identify these specific runs by parsing the name for `'(Final)'`. By not searching for this literal, the plan fails to verify whether removing it constitutes a breaking change for unobserved downstream consumers. A silent failure in a data pipeline that filters by run name could result.
**Evidence:** `[UNVERIFIED]` — The existence of downstream consumers is unverified as not all code is provided. However, the change itself is confirmed in `start.ts`, and the omission in the plan's own validation step (Slice F, §7.1 and §7.3) is confirmed by the provided artifact.

### 2. Potential User Experience Regression in Cost Estimation

**Severity:** LOW
**Finding:** The plan removes a special-case logic for cost estimation that applied to Final Trials. Previously, these runs were estimated using a hardcoded `samplesPerScenario: 10`. After the change (Slice C, `start.ts`), the estimation will use the standard `samplesPerScenario` value, which defaults to 1. This can lead to a significant (up to 10x) discrepancy in the cost estimate displayed to a user who is attempting to manually replicate the sampling of a previous Final Trial run. The plan artifact contains a comment `// Upper bound?` next to this logic, indicating awareness of the uncertainty but does not address the potential for user surprise.
**Evidence:** `[CODE-CONFIRMED]` — The context from `start.ts` shows the ternary `samplesPerScenario: finalTrial ? 10 : samplesPerScenario` inside the `estimateCost` call is being removed. This guarantees the calculation will change.

## Residual Risks

### 1. Stale Data in Production Database

The plan correctly notes that it will not perform a data migration. As a result, the `isFinalTrial` flag will persist in the JSON `config` blob of historical `Run` records, and the `(Final)` suffix will remain in their names. This creates a residual risk of future confusion for developers or data analysts who may encounter this "dead" data and not understand its historical context, potentially leading to incorrect assumptions or wasted investigation time.

### 2. Client-Side Errors from Stale Browser Caches

The plan proactively mitigates data corruption from stale clients by adding a backend sanitizer (Slice C). However, this does not prevent the stale client from sending a request that the updated GraphQL schema now deems invalid (due to the removal of the `finalTrial` field in `StartRunInput`). For a short window after deployment, users who have not refreshed their browser may experience failed operations and see errors in their console, which could lead to unnecessary user friction or support requests.

### 3. Removal of Autonomous Sampling Continuation

The core purpose of this plan is to remove the "Adaptive Sampling Continuation" logic from the `aggregate-analysis` queue handler (Slice B). This removes a key autonomous feedback loop from the system where it could self-trigger new runs to improve data stability. The residual risk is a potential degradation in data quality for certain analyses, as the system will no longer attempt to automatically run more samples to meet stability criteria. The responsibility for ensuring sufficient sample sizes now falls entirely on the user.

## Token Stats

- total_input=31480
- total_output=757
- total_tokens=38240
- `gemini-2.5-pro`: input=31480, output=757, total=38240

## Resolution
- status: accepted
- note: MEDIUM ((Final) suffix downstream dependency) is empirically false. Grep of cloud tree for literal (Final) and runName patterns returns exactly one match: start.ts:258 where the suffix is produced — which is the same line Slice C removes. No workers, no scripts, no report queries, no xlsx exporter, no UI filter consumes the literal. The spec §4 non-goal already covers the web UI (grep of cloud/apps/web/src for runMode isFinalTrial (Final) returns zero). Verified post-review by direct grep. LOW (cost estimate 10x discrepancy for users manually replicating a Final Trial run) is moot because the Final Trial run type no longer exists post-deletion — there is no user workflow to replicate. The collapsed ternary (spec §3.3) makes the estimate reflect the real non-final sample count, which is what the caller passes in.
