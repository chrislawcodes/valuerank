# Plan: Visitor Role — Read-Only Access Control with Admin User Management

**Slug:** visitor-role-access-control
**Created:** 2026-04-21
**Status:** draft
**Spec:** docs/workflow/feature-runs/visitor-role-access-control/spec.md

---

## Review Reconciliation

- review: reviews/spec.codex.risk-adversarial.review.md | status: accepted | note: MEDIUM admin read endpoints: accepted by design — writes are restricted server-side, reads for admin config pages are protected by client-side route guards only. The data (LLM model configs, infra settings) is not sensitive credentials. MEDIUM FR-006 conflict with FR-005c: clarified in FR-006 — mutations call requireAdmin() EXCEPT those in FR-005c. MEDIUM nested route matching: addressed in FR-019 — now specifies wildcard prefix matching for all restricted sections. MEDIUM email uniqueness: addressed in FR-014 — lowercase canonicalization + DB unique constraint. MEDIUM REST write audit: addressed in FR-014a — /api/import is the only write endpoint; default-deny rule documented for future routes.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.risk-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH Wave 5 manual testing: deferred — full E2E framework (Playwright/Cypress) is out of scope for V1; manual verification documented. Flagged as post-ship tech debt. HIGH grep mutation audit: upgraded to a schema-aware integration test in Risk 1 — enumerates all mutations via introspection and asserts FORBIDDEN for Visitor on each; provides durable CI gate. MEDIUM last-admin race test: accepted; added controlled parallel integration test approach using Promise.all + note on test-mode delay. MEDIUM password change JWT race: handled naturally — JWT is signed from fresh DB read at signing time so current role is always in the new token. MEDIUM read endpoint snapshot: deferred as out of scope for V1; the one-time manual verification before ship is sufficient given this is configuration metadata not credentials. MEDIUM JWT test helpers: added Risk 2b to plan — check for existing helper, create if absent. LOW migration test: handled by existing integration test suite via test DB setup. LOW listUsers passwordHash: added explicit integration test to Wave 4 verification.
- review: final adversarial review (Codex, 2026-04-21) | status: accepted | note: S1 US2 test scenario: fixed — independent test now accounts for forced password change before Visitor restrictions are visible. S2 read-side auth gap: resolved — added FR-005d (reads default-allow; only listUsers is admin-gated in V1) and updated US1 acceptance scenario 3. S3 mustChangePassword API bypass: accepted as V1 limitation — added to spec Non-Goals and Edge Cases. S4 button behavior contradiction: fixed — US4 acceptance scenario now says "hidden" to match FR-021. P1 MCP write tools: added FR-014b to spec and MCP enforcement section to Wave 4. P2 JWT timestamp race: fixed — Wave 3 now specifies iat = passwordChangedAt + 1s. P3 web auth layer: fixed — Wave 5 explicitly lists context.tsx and types/index.ts; notes /api/auth/me response must include new fields. P4 AccountPanel logout: fixed — Wave 5 explicitly calls out current logout behavior and required change. P5 import inline check: fixed — updated to use requireAdminRest middleware defined in require-admin.ts.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: MEDIUM JWT revocation on role/password change: accepted V1 limitation — explicitly documented in spec Edge Cases and Non-Goals; stale JWT role is the accepted design. MEDIUM default role=ADMIN for pre-migration tokens: intentional and safe per FR-005b — FR-002 backfills all existing users to ADMIN before any token is issued. MEDIUM requireAdmin null user handling: already addressed — spec and plan specify requireAdmin throws ForbiddenError for null/undefined user; requireAdminRest checks !req.user before role.
- review: reviews/tasks.codex.risk-adversarial.review.md | status: accepted | note: MEDIUM CLI bootstrap mustChangePassword: CLI is the first-admin bootstrap path only (FR-009c) — admins who create their own account via CLI know their password; mustChangePassword is for admin-created accounts via the UI/API. MEDIUM requireAdminRest null check: plan specifies !req.user check before role check — implementer must include both conditions. MEDIUM manual per-file rollout brittle: acknowledged; mitigated by schema-aware introspection test (Slice 4 verification) which is the durable CI gate — any missed mutations will be caught by the test.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: CRITICAL default ADMIN for old JWTs: intentional and safe per spec FR-005b — FR-002 backfills ALL existing users to ADMIN before deploy; no existing user is a Visitor, so treating pre-migration tokens as ADMIN is correct and temporary (expires with the JWT TTL). CRITICAL old JWT not invalidated after password change: the existing middleware already validates iat against passwordChangedAt — this check is in place today and the plan preserves it. The fresh JWT iat is set to passwordChangedAt+1s to pass the check. Additional per-request DB lookups are rejected by Decision 1 (role in JWT). HIGH per-mutation enforcement brittle: mitigated by schema-aware introspection test in Slice 4 — all mutations are enumerated via introspection and tested against VISITOR role on every CI pass; this is the durable gate. MEDIUM last-admin SERIALIZABLE race: SERIALIZABLE isolation with Prisma  is the correct mechanism — the transaction fails atomically if another concurrent transaction modified the admin count; no SELECT-then-UPDATE race condition exists at SERIALIZABLE level.

