# Experiment: Per-Model Coverage with Mismatch Warning (Feature Factory)

| Stage | Artifact | stage_started_at | stage_finished_at | artifact_before_sha256 | artifact_after_sha256 | review_rounds | issues_raised | issues_accepted | artifact_revised | token_usage | cost_usage |
|-------|----------|------------------|-------------------|------------------------|-----------------------|---------------|---------------|-----------------|------------------|-------------|------------|
| Spec | spec.md | 2026-04-03T23:27:15Z | 2026-04-03T23:28:50Z | 5554c5c16b78396a0dbf376ff8af2e4a60720bb494446f8a4e93d8577b0906ac | 77a7cb90ee2a4bc3ae12079a896a43c4faa3ca8507b038996ea18e613c658a87 | 1 | 5 | 4 | yes | — | — |
| Plan | plan.md | 2026-04-03T23:29:04Z | 2026-04-03T23:31:35Z | 43517bc9f5cce5a7076eabc04c09bb5d7567061ba1326be48314c2191c332def | c586bad3d587230a6c79a14d94fe4100818ea10b55df6bd07e2380dca71f33f1 | 1 | 6 | 5 | yes | — | — |
| Tasks | tasks.md | 2026-04-03T23:31:37Z | 2026-04-03T23:33:14Z | 101c3bd191f27c3e92b57cfe3bd2d51e9baedd766b66d243cdc1e31b5a431133 | ed9ab685b3fb2ec78d780e9fbc88fde31a77b353e61ec3 | 1 | 3 | 2 | yes | — | — |
| Implement | code | 2026-04-03T23:33:17Z | 2026-04-03T23:45:19Z | d6a6dabea000729e2d5db798df0ba5274ca2ba7096df9c6390aa538d38b40f10 (initial) | 79525e99f4aa0769add00495bea03b242747b0057eff193f8c6df87a7be6a4cc | 1 | 2 | 1 | yes | — | — |

## Notes

### Spec review
- Raised: config.models existence (resolved by code search), trial increment source ambiguity, zero-trial behavior, mutation name inconsistency, setDomainSettings interaction
- Accepted 4: clarified increment source, zero-trial behavior, fixed mutation name references, called out domain.update interaction explicitly

### Plan review
- Raised: @default([]) required for Prisma migration, DomainSettings shape files missing from list, nonAggregateRuns tracking needed, domain select missing defaultModelIds, model label fetch order
- Accepted 5: all five substantive issues incorporated

### Tasks review
- Raised: llmModels query verification needed, validation timing ambiguity, task 8.1 ambiguity
- Accepted 2: llmModels confirmed, validation timing clarified (before transaction)

### Implementation review
- Raised: CoverageCell mismatch highlight logic incorrect (min models highlighted instead of laggard models)
- Accepted 1: fixed — now highlights models where trialCount === minTrialCount when hasMismatch

### Pre-existing test failure
- `tests/graphql/queries/queue.test.ts > Queue Status Query > returns valid count structure` — socket hang up from test isolation race condition. Passes when run alone. Unrelated to this feature.
