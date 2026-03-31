# Domain Config Snapshot — Task Breakdown

## Phase 1: Schema + Migration

- [ ] T1.1 — Add `ValueStatementVersion` model to `schema.prisma` with `statementId` FK, `body`, `versionNumber`, `createdAt`, back-relation on `ValueStatement`
- [ ] T1.2 — Add `DomainConfigSnapshot` model to `schema.prisma` with all fields, `@@unique([fingerprint])`, `@@index([domainId, createdAt(sort: Desc)])`, back-relations on `Domain`, `PreambleVersion`, `LevelPresetVersion`, `DomainContext`
- [ ] T1.3 — Add back-relation `configSnapshots DomainConfigSnapshot[]` to `PreambleVersion`, `LevelPresetVersion`, and `DomainContext` models
- [ ] T1.4 — Add `domainConfigSnapshotId String? @map("domain_config_snapshot_id")` and relation to `Run` model
- [ ] T1.5 — Add `configSnapshots DomainConfigSnapshot[]` back-relation on `Domain` model
- [ ] T1.6 — Write migration SQL: create `value_statement_versions` table; create `domain_config_snapshots` table; add nullable `domain_config_snapshot_id` column to `runs`; backfill version 1 for all existing value statements (`INSERT INTO value_statement_versions (id, statement_id, body, version_number, created_at) SELECT gen_random_uuid(), id, body, 1, created_at FROM value_statements`)
- [ ] T1.7 — Run `npx prisma generate` in `cloud/packages/db` to verify schema compiles

## Phase 2: Snapshot Service

- [ ] T2.1 — Create `cloud/apps/api/src/services/domain-config-snapshot.ts`
  - `computeFingerprint(ids: (string | null | undefined)[]): string` — sort, filter nulls, SHA-256
  - `captureOrReuseDomainConfigSnapshot(domainId: string, tx?: TransactionClient): Promise<string | null>` — queries domain + value statements with latest versions, computes fingerprint, upserts snapshot, returns ID

## Phase 3: Value Statement Versioning

- [ ] T3.1 — Update `createValueStatement` mutation to wrap in `db.$transaction`, create statement then immediately create `ValueStatementVersion` (versionNumber: 1)
- [ ] T3.2 — Update `updateValueStatement` mutation to wrap in `db.$transaction`, create new `ValueStatementVersion` (versionNumber: max + 1), update `valueStatement.body` atomically
- [ ] T3.3 — Add `versions` field to `ValueStatementRef` in `cloud/apps/api/src/graphql/types/value-statement.ts` (optional array, ordered desc by versionNumber)
- [ ] ~~T3.4~~ REMOVED — `versions` is a relation field resolved on demand by GraphQL; no resolver change needed

## Phase 4: setDomainSettings Mutation + domainConfigSnapshots Query

- [ ] T4.1 — Add `SetDomainSettingsInput` input type in `cloud/apps/api/src/graphql/types/domain.ts`
- [ ] T4.2 — Add `DomainConfigSnapshotRef` object type in `cloud/apps/api/src/graphql/types/domain.ts` with fields: `id`, `domainId`, `fingerprint`, `createdAt`, `preambleVersionId`, `levelPresetVersionId`, `contextId`, `valueStatementVersionIds`
- [ ] T4.3 — Add `DomainConfigSnapshotRef` to `cloud/apps/api/src/graphql/types/refs.ts`
- [ ] T4.4 — Add `setDomainSettings` mutation to `cloud/apps/api/src/graphql/mutations/domain.ts`:
  - Validate domain exists
  - Update domain FK fields (preambleVersionId, levelPresetVersionId, contextId)
  - For each value statement body in input: find existing statement by token, create new version + update body (in transaction)
  - Call `captureOrReuseDomainConfigSnapshot`
  - Return the full `DomainConfigSnapshot` object (type: `DomainConfigSnapshotRef`)
- [ ] T4.5 — Create `cloud/apps/api/src/graphql/queries/domain/config-snapshot.ts` with `domainConfigSnapshots` query
- [ ] T4.6 — Import `config-snapshot.ts` in `cloud/apps/api/src/graphql/queries/domain/index.ts`

## Phase 5: Run Snapshot Capture

- [ ] T5.1 — Import `captureOrReuseDomainConfigSnapshot` in `cloud/apps/api/src/services/run/start.ts`
- [ ] T5.2 — Inside the existing `db.$transaction` block (around line 776), after resolving `domainId` from the definition, call `captureOrReuseDomainConfigSnapshot(domainId, tx)` and pass result to `tx.run.create` as `domainConfigSnapshotId`

## Phase 6: Web Operations

- [ ] T6.1 — Add `DomainConfigSnapshot` TypeScript type, `SET_DOMAIN_SETTINGS_MUTATION`, `SetDomainSettingsMutationResult`, `SetDomainSettingsMutationVariables` to `cloud/apps/web/src/api/operations/domains.ts`
- [ ] T6.2 — Add `DOMAIN_CONFIG_SNAPSHOTS_QUERY` and `DomainConfigSnapshotsQueryResult` to `cloud/apps/web/src/api/operations/domains.ts`
- [ ] T6.3 — Add `setDomainSettings` wrapper to `cloud/apps/web/src/hooks/useDomains.ts`

## Phase 7: UI Settings Panel

- [ ] T7.1 — In `DomainsManage.tsx`, when a domain is selected, render a "Settings" card:
  - Fetch preamble versions, level preset versions, domain contexts (reuse queries from JobChoiceNew)
  - Fetch value statements for the selected domain
  - Show preamble picker (select element or dropdown), level preset picker, context picker — populated with current defaults
  - Show value statement list with inline text areas (previous body shown grayed out below the input)
  - "Save Settings" button triggers `setDomainSettings` mutation
- [ ] T7.2 — Add collapsed "Config History" section in the settings card using the `DOMAIN_CONFIG_SNAPSHOTS_QUERY`
- [ ] T7.3 — Ensure no TypeScript errors: no `any` casts without justification, no `@ts-ignore`

## Quality Checklist

- [ ] QC1 — `npm run build --workspace @valuerank/api` passes with zero errors
- [ ] QC2 — `npm run build --workspace @valuerank/web` passes with zero errors
- [ ] QC3 — `npm run lint --workspace @valuerank/api` passes
- [ ] QC4 — `npm run lint --workspace @valuerank/web` passes
- [ ] QC5 — No Prisma scalar fields inside `include: {}` — all scalar selections use `select: {}`
- [ ] QC6 — All mutations that touch `ValueStatement.body` also create a `ValueStatementVersion` in the same transaction
- [ ] QC7 — `captureOrReuseDomainConfigSnapshot` is called with transaction client inside `startRun`
- [ ] QC8 — Protected files (`CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `.gitignore`) are NOT modified
