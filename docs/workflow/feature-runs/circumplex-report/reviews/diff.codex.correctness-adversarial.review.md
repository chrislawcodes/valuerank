---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/circumplex-report/reviews/implementation.diff.patch"
artifact_sha256: "fbbc6e355438812e12621a52e5569120681f93adbbea36c31901e3b8e7db3c1a"
repo_root: "."
git_head_sha: "d8aab9e62d2147e71ac4cc92673f04c6ccd1e3c0"
git_base_ref: "03d8ef90b9cbe77b8bb67d7213019ab23eb816c1"
git_base_sha: "03d8ef90b9cbe77b8bb67d7213019ab23eb816c1"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (MDS reflection ambiguity): accepted as residual — anchorMdsRotation handles rotation only, not reflection. The human eye reads the value layout directly from labels; the theoretical-circle overlay is a diagnostic not a truth claim. Future: add reflection check comparing adjacent-pair distances. MEDIUM (eligibility vs exclusion desync): fixed — resolver now checks result.verdictBand==='insufficient_data' OR excludedValues.length > 5 after buildResult, and demotes such models to the insufficient list with reason 'below_threshold'. This makes the two-tier check end-user-consistent."
raw_output_path: "docs/workflow/feature-runs/circumplex-report/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- [UNVERIFIED] Medium: `anchorMdsRotation()` only resolves rotational freedom, not the reflection ambiguity that still exists in classical MDS. That means the new “anchored” output in `cloud/apps/api/src/services/circumplex/mds.ts` can still be mirrored left/right while `Self_Direction_Action` sits at 12 o’clock, so the `theoreticalAngleDeg` overlay can point the wrong way even though the chart looks stabilized.
- [UNVERIFIED] Medium: `circumplexAnalysis` now decides `eligible` vs `insufficient` using only per-value total trials, but `buildResult()` still applies stricter exclusion rules and `circumplexFit()` can still return `insufficient_data`. A model can therefore land in `models` even though the later profile/circumplex stage does not have enough usable structure to produce a meaningful fit, which makes the new split internally inconsistent.

## Residual Risks

- I did not verify downstream consumers of the MDS coordinates, so the impact of the mirror ambiguity may be larger if the UI assumes the circle’s handedness is fixed.
- The new MDS mean-imputation still fabricates geometry for missing pair distances, so sparse models can remain hard to interpret even when they pass the new eligibility gate.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (MDS reflection ambiguity): accepted as residual — anchorMdsRotation handles rotation only, not reflection. The human eye reads the value layout directly from labels; the theoretical-circle overlay is a diagnostic not a truth claim. Future: add reflection check comparing adjacent-pair distances. MEDIUM (eligibility vs exclusion desync): fixed — resolver now checks result.verdictBand==='insufficient_data' OR excludedValues.length > 5 after buildResult, and demotes such models to the insufficient list with reason 'below_threshold'. This makes the two-tier check end-user-consistent.