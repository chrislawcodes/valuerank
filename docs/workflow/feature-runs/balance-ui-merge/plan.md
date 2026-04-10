# Plan: balance-ui-merge

## Architecture

Two independent slices: backend first, then frontend. They meet at a stable contract — the `setProviderBalance` GraphQL mutation — so frontend work can be written knowing the backend contract won't change shape.

### Backend change (Slice 1)

`setProviderBalance` currently does:
1. Validate: balance >= 0
2. Fetch existing provider
3. `db.llmProvider.update(...)` — sets balance
4. Audit log (fire-and-forget void)
5. Returns provider

After this change:
1. Validate: balance >= 0
2. Fetch existing provider
3. If new balance ≠ existing balance and new balance is non-null, wrap in `db.$transaction(async tx => {...})` (callback form, not array form — so the balance read is inside the transaction):
   - Re-read provider inside tx
   - `db.providerBalanceSyncLog.create(...)` — captures delta
   - `db.llmProvider.update(...)` — sets balance
   - Return updated provider from tx
4. If balance is null (disabling tracking): simple update, no sync log
5. If balance unchanged: skip both the sync log AND the update — return existing provider directly (avoids pointless write)
6. Audit log (fire-and-forget void)
7. Returns provider

The return type does not change — still `LlmProviderRef`. The mutation signature does not change.

Delta calculation: `enteredBalance.minus(existing.balance ?? Decimal(0))` — same formula as `syncProviderBalance`.

#### Why transaction

The sync log and balance update must be atomic. If the update succeeds but the log fails, the audit trail is corrupted. `$transaction` is already used in `syncProviderBalance` for the same reason.

#### No change to `syncProviderBalance`

It stays as-is. The frontend will stop calling it, but it remains valid for any future caller.

### Frontend changes (Slice 2)

Three areas:

**1. `ProviderSettingsModal.tsx`** — the main UI change
- Remove: `syncInput`, `isSyncing`, `parsedSyncBalance`, `syncIsValid`, `handleSync` state and handlers
- Remove: the `onSync` prop and the entire sync section block (`{onSync && provider.balance != null && ...}`)
- Remove: `lastSyncedAt` display inside the sync section (already gone with the section)
- Add: read-only balance display near the Budget Balance input — "ValueRank balance: $X.XX" when `provider.balance != null`

**2. `ProviderSection.tsx`** — remove `lastSyncedAt` badge
- Remove: `{provider.lastSyncedAt != null ? ... : null}` span (lines 58–62)

**3. `ModelsPanel.tsx`** — remove sync plumbing
- Remove: `SYNC_PROVIDER_BALANCE_MUTATION` import
- Remove: `const [, syncProviderBalance] = useMutation(SYNC_PROVIDER_BALANCE_MUTATION);`
- Remove: `handleSyncProvider` function (lines 109–112)
- Remove: `onSync` prop from `<ProviderSettingsModal>` render

**4. `types.ts`** — remove `onSync` from `ProviderSettingsModalProps`

**5. `operations/llm.ts`** — cleanup
- Remove `lastSyncedAt` from `LlmProvider` type and `LLM_PROVIDER_FRAGMENT`
- Remove `SYNC_PROVIDER_BALANCE_MUTATION` and `SyncProviderBalanceMutationResult` type
- The `ProviderBalanceSyncLog` type and `SET_PROVIDER_BALANCE_MUTATION` stay

## Risk Callouts

| Risk | Mitigation |
|------|------------|
| Balance unchanged: unnecessary sync log created | Guard: skip log creation if `existing.balance?.equals(balanceDecimal)` is true |
| Null balance: Decimal comparison fails | Handle: `existing.balance == null` means old balance is 0, always log if setting a non-null value |
| Build breaks if `lastSyncedAt` referenced elsewhere | Grep before removing from type |
| `onSync` passed from a third call site | Check all `<ProviderSettingsModal` usages before removing prop |

## Verification

After Slice 1:
- `npm run build --workspace @valuerank/api` passes
- `npm run lint --workspace @valuerank/api` passes
- `npm run test --workspace @valuerank/api` passes — update `provider-balance.test.ts` to assert a `ProviderBalanceSyncLog` row is created when balance changes; verify no log for null/unchanged paths

After Slice 2:
- `npm run codegen --workspace @valuerank/web` (from `cloud/`) regenerates `src/generated/graphql.ts` — commit the updated file
- `npm run build --workspace @valuerank/web` passes
- `npm run lint --workspace @valuerank/web` passes
- `npm run test --workspace @valuerank/web` passes
- Manual smoke: open provider settings modal — no Sync section, balance display visible when balance is set

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: HIGH: valid — codegen step added to tasks.md Slice 2 (run npm run codegen after fragment change, commit graphql.ts). MEDIUM: valid — null balance case added to tasks.md Slice 1 (no sync log when setting balance to null). Residual risks noted and deferred per spec.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: rejected | note: HIGH: rejects a locked user decision — the merger of set/sync is explicitly what was requested. MEDIUM: fire-and-forget audit is pre-existing pattern, out of scope. LOW: null-to-no-log is a design decision (sync log schema requires numeric fields). Residual risks noted.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: deferred | note: HIGH (atomicity rollback test): impractical without complex Prisma tx mock — positive cases covered. HIGH (null logging): design decision, deferred. MEDIUM (dead DB column): explicitly out of scope. MEDIUM (manual smoke): accepted — added modal component tests to tasks.md Slice 2. LOW (grep for mutation): accepted — added SYNC_PROVIDER_BALANCE_MUTATION grep to tasks.md. Race condition residual risk acknowledged.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: deferred | note: MEDIUM (deployment order): plan explicitly says backend first; PR ships both slices together. MEDIUM UNVERIFIED (concurrency rationale): already documented in plan; implementer will add code comment. LOW UNVERIFIED (stale UI if partial deploy): not applicable for single-PR delivery. LOW UNVERIFIED (null=0 assumption): already in tasks test cases.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.gemini.quality-adversarial.review.md | status: rejected | note: CRITICAL: misunderstanding — setProviderBalance now creates a ProviderBalanceSyncLog on every balance change (Slice 1). Users still enter their real billing dashboard balance in the Budget Balance field and click Save; the sync log records the delta automatically. Drift correction is preserved and unified. HIGH: same misunderstanding — the Balance input IS the correction mechanism. MEDIUM UNVERIFIED: syncProviderBalance backend mutation is intentionally kept for backward compat, not dead code.