## Architecture Overview

This feature adds a two-tier role system to ValueRank. The enforcement stack has four independent layers. Each layer is independently testable and independently deployable:

| Layer | Where | What it enforces |
|-------|-------|-----------------|
| **Database** | `schema.prisma` + migration | Role and `mustChangePassword` fields exist |
| **Auth middleware** | `auth/middleware.ts`, JWT signing | Role flows from DB → JWT → `req.user` |
| **API** | GraphQL resolvers, REST routes, MCP write tools | `requireAdmin()` blocks Visitor writes |
| **Web** | Route guards + NavTabs | Restricted pages hidden/redirected |

All layers are required. The web layer is not the security boundary — the API layer is. The web layer provides UX; the API layer enforces access.

---

## Architecture Decisions

### Decision 1: Role in JWT vs. per-request DB lookup

**Choice:** Role in JWT payload.

**Rationale:** Existing JWT infrastructure already carries `id` and `email`. Adding `role` is a non-breaking extension. A per-request DB lookup for every GraphQL call would add latency and DB load. The 24h TTL bounds the stale-role window to an acceptable exposure.

**Trade-off:** Role changes don't take effect until the next login. Documented in spec as a known V1 limitation; UI shows a notice. If real-time revocation is needed in the future, introduce a JWT blocklist or shorter TTL.

### Decision 2: Default-deny for write mutations

**Choice:** `requireAdmin()` call at the top of every write resolver, with explicit Visitor exceptions listed.

**Rationale:** An allowlist approach (block specific mutations, leave the rest) means new mutations are open by default. Default-deny means new mutations are closed by default. The cost is one extra call per mutation; the benefit is no accidental bypass.

**Implementation note:** A single `requireAdmin()` helper function in `cloud/apps/api/src/auth/require-admin.ts` is the only way to enforce this. Inline checks would scatter the policy.

### Decision 3: changePassword is a REST route, not a GraphQL mutation

**Context:** `PUT /api/auth/password` already exists in `cloud/apps/api/src/routes/auth.ts`. It is auth-guarded via `requireAuth` middleware. Since it's REST (not GraphQL), the `requireAdmin()` GraphQL helper doesn't apply — it is a Visitor-permitted route by virtue of not being in the FR-006 mutation list.

**Action needed:** The REST route must:
- Increase the minimum password length from 8 to 12 (per FR-009a)
- Clear `mustChangePassword` in the DB when it was `true`
- Return a fresh JWT in the response when `mustChangePassword` was cleared (to break the route-guard redirect loop per FR-009b)

### Decision 4: `mustChangePassword` flag in JWT

**Choice:** Include `mustChangePassword: boolean` in the JWT payload (alongside `id`, `email`, `role`).

**Rationale:** The web route guard reads the flag from the JWT without a DB round-trip. When the flag is cleared on password change, a fresh JWT is issued and stored by the web app, updating the route guard state in the same session.

**Alternative considered:** Read the flag from a `GET /api/auth/me` call on each navigation. Rejected because it adds latency and a network call to every protected route render.

### Decision 5: `updateUserRole` uses SERIALIZABLE isolation

**Choice:** Prisma `$transaction` with `isolation: 'Serializable'`.

**Rationale:** The last-admin check must be atomic. Prisma's default READ COMMITTED does not prevent two concurrent transactions from both seeing "there is one admin" and both downgrading that admin. SERIALIZABLE makes one of them retry or fail.

---

## Wave Breakdown

### Wave 1: Database Schema + Migration
**~40 lines changed**

