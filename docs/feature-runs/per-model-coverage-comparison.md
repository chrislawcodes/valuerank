# Experiment — Per-Model Coverage with Mismatch Warning

## Outputs

- Direct Path: https://github.com/chrislawcodes/valuerank/pull/530 (`direct/per-model-coverage`)
- Feature Factory: https://github.com/chrislawcodes/valuerank/pull/531 (`factory/per-model-coverage`)

## Did Reviews Change The Work?

| Stage | Path | Artifact | stage_started_at | stage_finished_at | artifact_before_sha256 | artifact_after_sha256 | review_rounds | issues_raised | issues_accepted | artifact_revised |
|-------|------|----------|------------------|-------------------|------------------------|-----------------------|---------------|---------------|-----------------|------------------|
| Implement | Direct Path | code | 2026-04-03T23:27:18Z | 2026-04-03T23:39:40Z | 806b215… | 86dbdf2… | 1 | 2 | 2 | yes |
| Spec | Feature Factory | spec.md | 2026-04-03T23:27:15Z | 2026-04-03T23:28:50Z | 5554c5c… | 77a7cb9… | 1 | 5 | 4 | yes |
| Plan | Feature Factory | plan.md | 2026-04-03T23:29:04Z | 2026-04-03T23:31:35Z | 43517bc… | c586bad… | 1 | 6 | 5 | yes |
| Tasks | Feature Factory | tasks.md | 2026-04-03T23:31:37Z | 2026-04-03T23:33:14Z | 101c3bd… | ed9ab68… | 1 | 3 | 2 | yes |
| Implement | Feature Factory | code | 2026-04-03T23:33:17Z | 2026-04-03T23:45:19Z | d6a6dab… | 79525e9… | 1 | 2 | 1 | yes |

**Totals:**
- Direct Path: 2 issues raised, 2 accepted, 1 stage revised
- Feature Factory: 16 issues raised, 12 accepted, 5 stages revised (all of them)

## Timing

| Path | Started | Finished | Elapsed |
|------|---------|----------|---------|
| Direct Path | 23:27Z | 23:39Z | ~12 min |
| Feature Factory | 23:27Z | 23:45Z | ~18 min |

## Outcome

### Did Feature Factory catch problems the Direct Path missed?

Yes — one concrete bug. The implementation review caught that `CoverageCell` was **highlighting the wrong models**: it was highlighting models with min trial count rather than models where `trialCount === minTrialCount` (the laggards). Direct Path's self-review missed this. This is a UX correctness issue — the warning tooltip would have shown the wrong models as under-covered.

The plan review also caught five pre-implementation issues:
- `@default([])` needed in Prisma schema for the migration to work correctly
- `DomainSettings` shape files missing from the file list
- `nonAggregateRuns` tracking requirement
- `domain.select` missing `defaultModelIds`
- Model label fetch order

Of these, the Prisma `@default([])` and `domain.select` omission would likely have caused runtime errors or incorrect behavior without the plan review catching them first.

### Did the extra review steps change the code, scope, or tests?

Yes — every stage was revised. The spec review tightened ambiguities around trial increment source and zero-trial behavior. The plan review added two items that would likely have produced bugs (schema default, domain field selection). The tasks review clarified validation timing. The implementation review fixed the mismatch highlight logic.

Direct Path's self-review caught 2 issues (missing tests for `runModelsContainAll`, stale legend copy) — both real and worth fixing, but lower severity than the mismatch highlight bug.

### Was the extra overhead worth it for this feature?

**Yes, for the backend side. Mixed for the UI side.**

The backend algorithm (coverage calculation, `resolveSignatureRuns` filtering) benefited from the plan and spec reviews — these are exactly the "correctness risk hiding in data flow" bugs that adversarial review catches. The `domain.select` omission and Prisma default are the kind of thing that surfaces at runtime, not at lint/build time.

The UI bug (wrong models highlighted) was caught at implementation review in Feature Factory but missed in Direct Path's self-review. That's a meaningful difference.

Total overhead: ~6 minutes extra. One confirmed runtime/UX bug caught. Worth it.

### Which path would we choose next time?

**Feature Factory for this class of feature.**

This feature had:
- A non-trivial backend algorithm (min/max across a variable model set)
- Multiple layers touching the same data (coverage query → analysis query → UI display)
- A correctness property that's hard to test visually (which model gets highlighted)

That profile matches the pattern where Feature Factory has been informative in past experiments. The plan-stage review is particularly valuable when data flows through 3+ layers — it forces explicit attention to which fields need to be selected and passed through at each layer, before any code is written.

Direct Path is still the right call for pure UI work or features where the correctness properties are easy to verify visually.
