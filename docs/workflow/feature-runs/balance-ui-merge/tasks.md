# Tasks: balance-ui-merge

## Slice 1 — Backend: log delta on every balance set

**Estimated diff:** ~35 lines changed (backend only)

**Files:**
- `cloud/apps/api/src/graphql/mutations/llm.ts`

**Tasks:**

- [ ] In `setProviderBalance` resolve function, after fetching `existing` provider, compute `balanceDecimal` (already done in current code)
- [ ] Restructure the `setProviderBalance` resolve function with three branches after fetching `existing`:
  - **Branch A — null balance** (`balanceDecimal === null`): do a simple `db.llmProvider.update({ data: { balance: null } })`, no sync log, return updated provider
  - **Branch B — balance unchanged** (`existing.balance` non-null and `existing.balance.equals(balanceDecimal)`): return `existing` directly, no DB write, no sync log
  - **Branch C — balance changed** (all other non-null cases): use `db.$transaction(async (tx) => {...})` callback form (NOT array form), so the balance read is inside the transaction:
    1. `const current = await tx.llmProvider.findUnique({ where: { id } })` — re-read inside tx
    2. `if (!current) throw new NotFoundError('LlmProvider', args.providerId)` — preserve NotFoundError
    3. Compute `systemBalanceAtSync = current.balance ?? new Prisma.Decimal(0)`
    4. Compute `delta = balanceDecimal.minus(systemBalanceAtSync)`
    5. `await tx.providerBalanceSyncLog.create({ data: { providerId, systemBalanceAtSync, enteredBalance: balanceDecimal, delta, createdByUserId: ctx.user?.id ?? null } })`
    6. `const updated = await tx.llmProvider.update({ where: { id }, data: { balance: balanceDecimal } })`
    7. Return `updated` from the transaction
- [ ] Update `cloud/apps/api/tests/graphql/mutations/provider-balance.test.ts`:
  - Add test: calling `setProviderBalance` with a new balance creates a `ProviderBalanceSyncLog` row with correct `systemBalanceAtSync`, `enteredBalance`, and `delta`
  - Add test: calling with null → non-null for first time (`systemBalanceAtSync` should be `0`, `delta` = enteredBalance)
  - Add test: calling with the same balance does NOT create a sync log and does NOT write to DB (returns existing provider)
  - Add test: calling with `balance: null` does NOT create a sync log; provider balance becomes null
  - Add test: calling with a non-existent `providerId` throws `NotFoundError`
- [ ] Run `npm run build --workspace @valuerank/api` — fix any errors
- [ ] Run `npm run lint --workspace @valuerank/api` — fix any errors
- [ ] Run `npm run test --workspace @valuerank/api` — fix any failures
- [ ] Commit: `feat: setProviderBalance now logs delta to ProviderBalanceSyncLog`

[CHECKPOINT]

## Slice 2 — Frontend: remove sync section, add balance display

**Estimated diff:** ~80 lines changed (frontend only)

**Files:**
- `cloud/apps/web/src/api/operations/llm.ts`
- `cloud/apps/web/src/components/settings/models/types.ts`
- `cloud/apps/web/src/components/settings/models/ModelsPanel.tsx`
- `cloud/apps/web/src/components/settings/models/ProviderSettingsModal.tsx`
- `cloud/apps/web/src/components/settings/models/ProviderSection.tsx`

**Tasks:**

- [ ] `operations/llm.ts`:
  - Remove `lastSyncedAt` from `LlmProvider` type
  - Remove `lastSyncedAt` from `LLM_PROVIDER_FRAGMENT` gql string
  - Remove `SYNC_PROVIDER_BALANCE_MUTATION` const
  - Remove `SyncProviderBalanceMutationResult` type
  - Keep `ProviderBalanceSyncLog` type (still useful) and `SET_PROVIDER_BALANCE_MUTATION`
  - **After editing the fragment**: run `npm run codegen --workspace @valuerank/web` from `cloud/` to regenerate `src/generated/graphql.ts` — commit the regenerated file (the `verify` gate diffs it)

- [ ] `types.ts`:
  - Remove `onSync?: (realBalance: number) => Promise<void>` from `ProviderSettingsModalProps`

- [ ] `ModelsPanel.tsx`:
  - Remove `SYNC_PROVIDER_BALANCE_MUTATION` from imports
  - Remove `const [, syncProviderBalance] = useMutation(SYNC_PROVIDER_BALANCE_MUTATION);`
  - Remove `handleSyncProvider` function
  - Remove `onSync={...}` prop from `<ProviderSettingsModal>` render

- [ ] `ProviderSettingsModal.tsx`:
  - Remove `onSync` from function parameters
  - Remove `syncInput`, `isSyncing` state
  - Remove `parsedSyncBalance`, `syncIsValid` derived values
  - Remove `handleSync` function
  - Remove the sync section JSX block (`{onSync && provider.balance != null && (...)}`)
  - Add a read-only balance display just below the Budget Balance input label area:
    ```tsx
    {provider.balance != null && (
      <p className="text-xs text-gray-500 mt-1">
        ValueRank balance: ${provider.balance.toFixed(2)}
      </p>
    )}
    ```
  - (The `lastSyncedAt` display was inside the now-removed sync section — it's already gone)

- [ ] `ProviderSection.tsx`:
  - Remove the `{provider.lastSyncedAt != null ? (...) : null}` span (the "Last synced:" badge)

- [ ] Grep `SYNC_PROVIDER_BALANCE_MUTATION` repo-wide before removing it to confirm no other call sites exist
- [ ] Run `npm run codegen --workspace @valuerank/web` (from `cloud/`) — regenerate `cloud/apps/web/src/generated/graphql.ts`; commit the updated file
- [ ] Run `npm run build --workspace @valuerank/web` — fix any TypeScript errors
- [ ] Run `npm run lint --workspace @valuerank/web` — fix any lint errors
- [ ] Update or add tests in `cloud/apps/web/src/` (whichever test file covers the provider modal or models panel) to assert:
  - The read-only balance display renders when `provider.balance` is not null
  - The read-only balance display is absent when `provider.balance` is null
  - The Sync section (`Sync` button) is not rendered
- [ ] Run `npm run test --workspace @valuerank/web` — fix any failures
- [ ] Commit: `feat: remove sync section, add read-only balance display in provider modal`

[CHECKPOINT]

## Quality Checklist

- [ ] No `@ts-ignore` or `any` types introduced
- [ ] No `console.log` introduced
- [ ] Removed code has no other call sites (grep for `syncProviderBalance`, `handleSyncProvider`, `onSync`, `lastSyncedAt`)
- [ ] `ProviderBalanceSyncLog` is still created when balance changes (covered by Slice 1)
- [ ] Build passes for both `@valuerank/api` and `@valuerank/web`