**Files:**
- `cloud/packages/db/prisma/schema.prisma`
- New migration file (auto-generated by `prisma migrate dev`)

**Changes:**
1. Add `UserRole` enum:
   ```prisma
   enum UserRole {
     ADMIN
     VISITOR
   }
   ```
2. Add fields to `User` model:
   ```prisma
   role               UserRole @default(ADMIN) @map("role")
   mustChangePassword Boolean  @default(false)  @map("must_change_password")
   ```
3. Migration SQL must include a backfill: all existing rows get `role = 'ADMIN'`.
4. Update `@@map("users")` remains unchanged.

**Verification:**
- Run `prisma migrate dev --name add_user_role` locally against the test DB
- Confirm all existing user rows have `role = 'ADMIN'` after migration
- Confirm `mustChangePassword` defaults to `false` for new rows

---

### Wave 2: Auth Layer
**~120 lines changed**

**Files:**
- `cloud/apps/api/src/auth/types.ts`
- `cloud/apps/api/src/auth/middleware.ts`
- New: `cloud/apps/api/src/auth/require-admin.ts`
- `cloud/apps/api/src/graphql/context.ts`

**Changes:**

**`auth/types.ts`:** Add `role` and `mustChangePassword` to `AuthUser`:
```typescript
export type AuthUser = {
  id: string;
  email: string;
  role: 'ADMIN' | 'VISITOR';
  mustChangePassword: boolean;
};
```

**`auth/middleware.ts`:**
- JWT verification: decode `role` and `mustChangePassword` from the payload. If `role` is missing (pre-migration token), default to `'ADMIN'` — all pre-migration users are ADMIN. If `mustChangePassword` is missing, default to `false`.
- API key auth branch: after resolving the user from the API key, fetch `user.role` and `user.mustChangePassword` from the DB and attach to `req.user`. This is the only place that requires a DB lookup; JWT auth does not.

**`cloud/apps/api/src/routes/auth.ts` (login endpoint):**
- The login route (e.g., `POST /api/auth/login`) issues the initial JWT. This MUST be updated to include `role` and `mustChangePassword` in the JWT payload and in the login response body. Read this file before implementing Wave 2 to identify the exact token-signing call. The response body (which the web client uses to hydrate `user`) must also include `role` and `mustChangePassword` — not just the JWT.
- If `GET /api/auth/me` exists and the web client uses it to re-hydrate the user on page load, that route's response must also include `role` and `mustChangePassword` from the DB.

**Note:** The token-signing logic (where `role` and `mustChangePassword` are added to the JWT payload) lives in the login route handler, not just in middleware.ts. Updating only the decode path in middleware.ts without updating the issuer in the login route means new tokens will not carry the new fields.

**`auth/require-admin.ts`** (new file):
```typescript
import { type Request, type Response, type NextFunction } from 'express';
import { type Context } from '../graphql/context.js';
import { ForbiddenError } from '@valuerank/shared';

// For GraphQL resolvers
export function requireAdmin(ctx: Context): void {
  if (ctx.user === null || ctx.user === undefined) throw new ForbiddenError('Authentication required');
  if (ctx.user.role !== 'ADMIN') throw new ForbiddenError('Admin access required');
}

// For REST routes (Express middleware)
export function requireAdminRest(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
```

**`graphql/context.ts`:** `Context` already has `user: AuthUser | null`. Since `AuthUser` gains `role`, no interface change needed — but verify `ForbiddenError` is exported from `@valuerank/shared`.

**Verification:**
- Unit test: JWT with no `role` claim → `req.user.role === 'ADMIN'`
- Unit test: JWT with `role: 'VISITOR'` → `req.user.role === 'VISITOR'`
- Unit test: API key auth → DB is queried for role; result attached to `req.user`
- Unit test: `requireAdmin()` throws `ForbiddenError` for VISITOR users and passes for ADMIN users

---

### Wave 3: Password Service Updates
**~60 lines changed**

**Files:**
- `cloud/apps/api/src/routes/auth.ts` — existing `PUT /api/auth/password`
- `cloud/apps/api/src/cli/create-user.ts` — existing CLI script

**Changes:**

