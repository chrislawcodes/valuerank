# Spec: balance-ui-merge

## Summary

Merge "Set Balance" and "Sync Balance" into a single unified action. Every balance save quietly creates an audit log record. The UI shows the current ValueRank-tracked balance next to the input so users can see drift at a glance. The separate Sync section and `lastSyncedAt` display are removed.

## Problem

The provider budget UI has two separate balance actions:
- **Set Balance** — overrides the balance with no audit trail
- **Sync Balance** — logs the delta between the tracked value and the real value

Both actions mean "enter the number from my billing dashboard." In practice, all `lastSyncedAt` values are null in production — nobody uses Sync.

## Solution

One input. One button. Every save logs the delta automatically.

## Scope

### In Scope

- Modify `setProviderBalance` backend mutation to also create a `ProviderBalanceSyncLog` when the balance changes (new balance ≠ old balance)
- Keep `syncProviderBalance` mutation intact (backward compatibility, no changes)
- Remove the "Sync" section from `ProviderSettingsModal` (the second input + "Sync" button)
- Add a read-only "ValueRank balance: $X.XX" display near the Budget Balance input (hidden when balance is null)
- Remove `lastSyncedAt` display from modal and provider section badge
- Remove `lastSyncedAt` from the frontend GraphQL fragment and `LlmProvider` type
- Remove `SYNC_PROVIDER_BALANCE_MUTATION` and related frontend types (no longer called from UI)
- Remove `onSync` prop from `ProviderSettingsModalProps` and all call sites
- Remove `handleSyncProvider` handler from `ModelsPanel`
- Remove `syncProviderBalance` mutation import and usage from `ModelsPanel`

### Out of Scope

- Removing `syncProviderBalance` from the backend schema
- Removing `lastSyncedAt` from the database or Prisma schema
- Any changes to how balance is decremented during runs
- Any migration or backfill

## Files Changed

| File | Change |
|------|--------|
| `cloud/apps/api/src/graphql/mutations/llm.ts` | `setProviderBalance` wraps update + sync log creation in a `$transaction`; returns updated provider |
| `cloud/apps/web/src/components/settings/models/ProviderSettingsModal.tsx` | Remove sync section and state; add read-only balance display |
| `cloud/apps/web/src/components/settings/models/types.ts` | Remove `onSync` from `ProviderSettingsModalProps` |
| `cloud/apps/web/src/components/settings/models/ProviderSection.tsx` | Remove `lastSyncedAt` badge |
| `cloud/apps/web/src/components/settings/models/ModelsPanel.tsx` | Remove `syncProviderBalance` mutation, `handleSyncProvider`, and `onSync` prop |
| `cloud/apps/web/src/api/operations/llm.ts` | Remove `lastSyncedAt` from type/fragment; remove `SYNC_PROVIDER_BALANCE_MUTATION` and related types |

## Do Not Touch

- `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `MEMORY.md`, `.gitignore`
- Any file not listed above
- `syncProviderBalance` backend mutation (leave unchanged)
- Prisma schema or migrations

## Acceptance Criteria

1. Saving provider settings with a new balance creates a `ProviderBalanceSyncLog` row recording the delta (new minus old)
2. The modal shows "ValueRank balance: $X.XX" as read-only text near the Budget Balance input when balance is not null
3. When balance is null, the read-only balance display is hidden
4. The modal has no separate "Sync" section, input, or button
5. `lastSyncedAt` is not displayed anywhere in the provider UI
6. TypeScript build passes for `@valuerank/api` and `@valuerank/web`
7. Lint passes for all changed workspaces

## Assumptions

- When balance is null and user sets a new value, the "old" balance for delta is 0 (existing behavior in `syncProviderBalance`)
- `syncProviderBalance` backend mutation stays intact — only the frontend removes its call site
- No log record is created if the balance doesn't change (guard: `existing.balance?.equals(balanceDecimal)`)

## Known Limitations (Deferred)

- **Non-atomic client-side save**: `ModelsPanel` calls `updateProvider` and `setProviderBalance` as two sequential mutations. A failure on the second call leaves rate limits updated but balance unchanged. This is a pre-existing issue unrelated to this feature's scope. Tracked for a future refactor that would combine them into one backend mutation.
- **Float comparison in `hasChanges`**: The modal uses `parsedBalance !== provider.balance` to detect changes. Float precision can make this unreliable. Pre-existing, not introduced by this feature.

## Implementation Note: Transaction Safety

The `setProviderBalance` mutation must read the existing balance **inside** the Prisma transaction to avoid a race condition where a concurrent update makes the logged delta stale. Use the `$transaction` callback form:

```ts
await db.$transaction(async (tx) => {
  const current = await tx.llmProvider.findUnique({ where: { id: args.providerId } });
  if (!current) throw new NotFoundError('LlmProvider', args.providerId);
  const systemBalanceAtSync = current.balance ?? new Prisma.Decimal(0);
  // ... create log, update provider, return updated provider
});
```

This ensures the balance read and write are atomic, and preserves the `NotFoundError` thrown before the transaction body. The `if (!existing)` check before the transaction can remain as an early exit for the non-balance-change path.
