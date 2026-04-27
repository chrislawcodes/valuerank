---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/cross-domain-status-page/spec.md"
artifact_sha256: "d4b8c700653ba3f3758969f2325021f48034bfb085c83644ef5e68586961a1ab"
repo_root: "."
git_head_sha: "728da7d111003c5b052de4afad7f33501fbe10ba"
git_base_ref: "origin/main"
git_base_sha: "ee49253d6dd9ce8c0dfd6789aad31716b74634e8"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH transcript-keyed anomalies persist after re-probe — addressed by Decision 1 (slot-keyed subject for `EMPTY_TARGET_RESPONSE`). HIGH re-probe mutation race — addressed by Decision 2 (Prisma `$transaction` wrapping the DB writes; queue enqueue post-commit). MEDIUM rate-limited/erroring status flag sources — addressed by Decision 6 (drop both flags from v1; only `stalled` and `done` are surfaced). MEDIUM mutation authorization — addressed by Decision 3 (mutations require auth; cross-domain access is the platform's intentional flat model — documented)."
raw_output_path: "docs/workflow/feature-runs/cross-domain-status-page/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. **High:** The re-probe flow is transcript-centric, but the spec soft-deletes the old transcript and creates a new one at the same slot without saying the anomaly detector ignores `deletedAt` rows or rebinds the anomaly to the replacement transcript/slot. As written, the original empty transcript still matches `EMPTY_TARGET_RESPONSE`, so the anomaly can stay open forever instead of auto-resolving.
2. **High:** `reprobeAnomalySlot` is described as a sequence of separate checks and writes, but the spec does not require a transaction or lock around the pending-job check, soft-delete, `probe_results` delete, and enqueue. That leaves a race where two clicks can both pass the guard and enqueue duplicate probes, which directly violates the stated idempotency behavior.
3. **Medium:** The enhanced model panel promises `rate-limited` and `erroring` status flags, but the spec never defines a source of truth for either. The only explicit inputs are `Run.stalledModels[]`, run status, and throughput/cost data, so those flags are either underdefined or will be guessed from undocumented heuristics.
4. **Medium [UNVERIFIED]:** The page is open to all authenticated users, but the spec does not say who may call `reprobeAnomalySlot` or `resolveRunAnomaly`. If those mutations inherit the same access level, any authenticated user could spend LLM budget or resolve anomalies across domains. That depends on the existing auth model and needs verification.

## Residual Risks

- The 5-second polling and cross-domain joins may still become expensive if anomaly volume grows, especially because pagination is deferred.
- ETA and status rendering will remain noisy on sparse runs, especially for newly-started models with little recent throughput data.
- Removing `/domains/status/:domainId` will surface 404s for any unupdated bookmarks, Slack links, or external references until all callers are cleaned up.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH transcript-keyed anomalies persist after re-probe — addressed by Decision 1 (slot-keyed subject for `EMPTY_TARGET_RESPONSE`). HIGH re-probe mutation race — addressed by Decision 2 (Prisma `$transaction` wrapping the DB writes; queue enqueue post-commit). MEDIUM rate-limited/erroring status flag sources — addressed by Decision 6 (drop both flags from v1; only `stalled` and `done` are surfaced). MEDIUM mutation authorization — addressed by Decision 3 (mutations require auth; cross-domain access is the platform's intentional flat model — documented).