**`routes/auth.ts` — `PUT /api/auth/password`:**
1. Increase minimum password length from 8 to 12.
2. After updating `passwordHash`, check if `mustChangePassword` was `true` for this user.
3. If yes: set `mustChangePassword: false` in the DB update, then issue and return a fresh JWT with `mustChangePassword: false` in the response body (alongside `{ success: true }`).
4. If no: existing behavior unchanged (return `{ success: true }`).

The fresh JWT must be constructed via the same `signJwt` / `issueToken` function used at login so it carries all current user fields (`role`, `mustChangePassword: false`, etc.).

**JWT timestamp note:** The existing auth middleware rejects JWTs where `iat <= passwordChangedAtSeconds`. To prevent the fresh JWT from being rejected in the same second the password changes, set the JWT's `iat` to `Math.floor(passwordChangedAt.getTime() / 1000) + 1` (one second after the DB write). Read `passwordChangedAt` from the DB update result to get the exact timestamp written.

**`cli/create-user.ts`:**
1. Add `--role` CLI argument, defaulting to `ADMIN`.
2. Update DB write to include `role` in the `create` call.
3. Update `MIN_PASSWORD_LENGTH` to 12 (consolidating with the 12-char policy from FR-009a). Note: existing test users created with 8-char passwords are unaffected.

**Verification:**
- Integration test: `PUT /api/auth/password` with a user where `mustChangePassword: true` → response includes a new JWT, DB has `mustChangePassword: false`
- Integration test: `PUT /api/auth/password` with a user where `mustChangePassword: false` → response is `{ success: true }`, no JWT returned
- Integration test: password shorter than 12 chars → 400 validation error
- CLI: `create-user --role VISITOR` → user created with VISITOR role

---

### Wave 4: GraphQL Mutation Enforcement
**~200 lines changed across many files**

**Files (add `requireAdmin(ctx)` as the first call in each resolver):**

The following files were confirmed on-disk. **Do not rely on this list alone — also run the schema-aware introspection test (Risk 1) to catch any files added after this plan was written.**

```
cloud/apps/api/src/graphql/mutations/api-key.ts
cloud/apps/api/src/graphql/mutations/analysis.ts
cloud/apps/api/src/graphql/mutations/definition-tags.ts
cloud/apps/api/src/graphql/mutations/definition/create-and-fork.ts
cloud/apps/api/src/graphql/mutations/definition/maintenance.ts
cloud/apps/api/src/graphql/mutations/definition/updates.ts
cloud/apps/api/src/graphql/mutations/domain/analysis.ts
cloud/apps/api/src/graphql/mutations/domain/crud.ts
cloud/apps/api/src/graphql/mutations/domain/evaluation.ts
cloud/apps/api/src/graphql/mutations/domain/settings.ts
cloud/apps/api/src/graphql/mutations/domain-context.ts
cloud/apps/api/src/graphql/mutations/ensure-domain-vignette-pair.ts
cloud/apps/api/src/graphql/mutations/export.ts
cloud/apps/api/src/graphql/mutations/level-preset.ts
cloud/apps/api/src/graphql/mutations/llm.ts
cloud/apps/api/src/graphql/mutations/paired-vignette.ts
cloud/apps/api/src/graphql/mutations/preamble.ts
cloud/apps/api/src/graphql/mutations/queue.ts
cloud/apps/api/src/graphql/mutations/run/lifecycle.ts
cloud/apps/api/src/graphql/mutations/run/maintenance.ts
cloud/apps/api/src/graphql/mutations/run/recovery.ts
cloud/apps/api/src/graphql/mutations/run/summarization.ts
cloud/apps/api/src/graphql/mutations/survey.ts
cloud/apps/api/src/graphql/mutations/tag.ts
cloud/apps/api/src/graphql/mutations/value-statement.ts
```

Note: `definition/results.ts`, `definition/shared.ts`, `definition/inputs.ts`, `domain/types.ts`, `domain/launch/` subdirectory files, `paired-vignette-helpers.ts`, `paired-vignette-aliases.ts`, and `paired-vignette-schema.ts` are helpers/types — confirm they contain no resolver definitions before skipping them.

**New file:** `cloud/apps/api/src/graphql/mutations/user.ts`
- `createUser` mutation: validate role, normalize email to lowercase, validate password (12+), hash password, create user with `mustChangePassword: true`.
- `updateUserRole` mutation: check current user is ADMIN, run SERIALIZABLE transaction to count remaining admins after proposed change, reject if result would be 0, apply update.
- `listUsers` query (can go in `cloud/apps/api/src/graphql/queries/` instead): returns all users with `id, email, name, role, lastLoginAt, createdAt, mustChangePassword`. Admin-only.

