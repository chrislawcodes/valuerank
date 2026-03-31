# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md) | Constitution: [cloud/CLAUDE.md](../../../../cloud/CLAUDE.md)

## TypeScript (per constitution: "No `any` Types")

- [ ] No `any` types in any new file — use `unknown` if type is truly dynamic
- [ ] `run.config` JSON cast explicitly (e.g. `config as RunConfig`, or narrowed with type guard)
- [ ] `ModelCostEstimate[]` from `perModel` typed via import from `@valuerank/shared` or `services/cost/types.ts`
- [ ] `Decimal.toNumber()` called explicitly when converting `balance` for GQL Float field
- [ ] `ProviderBalanceSyncLog` DB type imported from `@valuerank/db`, not re-declared

## File Size (per constitution: "≤ 400 lines per file")

- [ ] `cloud/apps/api/src/services/budget/deduct.ts` stays under 400 lines (target ~80 lines)
- [ ] `cloud/apps/api/src/graphql/mutations/llm.ts` stays under 400 lines after mutation additions — split if needed
- [ ] `cloud/apps/web/src/components/runs/BudgetWarningDialog.tsx` stays under 400 lines
- [ ] No modified file grows past 400 lines — check after each change

## Logging (per constitution: "All logging goes through centralized logger")

- [ ] `deduct.ts` uses `createLogger('services:budget:deduct')` — no `console.log`
- [ ] Deduction skip for null balance: `log.debug(...)` not `log.info`
- [ ] Provider not found warning: `log.warn({ runId, providerName }, 'Provider not found...')`
- [ ] Deduction failure: `log.error({ runId, providerName, err }, 'Failed to deduct...')`
- [ ] Structured logging: always `log.method({ fields }, 'message')` — no string interpolation

## Database Access (per constitution: "Service layer owns DB access")

- [ ] `deductProviderBalancesForRun` lives in `services/budget/deduct.ts`, not in a GQL resolver
- [ ] GQL mutations call service functions or `@valuerank/db` query helpers — not `db.*` directly inside resolver
- [ ] Prisma `$executeRaw` used for atomic deduction (not `update({ data: { balance: { decrement } } })` which is not NULL-safe)
- [ ] `syncProviderBalance` mutation uses `db.$transaction([...])` for atomic log+update

## Error Handling (per constitution: "Use custom error classes")

- [ ] Negative balance input → throws `new ValidationError('...')` from `@valuerank/shared`
- [ ] Provider not found in `setProviderBalance` → throws `new NotFoundError('LlmProvider', id)`
- [ ] `deductProviderBalancesForRun` failures wrapped in try/catch — never throws; always logs

## Audit Pattern (per constitution: "Audited mutations")

- [ ] `setProviderBalance` calls `createAuditLog({ action: 'set_provider_balance', ... })`
- [ ] `syncProviderBalance` calls `createAuditLog({ action: 'sync_provider_balance', ... })`
- [ ] Both mutations receive `ctx.user?.id` and pass it as `createdByUserId`

## Migration (per constitution: "Always use Prisma Migrate — never `db push`")

- [ ] Migration generated via `prisma migrate dev --name add_provider_budget_tracking`
- [ ] Migration applied before running tests
- [ ] Migration is reversible (nullable column + new table only — no destructive changes)

## Import Order (per constitution)

- [ ] Node built-ins first, then external packages, then `@valuerank/*`, then relative imports
