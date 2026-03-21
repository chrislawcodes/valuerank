# Aggregate Timeout Refactor Spec

## Goal

Refactor `cloud/apps/api/src/services/analysis/aggregate/update-aggregate-run.ts` so aggregate recomputation no longer holds a Prisma interactive transaction across the expensive read, validation, and Python worker steps.

The goal is to keep the aggregate result and eligibility semantics the same while shrinking the locked write window enough that growing batch counts do not trigger the Prisma 5 second timeout.

## Problem

`updateAggregateRun` currently performs all of the following inside one interactive transaction:

- advisory-lock acquisition
- loading source runs and their transcripts
- validating configs and baseline eligibility
- building worker payloads
- spawning the Python aggregate worker
- finding or creating the aggregate run
- superseding the old aggregate analysis row
- writing the new aggregate analysis row

That means the transaction duration grows with the size of the vignette history. The failure we observed in production was a Prisma interactive transaction timeout, not a bad aggregate result.

## Assumptions

- The aggregate output contract must stay the same.
- The eligibility rules for baseline-compatible aggregates must stay the same.
- The code path should still serialize concurrent writes for the same definition.
- The refactor may use a lightweight claim/fingerprint stored in existing JSON config fields if that is the simplest way to keep the long-running worker outside the transaction while still rejecting stale results.
- Any claim must have a lease/expiry so a crashed process cannot block aggregate updates forever.
- The temporary timeout bump is a stopgap; the refactor should make it unnecessary or clearly redundant.
- No production data or deployment changes are part of this workflow.

## In Scope

- `cloud/apps/api/src/services/analysis/aggregate/update-aggregate-run.ts`
- new helper module(s) under `cloud/apps/api/src/services/analysis/aggregate/`
- `cloud/apps/api/tests/services/analysis/aggregate.test.ts`
- any small test updates needed to pin the new split boundary

## Out Of Scope

- changing aggregate math, semantics, or output fields
- changing run categorization
- changing coverage report filters or UI behavior
- changing queue routing or when recomputes are triggered
- changing production data or migration state

## Proposed Behavior

- Read and prepare the aggregate inputs outside the interactive transaction.
- Acquire a short claim for the recompute before the worker starts, using a token, source fingerprint, and lease expiry so concurrent recomputes can detect an in-flight job instead of redoing the same expensive work.
- Spawn the Python aggregate worker outside the interactive transaction.
- Keep only the final advisory-lock-protected persistence work inside the transaction.
- Revalidate the source fingerprint, claim token, and claim lease before committing the new aggregate, and reject stale work instead of overwriting a newer result.
- Clear the claim in the same transaction that writes the new aggregate result; if compute fails before the final write, clear it best-effort in a separate short cleanup step and rely on the lease as a fallback.
- Continue to supersede the previous `CURRENT` aggregate analysis row before inserting the new one.
- Preserve the existing aggregate eligibility rules and output shape exactly.

## Acceptance Criteria

1. `updateAggregateRun` no longer spends the expensive recompute work inside a single interactive transaction.
2. A recompute claim/fingerprint/lease prevents stale worker results from being committed after the source data changes.
3. Concurrent recomputes for the same definition do not both commit as current; stale or superseded work is rejected.
4. Orphaned claims self-heal after the lease expires, and success clears the claim in the same transaction that writes the result.
5. The aggregate output contract remains unchanged for existing tests.
6. The same-signature baseline eligibility behavior remains unchanged.
7. The timeout workaround can be removed once the short transaction path is in place.
8. The existing aggregate test suite passes, and the refactor is covered by at least one test that exercises the new split boundary, at least one test that guards against stale-result commits, and at least one test that proves claim expiry or cleanup works.