**`cloud/apps/api/src/routes/import.ts`:**
- Apply the `requireAdminRest` Express middleware (defined in `auth/require-admin.ts` — Wave 2) to the import route. Do not add an inline check; use the shared middleware to maintain the single enforcement path from Decision 2.

**MCP Write Tool Enforcement:**
- Before implementation, read `cloud/apps/api/src/mcp/` (server setup + middleware) to determine how the calling user's identity and role are resolved in MCP tool handlers.
- All MCP write tools MUST call `requireAdmin()` (GraphQL variant) or throw a FORBIDDEN error if the resolved user's role is not ADMIN. The write tools to update are:
  - `cloud/apps/api/src/mcp/tools/create-definition.ts`
  - `cloud/apps/api/src/mcp/tools/update-llm-model.ts`
  - `cloud/apps/api/src/mcp/tools/reactivate-llm-model.ts`
  - `cloud/apps/api/src/mcp/tools/set-summarization-parallelism.ts`
  - `cloud/apps/api/src/mcp/tools/trigger-recovery.ts`
  - `cloud/apps/api/src/mcp/tools/add-tags-to-definitions.ts`
  - Any other tool that writes to the database (scan `cloud/apps/api/src/mcp/tools/` for `db.` calls with create/update/delete)
- Read-only tools (`get-run-summary`, `get-transcript`, `get-run-results`, `graphql-query`, `get-llm-model`, `get-value-pairs`) do not need changes.
- If the MCP auth context does not yet carry user role, update the MCP middleware to fetch it from the DB at auth time (same pattern as the API key auth branch in Wave 2).

**Verification:**
- Integration test: VISITOR JWT calling `startRun` → GraphQL error `FORBIDDEN`
- Integration test: ADMIN JWT calling `startRun` → succeeds (no regression)
- Integration test: VISITOR JWT calling `POST /api/import` → HTTP 403
- Integration test: `createUser` → user created with `mustChangePassword: true`
- Integration test: `updateUserRole` on last Admin → validation error
- Integration test: `listUsers` from VISITOR → GraphQL error `FORBIDDEN`
- Integration test: `listUsers` from ADMIN → response objects contain ONLY `id, email, name, role, lastLoginAt, createdAt, mustChangePassword`; NO `passwordHash` present (regression guard against field leakage)
- Manual verification: call each MCP write tool as a VISITOR (or verify the MCP auth context rejects Visitor role); all write tools return FORBIDDEN
- Integration test (concurrent last-admin): launch two parallel `updateUserRole` calls both attempting to demote the last admin; verify exactly one succeeds and one returns a validation error. Note: true parallel DB races are hard to guarantee in tests — use a controlled approach: run them in Promise.all with a transaction-level delay injected in test mode, or use a DB lock test pattern.
- Schema-aware integration test: enumerate all GraphQL mutations via introspection; call each as a VISITOR; assert FORBIDDEN for all (empty allowlist for GraphQL Visitor mutations — `changePassword` is REST)

---

### Wave 5: Web — Role-Aware UI
**~250 lines changed**

**Files:**
- `cloud/apps/web/src/auth/context.tsx` — update `AuthProvider` and the stored user shape to include `role` and `mustChangePassword`; if `AuthProvider` builds the user object from `GET /api/auth/me`, update that route's response type to include the new fields
- `cloud/apps/web/src/types/index.ts` — update the shared `User` type to include `role: 'ADMIN' | 'VISITOR'` and `mustChangePassword: boolean`
- `cloud/apps/web/src/hooks/useAuth.ts` (or equivalent auth hook) — expose `role` and `mustChangePassword` from the auth context (populated by the changes above)
- `cloud/apps/web/src/components/ProtectedRoute.tsx` — add `requiredRole` prop + redirect logic
- `cloud/apps/web/src/App.tsx` — wrap restricted routes with `<ProtectedRoute requiredRole="ADMIN">`; add `mustChangePassword` top-level guard
- `cloud/apps/web/src/components/layout/NavTabs.tsx` — hide Archive tab, Settings tab (non-account items), Manage Domains item for VISITOR
- New: `cloud/apps/web/src/pages/SettingsUsers.tsx` — User Management page
- New: `cloud/apps/web/src/api/operations/user.ts` — `listUsers`, `createUser`, `updateUserRole` GQL operations

