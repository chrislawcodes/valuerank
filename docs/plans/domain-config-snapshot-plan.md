# Domain Config Snapshot — Technical Plan

## Architecture Decisions

### Decision 1: Body stays on ValueStatement as a computed field
Rather than dropping `body` entirely from the `ValueStatement` model, keep it as a Prisma `@db.Text` field but **managed via ValueStatementVersion**. This avoids breaking every existing Prisma query that selects `body`.

**Alternative considered:** Remove `body` from `ValueStatement`, force all reads through `ValueStatementVersion`. Rejected because it would break 6+ callsites across start.ts, probe workers, and the web app simultaneously — the migration risk is too high for this wave.

**Actual approach:**
- Add `ValueStatementVersion` with its own `body`, `versionNumber`, and `statementId` FK.
- Keep `body` on `ValueStatement` as the "current body cache" — always equal to the latest version's body.
- This is a denormalization pattern but keeps backward compat. When a version is created, update both the version table and `valueStatement.body` in one transaction.

### Decision 2: Fingerprint scope
Fingerprint is `SHA-256` over the sorted array of all active config IDs: `[preambleVersionId, levelPresetVersionId, contextId, ...valueStatementVersionIds.sort()]`. Null values are excluded. This is `@@unique` at the DB level so upsert works correctly.

### Decision 3: valueStatementVersionIds as String[]
Use `String[]` Postgres array on `DomainConfigSnapshot`. No join table. Querying the actual version content requires a separate `findMany` but that's acceptable since history is read-rarely.

### Decision 4: Snapshot capture in startRun
Call `captureOrReuseDomainConfigSnapshot(domainId)` from within `startRun`'s existing transaction. This helper:
1. Queries the domain with its current preamble/levelPreset/context.
2. Queries all value statements with their latest version IDs.
3. Computes fingerprint.
4. `upsert` on fingerprint.
5. Returns snapshot ID.

### Decision 5: setDomainSettings replaces direct field mutations for domain config
The new mutation accepts `{ domainId, preambleVersionId?, levelPresetVersionId?, contextId?, valueStatements?: [{ token, body }] }`. It:
1. Updates domain FK fields (`defaultPreambleVersionId`, etc).
2. For each value statement body change, creates a new `ValueStatementVersion` and updates `valueStatement.body`.
3. Calls `captureOrReuseDomainConfigSnapshot` and returns the snapshot.

### Decision 6: UI uses existing picker queries
The settings panel in `DomainsManage.tsx` reuses `PREAMBLES_QUERY`, `LEVEL_PRESETS_QUERY`, and `DOMAIN_CONTEXTS_QUERY` (already used by `JobChoiceNew.tsx`). No new backend queries needed for picker data.

## File-by-File Plan

### Phase 1: Schema + Migration

**File:** `cloud/packages/db/prisma/schema.prisma`

Add models:
```
model ValueStatementVersion {
  id             String         @id @default(cuid())
  statementId    String         @map("statement_id")
  body           String
  versionNumber  Int            @map("version_number")
  createdAt      DateTime       @default(now()) @map("created_at")
  statement      ValueStatement @relation(fields: [statementId], references: [id], onDelete: Cascade)
  @@unique([statementId, versionNumber])
  @@index([statementId])
  @@map("value_statement_versions")
}
```

Add back-relation to `ValueStatement`:
```
versions ValueStatementVersion[]
```

```
model DomainConfigSnapshot {
  id                      String   @id @default(cuid())
  domainId                String   @map("domain_id")
  preambleVersionId       String?  @map("preamble_version_id")
  levelPresetVersionId    String?  @map("level_preset_version_id")
  contextId               String?  @map("context_id")
  valueStatementVersionIds String[] @map("value_statement_version_ids")
  fingerprint             String   @unique
  createdAt               DateTime @default(now()) @map("created_at")
  domain      Domain          @relation(fields: [domainId], references: [id], onDelete: Cascade)
  preambleVersion      PreambleVersion?    @relation(fields: [preambleVersionId], references: [id])
  levelPresetVersion   LevelPresetVersion? @relation(fields: [levelPresetVersionId], references: [id])
  context              DomainContext?      @relation(fields: [contextId], references: [id])
  @@index([domainId, createdAt(sort: Desc)])
  @@map("domain_config_snapshots")
}
```

Add to `Domain`:
```
configSnapshots DomainConfigSnapshot[]
```

Add to `Run`:
```
domainConfigSnapshotId String?              @map("domain_config_snapshot_id")
domainConfigSnapshot   DomainConfigSnapshot? @relation(fields: [domainConfigSnapshotId], references: [id])
```

**Migration file:** `cloud/packages/db/prisma/migrations/20260331000000_domain_config_snapshot/migration.sql`
- Creates `value_statement_versions` table
- Creates `domain_config_snapshots` table
- Adds `domain_config_snapshot_id` column to `runs`
- Backfills `value_statement_versions` for all existing value statements (version 1, body copied from `value_statements.body`)

### Phase 2: Snapshot Service

**New file:** `cloud/apps/api/src/services/domain-config-snapshot.ts`

