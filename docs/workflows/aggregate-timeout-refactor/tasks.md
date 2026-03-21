# Aggregate Timeout Refactor Tasks

## Slice 1: Extract aggregate preparation from persistence

- [x] Create a helper under `cloud/apps/api/src/services/analysis/aggregate/` that loads source runs, transcripts, scenarios, and eligible aggregate metadata without opening a Prisma transaction.
- [x] Have that helper compute a deep source fingerprint over the source run IDs, source run timestamps, transcript IDs, transcript timestamps, and eligibility-relevant config fields, plus a recompute claim token and lease expiry that can be checked later during the write phase.
- [x] Move the expensive read, validation, and worker-payload shaping logic out of `updateAggregateRun` into that helper.
- [x] Keep the aggregate result shape and eligibility decisions identical to the current implementation.
- [x] Add or update a focused test in `cloud/apps/api/tests/services/analysis/aggregate.test.ts` that pins the prepare-phase output, including the source fingerprint, claim token, or lease inputs.
- [x] Add a focused characterization test that captures one canonical aggregate result before the write split and compares the refactored output against it.
- [x] Run `npm test --workspace=@valuerank/api -- --run tests/services/analysis/aggregate.test.ts`.
- [CHECKPOINT]

Estimated diff size: ~220 lines.

## Slice 2: Shrink the transaction to persistence only

- [x] Create a small claim helper that stores the recompute token, fingerprint, and lease expiry in the aggregate state using a short transaction and advisory lock, with the lease long enough to cover the worker timeout plus a safety buffer.
- [x] Create a small persistence helper that owns the advisory lock, claim/fingerprint/lease verification, aggregate-run lookup/create, analysis superseding, and analysis insert/update.
- [x] Wire `updateAggregateRun` to call the prepare helper first, then claim, then compute, then persist with the prepared snapshot.
- [x] Remove the temporary 60s transaction timeout workaround once the transaction only covers the final write section.
- [x] Keep the advisory lock and final writes in a single short transaction.
- [x] Add or update a focused regression test in the same slice that proves the boundary now excludes the expensive prepare and worker steps.
- [x] Make the claim cleanup happen in the same transaction as the successful write, with best-effort cleanup on worker failure and explicit rejection if the lease expires before persist.
- [x] Re-run the aggregate service test suite and the local recompute CLI if needed to confirm the report data refreshes cleanly.
- [CHECKPOINT]

Estimated diff size: ~260 lines.

## Slice 3: Verify the split boundary and clean up regressions

- [x] Add a regression test that proves a stale claim/fingerprint/lease is rejected.
- [ ] Add a regression test that fails gracefully when source runs or transcripts are missing or stale during the prepare phase.
- [ ] Add a characterization or golden-master style test for at least one canonical aggregate fixture so the refactor cannot silently change the stored result.
- [x] Confirm the aggregate output contract, same-signature eligibility, and worker payload shape still match the existing tests.
- [x] Run `npm run typecheck --workspace=@valuerank/api` and the aggregate test suite again.
- [ ] If the refactor surfaces a stale snapshot or race condition, stop and reconcile before merging.
- [CHECKPOINT]

Estimated diff size: ~120 lines.
