---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/cross-domain-status-page/spec.md"
artifact_sha256: "d4b8c700653ba3f3758969f2325021f48034bfb085c83644ef5e68586961a1ab"
repo_root: "."
git_head_sha: "728da7d111003c5b052de4afad7f33501fbe10ba"
git_base_ref: "origin/main"
git_base_sha: "ee49253d6dd9ce8c0dfd6789aad31716b74634e8"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH soft-deleted transcripts trigger detector — addressed by Decision 1 (detector WHERE clause includes `deletedAt IS NULL`). MEDIUM type filter scoping ambiguity — addressed by Decision 4 (type filter applies to anomalies only; active evaluations ignore it). MEDIUM ETA tie-break when empty — addressed by Decision 5 (rows with no ETA sort last, alphabetically among themselves). MEDIUM re-probe spam from persistent empty — addressed by Decision 1 (slot-keyed deduping) plus Decision 7 (re-probe circuit breaker: max 3 re-probes per slot, enforced by counting soft-deleted transcripts at the same slot)."
raw_output_path: "docs/workflow/feature-runs/cross-domain-status-page/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **High:** The `EMPTY_TARGET_RESPONSE` detector does not exclude soft-deleted transcripts. The spec says re-probe soft-deletes the existing transcript, but the detection rule only checks `summarizedAt IS NOT NULL` and empty visible response text. As written, the deleted original can still satisfy the detector and keep the anomaly open or make it reappear on the next reconciliation pass. The detector needs an explicit `deletedAt IS NULL`-style exclusion or equivalent.

- **Medium:** The type filter is underspecified for the Active Evaluations panel. Type only applies to anomalies, but FR-003 and FR-004 say both sections are scoped by the active filter values. If implemented literally, selecting an anomaly type can hide or distort active runs, which makes the cross-domain status page misleading. The spec needs to say the type filter affects anomalies only, or that active evaluations ignore it.

- **Medium:** Sorting is undefined when ETA is empty. FR-018 requires sorting by ETA descending, but the edge cases say models with zero recent completions render no ETA cell at all. That leaves no deterministic rule for newly started models or low-data models, which undermines the “bottleneck first” behavior and can reorder rows unpredictably.

- **Medium:** Re-probe on a persistently empty slot can create anomaly spam instead of one stable issue. The spec keys anomalies by transcript id, so if a re-probe again produces an empty transcript, a fresh anomaly row is likely created for the new transcript while the old one remains a separate open row unless something else cleans it up. The spec does not define slot-level deduping or how repeated failures should collapse into one ongoing anomaly.

- **[UNVERIFIED] Medium:** The re-probe and anomaly dedupe behavior depends on existing schema and idempotency guarantees that the spec assumes but does not prove. In particular, the spec assumes an open-anomaly uniqueness constraint on `runId + type + subject + source`, and that deleting `probe_results` is sufficient to clear all replay guards. If either assumption is false in the current codebase, the feature can duplicate anomalies or fail to re-probe. Because there is no code context here, this is unverified.

## Residual Risks

- The page still has no pagination, so future growth in anomalies or active runs could make the 5-second polling expensive even if current volume is fine.
- The spec intentionally removes the old `/domains/status/:domainId` route with no redirect, so any missed link or bookmark will fail hard until the cleanup sweep is complete.
- Cost and ETA are both derived from recent transcript data, so any gaps or skew in that data will make the new per-model panel look precise when it is only approximate.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH soft-deleted transcripts trigger detector — addressed by Decision 1 (detector WHERE clause includes `deletedAt IS NULL`). MEDIUM type filter scoping ambiguity — addressed by Decision 4 (type filter applies to anomalies only; active evaluations ignore it). MEDIUM ETA tie-break when empty — addressed by Decision 5 (rows with no ETA sort last, alphabetically among themselves). MEDIUM re-probe spam from persistent empty — addressed by Decision 1 (slot-keyed deduping) plus Decision 7 (re-probe circuit breaker: max 3 re-probes per slot, enforced by counting soft-deleted transcripts at the same slot).