**Changes:**

**`useAuth.ts`:** Read `role` and `mustChangePassword` from the decoded JWT. Expose as part of the auth context. When a fresh JWT is returned from `PUT /api/auth/password`, store it and re-read the updated flags.

**`ProtectedRoute.tsx`:** Add optional `requiredRole: 'ADMIN' | 'VISITOR'` prop. If `requiredRole === 'ADMIN'` and `user.role !== 'ADMIN'`, redirect to `/`. Existing `isAuthenticated` check remains as the outer gate.

**`App.tsx`:**
- Wrap these routes with `<ProtectedRoute requiredRole="ADMIN">`:
  - `/archive` and all child routes
  - `/settings/system-health`, `/settings/models`, `/settings/infrastructure`, `/settings/api-keys`, `/settings/users`
  - `/preambles`, `/level-presets`
  - `/domains/manage`
- Add a top-level redirect: if `user.mustChangePassword === true` and the current path is not `/settings/account`, redirect to `/settings/account`.

**`NavTabs.tsx`:**
- Import `useAuth` hook.
- Filter `settingsMenuItems` to show only `Account` for VISITOR users.
- Hide the entire Archive tab for VISITOR users.
- Hide the "Manage Domains" item from `domainMenuItems` for VISITOR users.
- Add "User Management" item to `settingsMenuItems` for ADMIN users only (path: `/settings/users`).

**`SettingsUsers.tsx`** (new page):
- Admin-only (wrapped in `ProtectedRoute requiredRole="ADMIN"` in App.tsx).
- Fetches `listUsers` on mount.
- Table columns: Name, Email, Role (inline dropdown), Last Login, Created.
- "Create User" section: form with Name, Email, Password, Role fields.
- On role change: calls `updateUserRole`, shows "Role changes take effect on the user's next login" notice.
- Error handling: email conflict, last-admin protection error.

**`AccountPanel.tsx`** (update):
- **IMPORTANT:** The current `AccountPanel.tsx` likely logs the user out or clears auth state after a successful password change. This behavior MUST change when `mustChangePassword` was true: instead of logging out, (1) check if the response includes a fresh JWT, (2) if yes, store the new JWT in the auth context via the token-update mechanism (confirm this exists — see Risk 5), (3) re-decode the new JWT to refresh user state, (4) redirect to `/` — the user is now fully set up with their own password and no redirect loop.
- Show a banner "Your password was set by an administrator. Please set a new password." when `mustChangePassword` is true.
- The token update mechanism must be confirmed before implementation (see Risk 5). If it does not exist, add `setToken` / `updateUser` to the auth context in `context.tsx` as part of this wave.

**Verification (manual UI check):**
- Log in as VISITOR: Archive tab absent, Settings tab shows only Account, Domains nav has no "Manage"
- Navigate to `/archive` as VISITOR: redirected to `/`
- Navigate to `/settings/models` as VISITOR: redirected to `/`
- Navigate to `/settings/account` as VISITOR: page loads, password change works
- Log in as new user (admin-created, `mustChangePassword: true`): immediately redirected to `/settings/account` before any other navigation; after changing password, can navigate normally
- Log in as ADMIN: all tabs and routes visible; User Management page accessible and functional

---

## File Inventory

