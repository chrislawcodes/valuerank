# Aggregate Timeout Refactor Plan

## Architecture

Refactor `updateAggregateRun` into three explicit phases:

1. **Prepare phase**
   - load scenarios, source runs, transcripts, and aggregate runs
   - validate configs and baseline eligibility
   - build the worker payload, aggregate metadata, and a deep source fingerprint over source run IDs, timestamps, transcripts, and eligibility-relevant config fields
   - include the eligibility-relevant run state in the fingerprint so the final write can detect stale config or source changes
   - compute a recompute claim token and lease window for the in-flight aggregate update, sized to cover the worker timeout plus a buffer

2. **Claim phase**
   - persist the claim token, fingerprint, and lease expiry in an existing JSON config field or equivalent mutable aggregate state using a very short transaction
   - use the advisory lock to serialize claim ownership for the same definition
   - fail fast or no-op if a valid in-flight claim already exists
   - treat an expired claim as reclaimable so a crashed process cannot wedge the definition forever
   - treat a claim that expires before persist as a retryable failure so stale work cannot be committed

3. **Compute phase**
   - spawn the Python worker
   - assemble the in-memory aggregate result
   - keep the claim token and source fingerprint attached to the prepared result so they can be checked later

4. **Persist phase**
   - enter a short Prisma interactive transaction
   - acquire the advisory lock for the definition
   - verify the claim token, lease expiry, and source fingerprint still match
   - verify the eligibility-relevant source state still matches the prepared fingerprint
   - find or create the aggregate run
   - supersede the prior `CURRENT` aggregate analysis row
   - write the new aggregate analysis row
   - clear the recompute claim on success
   - if the verification fails, throw a retryable error and leave the current aggregate untouched

This preserves the current aggregate semantics while moving the expensive work outside the transaction that was timing out.

## Implementation Decisions

- Keep the current aggregate orchestration entrypoint so existing callers do not change.
- Extract the expensive preparation work into a helper module so the transaction boundary is obvious in code and tests.
- Keep the final persistence helper small and single-purpose.
- Store the claim token and source fingerprint in existing JSON config fields rather than introducing a schema migration.
- Include a claim lease/expiry so stale claims self-heal without manual database intervention.
- Remove the temporary transaction timeout bump once the short transaction path is in place and verified.
- Keep the advisory lock, but scope it only to the persistence transaction.

## Risks

- Moving compute outside the transaction introduces a slightly larger stale snapshot window. That is acceptable only if the write phase remains serialized and the observable aggregate contract does not change.
- If a test or production observation shows the refactor changes aggregate eligibility, claim handling, or result shape, stop and fix that before merging.
- Because this code affects reports and recomputes, any attempt to change production data or deployment settings should be treated as a separate, explicit decision.

## Verification

- Run the aggregate service tests after the helper split.
- Add a regression test that exercises the new prepare/persist boundary.
- Add failure-path tests for missing or stale source data, and for stale claim rejection once the lease expires.
- Re-run the local aggregate recompute CLI if needed to confirm the report data refreshes cleanly with the refactored path.
- If the refactor still exceeds the default transaction budget, revisit the boundary before raising the timeout again.

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Claim leases, stale-result rejection, and same-transaction cleanup were added to preserve correctness while shortening the transaction.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: The spec now covers stale-data races, claim expiry, and explicit recovery behavior so the edge-case concerns are no longer implicit.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Eligibility-relevant state is revalidated and the claim now self-heals via lease expiry plus cleanup.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: The plan now includes a claim lease, short claim transaction, same-transaction claim cleanup, and fingerprint revalidation so stale or orphaned work does not wedge the aggregate updates.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: The verification section now calls for a boundary regression test plus a characterization-style aggregate test, and the worker remains mockable through the existing spawnPython seam.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: The plan now revalidates eligibility-relevant source state, uses advisory locking for claim ownership, and gives the claim a lease so the mutable JSON state is self-healing instead of permanent.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Slice 1 now includes the characterization test, Slice 2 now includes the boundary regression test, and the stale-result / claim-expiry handling is spelled out before implementation begins.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: The tasks now cover the claim lease, deep fingerprint, stale-rejection path, failure-path testing, and claim cleanup lifecycle that the review called out.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: The tasks now specify the deep fingerprint, lease-buffered claim, stale-result rejection, and failure-path coverage needed to keep the split safe to implement.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: The final persist now revalidates under the advisory lock, source queries are deterministically ordered, and claimed runs are marked RUNNING/COMPLETED so the aggregate no longer looks final mid-recompute.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: Cleanup now only deletes the newly claimed run when the claim still matches or clears the claim metadata without restoring a stale previous config, so valid concurrent results are not overwritten.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: The lease buffer is wider, source ordering is deterministic, and the final locked revalidation is the correctness guard we want even though it keeps a deliberate snapshot cost.