Exports:
- `captureOrReuseDomainConfigSnapshot(domainId: string, tx?: PrismaClient): Promise<string | null>`
  - Returns snapshot ID or null if domain not found
  - Accepts optional transaction client
- `computeFingerprint(ids: (string | null | undefined)[]): string`
  - SHA-256 of sorted non-null IDs joined with `,`

### Phase 3: Update createValueStatement + updateValueStatement

**File:** `cloud/apps/api/src/graphql/mutations/value-statement.ts`

- `createValueStatement`: wrap in `db.$transaction`, create statement + version 1
- `updateValueStatement`: wrap in `db.$transaction`, create new version, update `valueStatement.body`

**File:** `cloud/apps/api/src/graphql/types/value-statement.ts`

- Add `versions` field to `ValueStatementRef` (optional, for history)
- Keep `body` on `ValueStatementRef` resolving from `valueStatement.body` (backward compat)

### Phase 4: setDomainSettings mutation + domainConfigSnapshots query

**File:** `cloud/apps/api/src/graphql/mutations/domain.ts`

Add `setDomainSettings` mutation:
- Input: `domainId: ID!`, `preambleVersionId: ID`, `levelPresetVersionId: ID`, `contextId: ID`, `valueStatements: [{ token: String!, body: String! }]`
- Updates domain FK fields
- Creates new versions for changed bodies
- Calls `captureOrReuseDomainConfigSnapshot`
- Returns `{ snapshotId: String! }`

**New file:** `cloud/apps/api/src/graphql/queries/domain/config-snapshot.ts`

Add `domainConfigSnapshots(domainId: ID!, limit: Int, offset: Int)` query. Import in `domain/index.ts`.

**File:** `cloud/apps/api/src/graphql/types/domain.ts`

Add `DomainConfigSnapshotRef` type exposing: `id`, `fingerprint`, `createdAt`, `preambleVersionId`, `levelPresetVersionId`, `contextId`, `valueStatementVersionIds`.

**File:** `cloud/apps/api/src/graphql/types/refs.ts`

Add `DomainConfigSnapshotRef`.

### Phase 5: Run creation — attach snapshot

**File:** `cloud/apps/api/src/services/run/start.ts`

Inside the existing `db.$transaction` at ~line 776, after the run object's domainId is resolved, call `captureOrReuseDomainConfigSnapshot(domainId, tx)`. Store result in `domainConfigSnapshotId` on `tx.run.create`. The snapshot helper must accept the transaction client so it runs within the same atomic boundary.

### Phase 6: Web — new GQL operations

**File:** `cloud/apps/web/src/api/operations/domains.ts`

Add:
- `SET_DOMAIN_SETTINGS_MUTATION` and types
- `DOMAIN_CONFIG_SNAPSHOTS_QUERY` and types

### Phase 7: UI — settings panel in DomainsManage

**File:** `cloud/apps/web/src/pages/DomainsManage.tsx`

When a domain is selected, show a "Settings" card:
- Preamble picker (select from preamble versions)
- Level preset picker (select from level preset versions)
- Context picker (select from domain contexts for this domain)
- Value statements list with inline edit (show previous body grayed out)
- "Save Settings" button → calls `setDomainSettings`
- Collapsed "Config History" section → shows `domainConfigSnapshots`

**File:** `cloud/apps/web/src/hooks/useDomains.ts`

Add `setDomainSettings` mutation wrapper.

## Files Modified (complete list)

1. `cloud/packages/db/prisma/schema.prisma`
2. `cloud/packages/db/prisma/migrations/20260331000000_domain_config_snapshot/migration.sql` (new)
3. `cloud/apps/api/src/services/domain-config-snapshot.ts` (new)
4. `cloud/apps/api/src/graphql/mutations/value-statement.ts`
5. `cloud/apps/api/src/graphql/types/value-statement.ts`
6. `cloud/apps/api/src/graphql/mutations/domain.ts`
7. `cloud/apps/api/src/graphql/queries/domain/index.ts` (add import for config-snapshot.ts)
7a. `cloud/apps/api/src/graphql/queries/domain/config-snapshot.ts` (new)
8. `cloud/apps/api/src/graphql/types/domain.ts`
9. `cloud/apps/api/src/graphql/types/refs.ts`
10. `cloud/apps/api/src/services/run/start.ts`
11. `cloud/apps/web/src/api/operations/domains.ts`
12. `cloud/apps/web/src/pages/DomainsManage.tsx`
13. `cloud/apps/web/src/hooks/useDomains.ts`

## DO NOT TOUCH

`CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `MEMORY.md`, `.gitignore`, any file not in the list above.

## Verification Steps

1. `cd cloud && npm run lint --workspace @valuerank/shared`
2. `cd cloud && npm run lint --workspace @valuerank/db`
3. `cd cloud && npm run lint --workspace @valuerank/api`
4. `cd cloud && npm run build --workspace @valuerank/api`
5. `cd cloud && npm run lint --workspace @valuerank/web`
6. `cd cloud && npm run build --workspace @valuerank/web`