| File | Action | Wave |
|------|--------|------|
| `cloud/packages/db/prisma/schema.prisma` | Edit: add `UserRole` enum + `role` + `mustChangePassword` fields | 1 |
| New prisma migration | Create | 1 |
| `cloud/apps/api/src/auth/types.ts` | Edit: add `role`, `mustChangePassword` to `AuthUser` | 2 |
| `cloud/apps/api/src/auth/middleware.ts` | Edit: JWT decode role; API key role fetch | 2 |
| `cloud/apps/api/src/routes/auth.ts` (login endpoint) | Edit: add `role` + `mustChangePassword` to JWT payload AND login response body | 2 |
| `cloud/apps/api/src/auth/require-admin.ts` | Create: `requireAdmin()` + `requireAdminRest()` helpers | 2 |
| `cloud/apps/api/src/graphql/context.ts` | Verify: `ForbiddenError` import available | 2 |
| `cloud/apps/api/src/routes/auth.ts` | Edit: 12-char min; mustChangePassword clear + fresh JWT | 3 |
| `cloud/apps/api/src/cli/create-user.ts` | Edit: `--role` arg; 12-char min | 3 |
| `cloud/apps/api/src/graphql/mutations/api-key.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/run/summarization.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/run/maintenance.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/run/recovery.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/analysis.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/domain/evaluation.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/queue.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/definition.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/definition-tags.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/llm.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/preamble.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/level-preset.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/tag.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/value-statement.ts` | Edit: add `requireAdmin(ctx)` | 4 |
| `cloud/apps/api/src/graphql/mutations/user.ts` | Create: `createUser`, `updateUserRole`, `listUsers` | 4 |
| `cloud/apps/api/src/routes/import.ts` | Edit: apply `requireAdminRest` middleware | 4 |
| `cloud/apps/api/src/mcp/tools/create-definition.ts` | Edit: add role check → FORBIDDEN for VISITOR | 4 |
| `cloud/apps/api/src/mcp/tools/update-llm-model.ts` | Edit: add role check → FORBIDDEN for VISITOR | 4 |
| `cloud/apps/api/src/mcp/tools/reactivate-llm-model.ts` | Edit: add role check → FORBIDDEN for VISITOR | 4 |
| `cloud/apps/api/src/mcp/tools/set-summarization-parallelism.ts` | Edit: add role check → FORBIDDEN for VISITOR | 4 |
| `cloud/apps/api/src/mcp/tools/trigger-recovery.ts` | Edit: add role check → FORBIDDEN for VISITOR | 4 |
| `cloud/apps/api/src/mcp/tools/add-tags-to-definitions.ts` | Edit: add role check → FORBIDDEN for VISITOR | 4 |
| `cloud/apps/web/src/auth/context.tsx` | Edit: update AuthProvider + user shape; add token-update mechanism | 5 |
| `cloud/apps/web/src/types/index.ts` | Edit: add `role`, `mustChangePassword` to User type | 5 |
| `cloud/apps/web/src/hooks/useAuth.ts` | Edit: expose `role`, `mustChangePassword` from auth context | 5 |
| `cloud/apps/web/src/components/ProtectedRoute.tsx` | Edit: add `requiredRole` prop | 5 |
| `cloud/apps/web/src/App.tsx` | Edit: admin-only route wrappers; mustChangePassword guard | 5 |
| `cloud/apps/web/src/components/layout/NavTabs.tsx` | Edit: role-conditional nav items | 5 |
| `cloud/apps/web/src/pages/SettingsUsers.tsx` | Create: User Management page | 5 |
| `cloud/apps/web/src/api/operations/user.ts` | Create: `listUsers`, `createUser`, `updateUserRole` GQL ops | 5 |
| `cloud/apps/web/src/components/settings/AccountPanel.tsx` | Edit: handle fresh JWT on password change; mustChangePassword banner | 5 |

---

## Checkpoint Boundaries

The waves are the natural checkpoint boundaries. Each wave is independently committable:

```
[CHECKPOINT] Wave 1: DB schema + migration
[CHECKPOINT] Wave 2: Auth layer
[CHECKPOINT] Wave 3: Password service
[CHECKPOINT] Wave 4: GraphQL enforcement + new operations
[CHECKPOINT] Wave 5: Web UI
```

Wave 4 is the largest and could be split further: Wave 4a (add `requireAdmin` to existing mutations) and Wave 4b (new `user.ts` mutations + import route). The boundary is the stable `requireAdmin()` function from Wave 2.

---

## Parallelization Opportunities

| Parallel work | Files | Safe? |
|--------------|-------|-------|
| Wave 4a (add requireAdmin to existing mutations) | Mutations directory | Yes — each file is independent |
| Wave 5 UI | Web files | Yes — no overlap with API |
| Wave 4a and Wave 5 | API mutations + Web | Yes IF `requireAdmin()` (Wave 2) is committed first |

Do **not** parallelize:
- Wave 1 and Wave 2 (Wave 2 depends on the new schema types)
- Wave 4b and Wave 5 (Wave 5 GraphQL operations depend on Wave 4b schema)

---

## Risk Callouts

