# Closeout: balance-ui-merge

## PR

https://github.com/chrislawcodes/valuerank/pull/581

## What shipped

- `setProviderBalance` backend mutation now auto-creates a `ProviderBalanceSyncLog` on every balance change using a callback-form `$transaction` (atomic read + log write + balance update). Three branches: null balance (no log), unchanged balance (no-op), changed balance (transaction + log).
- Removed the separate Sync section from `ProviderSettingsModal` — the Budget Balance input is the correction mechanism.
- Added read-only "ValueRank balance: $X.XX" display near the input (hidden when balance is null).
- Removed `lastSyncedAt` from the frontend fragment, `LlmProvider` type, and `ProviderSection` badge.
- Removed `SYNC_PROVIDER_BALANCE_MUTATION`, `onSync` prop, and all related frontend code.
- `graphql.ts` regenerated after schema/operation changes.
- 6 new API integration tests, 4 new web component tests.

## What was deferred / left out

- No changes to `syncProviderBalance` backend mutation — kept for backward compat.
- `lastSyncedAt` field remains on the DB schema and GraphQL type (not queried by the frontend, but not removed from backend).
- Concurrent save race condition is acknowledged as a known limitation (two users saving simultaneously could interleave reads and writes). Prisma's serializable isolation or a row-level lock would fix it, but that was out of scope.

## Adversarial review outcomes

- **Spec**: 2 Gemini + 1 Codex — all accepted or deferred after reconciliation.
- **Plan**: 2 Gemini + 1 Codex — all accepted. One Gemini testability finding prompted adding the `createdByUserId` nullable field test.
- **Tasks**: 2 Gemini + 1 Codex — all accepted.
- **Diff**: 2 Gemini + 1 Codex — Gemini quality review raised CRITICAL/HIGH findings that were **rejected** (misunderstood that `setProviderBalance` now is the drift correction mechanism); Gemini regression and Codex correctness accepted.

## Post-mortem notes

### What worked well

- **Callback-form `$transaction`**: Choosing the callback form over the array form was the right call. The spec called it out explicitly, Codex implemented it correctly, and the integration tests verified atomicity.
- **Two-repo testing pattern**: Worktree has no `node_modules`. The pattern of copying files → test in main repo → restore with `git checkout` worked reliably.
- **REPO_ROOT fix caught early**: The `parents[4]` → `parents[5]` off-by-one in the review scripts was caught on the first checkpoint run, before any reviews were wasted.

### What slowed things down

- **Stale reviews**: Any edit to spec/plan/tasks.md after reviews are run changes the artifact SHA and makes all reviews stale. Cleaning up and re-running is the right recovery, but it adds a full review cycle. Mitigation: finalize artifacts before running checkpoints.
- **`createdSyncLogIds` scope bug**: Codex removed a variable declaration that its own tests still referenced. The tests failed with `ReferenceError` at runtime. Manual fix was quick, but a stricter pre-commit lint would have caught it.
- **Gemini misunderstanding diff review**: The quality-adversarial review flagged drift correction as "removed" when it was actually unified and improved. This was a reviewer comprehension failure, not a signal. The rejection note documents the reasoning for future reference.
- **`max-context-chars` default too small**: Default of 10,000 chars caused `coverage_status: partial` for all reviews. Needed `--max-context-chars 80000`. Should be the default or documented more prominently.

## Preflight results (final)

```
npm run lint --workspace @valuerank/api     → 0 errors
npm run test --workspace @valuerank/api     → 2075 passed
npm run build --workspace @valuerank/api    → clean
npm run lint --workspace @valuerank/web     → 0 errors
npm run test --workspace @valuerank/web     → 1514 passed
npm run build --workspace @valuerank/web    → clean
```