### Risk 1: Missing mutations from the enforcement list
**Probability:** Medium. The mutation inventory was compiled from a manual scan. A new mutation added after the scan could be missed.
**Mitigation (grep):** After Wave 4, run `grep -rn "Mutation" cloud/apps/api/src/graphql/mutations/ | grep -v requireAdmin` — result should be empty.
**Mitigation (schema-aware integration test):** Write an integration test in Wave 4 that uses GraphQL introspection to enumerate all mutations in the schema, then calls each one as a VISITOR and asserts a FORBIDDEN error. This test runs on every CI pass, making any future unprotected mutation visible immediately. The explicit allowlist in the test is `[]` (no Visitor-callable GraphQL mutations — `changePassword` is REST, not GraphQL). This test is the durable security gate; the grep check is a belt-and-suspenders check for the initial implementation.
**Verification:** Run the schema-aware integration test in the Wave 4 diff review.

### Risk 2: JWT format change breaks existing sessions
**Probability:** Low. The JWT payload is being extended (not changed). The decoder must handle tokens without `role` (default to ADMIN). Risk is if the decoder is strict about unknown fields.
**Verification:** Decode a pre-migration JWT (captured from a test session before Wave 2 is deployed) through the updated middleware and verify `req.user.role === 'ADMIN'`. This can be done in the auth middleware unit tests by creating a JWT with the old payload shape.

### Risk 2b: JWT test helper may not exist
**Probability:** Unknown. The auth unit tests in Wave 2 need to sign JWTs with specific payloads (no role, visitor role, pre-migration shape). Check `cloud/apps/api/src/auth/__tests__/` for an existing helper.
**Mitigation:** If no JWT-signing helper exists for tests, create one in Wave 2 as part of the auth unit test setup. It's a thin wrapper around the same `jsonwebtoken.sign` function used in middleware — no external dependency.
**Verification:** Auth unit tests pass in the Wave 2 diff review.

### Risk 3: `ForbiddenError` is not in `@valuerank/shared`
**Probability:** Low. The codebase uses `AppError`, `NotFoundError`, `ValidationError` from shared. `ForbiddenError` may not exist yet.
**Mitigation:** Check `cloud/packages/shared/src/` before Wave 2. If absent, add it — it's a one-liner extending `AppError`. Do not use a generic `Error`.
**Verification:** Run `grep -r "ForbiddenError" cloud/packages/shared/src/` before starting Wave 2. If not found, add it.

### Risk 4: `updateUserRole` SERIALIZABLE isolation support
**Probability:** Low. Prisma supports `$transaction` with isolation levels in PostgreSQL. PgBouncer with `pgbouncer=true` in `DATABASE_URL` may prevent SERIALIZABLE transactions if it uses transaction mode.
**Verification:** Check `DATABASE_URL` environment: if `?pgbouncer=true` is set, confirm PgBouncer is in session pooling mode (not transaction mode) before using SERIALIZABLE. If transaction mode is used, fall back to an optimistic lock pattern (re-read and compare after write). Verify by testing `$transaction({ isolationLevel: 'Serializable' })` in the integration test suite.

### Risk 5: AccountPanel stores JWT token correctly
**Probability:** Medium. The web app currently doesn't need to update the JWT mid-session. The auth context may store the JWT in state or localStorage, but the mechanism for updating it is untested.
**Verification:** Before writing Wave 5, read `cloud/apps/web/src/hooks/useAuth.ts` to confirm how the JWT is stored and find the token update mechanism. If no such mechanism exists, plan to add one in Wave 5 (e.g., a `setToken` callback on the auth context).

---

## Residual Risks

- **Stale JWT role (24h window):** Accepted V1 limitation. A demoted Admin retains write access for up to 24 hours. Bounded by JWT TTL. The admin UI shows a notice on role change. **Verification:** Manually test that a demoted-user's old JWT still works for one write mutation (expected behavior); verify they cannot after re-login. This confirms the system is working as designed, not as a bug.

- **Admin read endpoints not role-gated:** The GraphQL read queries for settings data (LLM models, infrastructure) are not role-restricted on the server. A Visitor with API access can read this configuration data. Accepted by design — this data is configuration metadata, not credentials. **Verification:** Confirm the data returned by `llmModels` and `systemSettings` queries contains no secrets (API keys, tokens, passwords) before shipping. Run `graphql_query` against the prod API to sample the response.

- **PgBouncer transaction mode may block SERIALIZABLE:** Documented in Risk 4 above. **Verification:** see Risk 4.
