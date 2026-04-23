# Spec: Visitor Role — Read-Only Access Control with Admin User Management

**Slug:** visitor-role-access-control
**Created:** 2026-04-21
**Status:** draft
**Input:** Add a Visitor account type that is read-only. Admins can create and manage user accounts and assign roles.

---

## Background

Today every authenticated ValueRank user has full admin access — there is no role system. This feature adds a two-tier role system (ADMIN / VISITOR). Visitors can view and export all data but cannot create content, start probes, manage settings, or access restricted tabs. Enforcement is server-side so UI bypass is not possible.

---

## Assumptions

1. Two roles only: ADMIN (current behavior) and VISITOR (new restricted tier). No intermediate tier in scope.
2. All existing users default to ADMIN on migration — no disruption to current behavior.
3. Visitors can view all analysis and reports, export data (CSV/Excel), and change their own password.
4. Visitors cannot: create domains, vignettes, or definitions; start/pause/cancel/delete runs; create API keys; import data; access Archive, Settings (non-account), or Domains Manage.
5. Role enforcement is at the API level (JWT payload + GraphQL resolver checks + REST middleware). UI restrictions are an additional layer, not the primary enforcement point.
6. When a user's role changes, their existing JWTs carry the old role until they expire (acceptable V1 limitation; users get the updated role on next login).

---

## Non-Goals

- OAuth / SSO integration
- Fine-grained per-resource permissions beyond the ADMIN / VISITOR binary
- Visitor-specific rate limiting
- Email-based user invitation flow (admin sets the initial password directly)
- Real-time JWT revocation on role change (accepted V1 limitation — see Edge Cases)
- Server-side enforcement of `mustChangePassword` — it is a web-only UX redirect, not a data-protection gate (V1 limitation — see Edge Cases)

---

## Access Matrix

| Feature | Admin | Visitor |
|---------|:-----:|:-------:|
| View vignette library | ✓ | ✓ |
| Create / edit / delete vignettes | ✓ | ✗ |
| View runs and analysis | ✓ | ✓ |
| Start / pause / cancel / delete runs | ✓ | ✗ |
| Export data (CSV / Excel) | ✓ | ✓ |
| Import data | ✓ | ✗ |
| View domains overview + analysis | ✓ | ✓ |
| Create / manage domains | ✓ | ✗ |
| View Archive tab | ✓ | ✗ |
| View Settings (all) | ✓ | Account page only |
| Manage preambles / level presets | ✓ | ✗ |
| Create API keys | ✓ | ✗ |
| Manage LLM models / infrastructure | ✓ | ✗ |
| User management | ✓ | ✗ |
| Change own password | ✓ | ✓ |

---

## User Stories

### User Story 1 — Server-Side Role Enforcement (Priority: P1)

As a platform admin, I need all Visitor restrictions to be enforced at the API level so that bypassing the web UI does not grant unauthorized access.

**Why this priority:** Without server-side enforcement, all UI restrictions are cosmetic. A Visitor with technical knowledge could call GraphQL mutations directly or hit REST endpoints with their credentials. Server-side enforcement is the foundation everything else rests on.

**Independent Test:** Log in as a Visitor. Use a GraphQL client (e.g., curl or GraphiQL) to call a restricted mutation (`startRun`, `createDefinition`, `createApiKey`). Verify the API returns a FORBIDDEN error (HTTP 200 with GraphQL error code `FORBIDDEN`, or HTTP 403 for REST). Verify the same user calling a read query succeeds.

**Acceptance Scenarios:**

1. **Given** a Visitor-role JWT, **When** the client calls any write mutation (`startRun`, `createDefinition`, `createLlmModel`, `createApiKey`, `runTrialsForDomain`, etc.), **Then** the API returns a GraphQL error with code `FORBIDDEN` and does not execute the mutation.
2. **Given** a Visitor-role JWT, **When** the client calls `POST /api/import`, **Then** the API returns HTTP 403.
3. **Given** a Visitor-role JWT, **When** the client calls `GET /api/export` or any non-admin-gated GraphQL read query (e.g., `definitions`, `runs`), **Then** the API returns the requested data normally. Admin-only read queries (e.g., `listUsers`) still return FORBIDDEN. Note: `llmModels` and other admin configuration queries are read-only and not admin-gated server-side; access to their data (model configs, infra settings) is an accepted design choice documented in Residual Risks (no credentials are exposed).
4. **Given** an Admin-role JWT, **When** the client calls any mutation, **Then** the mutation executes normally (no regression).

---

### User Story 2 — Admin User Management UI (Priority: P1)

As an admin, I need a user management page where I can list all users, create new accounts, and assign roles so that I can onboard Visitors without DB access.

**Why this priority:** Without a management UI, the only way to create a Visitor account or change roles is direct DB manipulation. This is a blocker for using the feature in production.

**Independent Test:** Log in as an Admin. Navigate to the new User Management page (under Settings). Create a new user with email, name, password, and role=VISITOR. Verify the new user appears in the list. Log in as the new user — the app redirects immediately to `/settings/account` (forced password change on first login). Complete the password change. After completing it, confirm Visitor restrictions apply: Archive tab absent, write actions hidden. Return to the Admin session, change the user's role to ADMIN, then log in as that user again and confirm they see the full admin UI.

**Acceptance Scenarios:**

1. **Given** an Admin user, **When** they visit the User Management page, **Then** they see a table of all users (name, email, role, last login date, created date).
2. **Given** an Admin user on the User Management page, **When** they submit the "Create User" form with a valid email, name, password, and role, **Then** a new account is created and appears in the list.
3. **Given** an Admin user, **When** they change an existing user's role and the target user logs in again, **Then** the target user's new role is in effect.
4. **Given** a Visitor-role JWT, **When** the client tries to access the User Management page URL or its API, **Then** the page redirects them and the API returns FORBIDDEN.
5. **Given** an Admin submitting "Create User" with a duplicate email, **When** the form is submitted, **Then** a clear validation error is shown and no duplicate account is created.

---

### User Story 3 — Visitor Navigation and Route Guards (Priority: P1)

As a Visitor, I see only the tabs and pages relevant to my read-only role, and direct URL access to restricted pages redirects me cleanly.

**Why this priority:** Without route guards, a Visitor navigating to `/domains/manage` or `/settings/models` would land on a broken or full-access page. Both UX and security require clean guarding.

**Independent Test:** Log in as a Visitor. Verify: Archive tab not in nav, Settings tab not in nav (only `/settings/account` accessible), Domains nav shows Overview and Analysis but not Manage. Manually navigate to `/archive`, `/domains/manage`, `/settings/models`, `/settings/api-keys`, `/settings/infrastructure`, `/preambles`, `/level-presets`. Verify each redirects to `/` — no blank screens, no "not authorized" page, no JS errors.

**Acceptance Scenarios:**

1. **Given** a Visitor user, **When** they view the navigation, **Then** the Archive tab, Settings tab (except Account), and Domains > Manage Domains item are absent.
2. **Given** a Visitor user, **When** they navigate directly to `/archive` or any `/archive/*` URL, **Then** they are redirected to the home page.
3. **Given** a Visitor user, **When** they navigate directly to `/settings/system-health`, `/settings/models`, `/settings/infrastructure`, `/settings/api-keys`, `/preambles`, `/level-presets`, or `/domains/manage`, **Then** they are redirected to `/` (the home page).
4. **Given** a Visitor user, **When** they navigate to `/settings/account`, **Then** they can view and update their password normally.
5. **Given** an Admin user, **When** they view the navigation, **Then** all tabs and menu items are present (no regression).

---

### User Story 4 — Visitor Read Access to All Reports (Priority: P2)

As a Visitor, I can view all model analysis, circumplex charts, domain analysis, run results, and vignette library pages so I can consume the platform's insights.

**Why this priority:** This is the core value prop for Visitors. P2 because P1 stories (enforcement and management) are prerequisites.

**Independent Test:** Log in as a Visitor. Navigate to Models (Matrix, Consistency, Circumplex), Domains (Overview, Analysis), Vignettes (Library, Runs, Analysis). Verify all pages load and display data without errors. Verify no "create" or "start" buttons are shown.

**Acceptance Scenarios:**

1. **Given** a Visitor user, **When** they browse any read-only page (Models, Domains overview/analysis, Vignettes, Runs, Analysis), **Then** the page loads and displays data normally.
2. **Given** a Visitor user on a read-only page, **When** they view action buttons, **Then** buttons that trigger writes (Start Run, Create Vignette, etc.) are hidden (not merely disabled). See FR-021.

---

### User Story 5 — Visitor Data Export (Priority: P2)

As a Visitor, I can export data to CSV or Excel so I can perform offline analysis.

**Why this priority:** Export is a passive read operation and is explicitly in scope per product decisions. P2 because it depends on the enforcement layer from US1.

**Independent Test:** Log in as a Visitor. Trigger any CSV or Excel export from an analysis or results page. Verify the download completes successfully.

**Acceptance Scenarios:**

1. **Given** a Visitor user, **When** they request a CSV or Excel export, **Then** the download succeeds and contains the expected data.

---

### User Story 6 — Admin Role Change Takes Effect on Re-login (Priority: P3)

As an admin, when I change a user's role, I need the change to take effect on their next login so that access changes are predictable and low-latency.

**Why this priority:** Role changes during an active session are a nice-to-have. V1 accepts that existing JWTs carry the old role until expiry. This story tracks surfacing that behavior clearly in the UI.

**Independent Test:** Log in as a Visitor in one session. Change that user's role to Admin from the Admin's management page. Without logging out in the Visitor session, verify they still see Visitor-restricted UI. After logging out and back in, verify they see Admin UI.

**Acceptance Scenarios:**

1. **Given** a Visitor with an active session whose role was just changed to Admin, **When** they refresh without logging out, **Then** they still see Visitor-restricted UI (old JWT still valid).
2. **Given** the same user logs out and logs back in, **When** they complete login, **Then** their new JWT reflects the Admin role and they see the full admin UI.
3. **Given** the User Management page, **When** an admin changes a role, **Then** a notice reads "Role changes take effect on the user's next login."

---

## Functional Requirements

### Database & Auth Layer

- **FR-001:** The User model MUST include a `role` field of enum type `UserRole` with values `ADMIN` and `VISITOR`. Default value: `ADMIN`.
- **FR-002:** The Prisma migration MUST set `role = ADMIN` for all existing users (additive, no disruption).
- **FR-003:** The JWT payload MUST include the user's `role` so resolvers can check permissions without an additional DB query.
- **FR-004:** The `AuthUser` type MUST include a `role` field.
- **FR-005:** A `requireAdmin()` middleware helper MUST exist that returns FORBIDDEN if `context.user.role !== 'ADMIN'`. This is the primary enforcement primitive — used in resolvers and REST routes.
- **FR-005a:** The role-check architecture MUST be default-deny for write paths: any new mutation or REST write route MUST call `requireAdmin()` explicitly, with no role check being the exceptional case (read-only paths and the explicit Visitor exceptions below). This prevents unintentional bypass when new mutations are added.
- **FR-005b:** Tokens issued before the role field was added (i.e., tokens without a `role` claim) MUST be treated as ADMIN during the migration window, since FR-002 migrates all users to ADMIN. After the first login post-deploy, all tokens will carry the role claim.
- **FR-005c:** Visitor write exceptions — the following mutations are explicitly allowed for VISITOR users and MUST NOT call `requireAdmin()`: `changePassword` (own password only). All other mutations are admin-only per FR-005a.
- **FR-005d:** GraphQL read queries are Visitor-accessible by default. A read query is admin-only only if it explicitly calls `requireAdmin()` at the top of its resolver. In V1, the only admin-gated read query is `listUsers` (FR-012). New admin-only read queries MUST call `requireAdmin()` — the default is open access (reads are default-allow; writes are default-deny per FR-005a).

### API — Write Mutation Restrictions

- **FR-006:** All GraphQL mutations MUST call `requireAdmin()` at the start of their resolver, EXCEPT mutations explicitly listed in FR-005c (the Visitor exceptions). This default-deny approach means new mutations must also add `requireAdmin()`. The known admin-only mutations are: `startRun`, `pauseRun`, `resumeRun`, `cancelRun`, `deleteRun`, `recoverRun`, `triggerRecovery`, `createDefinition`, `updateDefinition`, `deleteDefinition`, `forkDefinition`, `addTagsToDefinitions`, `removeTagsFromDefinitions`, `createLlmModel`, `updateLlmModel`, `deprecateLlmModel`, `reactivateLlmModel`, `setDefaultLlmModel`, `setInfraModel`, `setSummarizationParallelism`, `cancelSummarization`, `restartSummarization`, `createApiKey`, `deleteApiKey`, `runTrialsForDomain`, `startDomainEvaluation`, `createPreamble`, `updatePreamble`, `deletePreamble`, `createLevelPreset`, `updateLevelPreset`, `deleteLevelPreset`, `createTag`, `updateTag`, `deleteTag`, `createValueStatement`, `updateValueStatement`, `createDomain`, `updateDomain`.
- **FR-006a:** FORBIDDEN responses from GraphQL mutations MUST be returned as a GraphQL error in the `errors` array (HTTP 200, error code `FORBIDDEN`) — not HTTP 403 — to conform to the GraphQL spec.
- **FR-007:** The `POST /api/import` REST endpoint MUST return HTTP 403 for VISITOR users.
- **FR-008:** The `GET /api/export` REST endpoint MUST remain accessible to VISITOR users. Export results MUST NOT include the user list, API key data, or any admin-configuration data — only evaluation data (runs, definitions, results, analysis).
- **FR-009:** The admin DB export endpoint (`/admin/db-export`) is unchanged — it uses IP + token auth and is not user-role-gated. This is an acceptable residual risk: the endpoint requires both IP allowlist and a separate bearer token, making it inaccessible from a Visitor session.
- **FR-009a:** Passwords MUST meet a minimum complexity of at least 12 characters. This rule MUST be enforced in a shared service-layer function called by both `createUser` and the existing `changePassword` mutation, ensuring the same policy applies everywhere a password is set.
- **FR-009b:** New users created via `createUser` MUST be flagged as requiring a password change on first login (`mustChangePassword: true` on the User record). The JWT issued on login MUST include the `mustChangePassword` flag. The web app MUST check this flag in a top-level route guard: if `mustChangePassword` is true, redirect to `/settings/account` before any other navigation. When `changePassword` succeeds and `mustChangePassword` was true for that user, the server MUST return a fresh JWT with `mustChangePassword: false` in the response — this is the only mechanism to clear the redirect loop without forcing logout. The route guard reads the flag from the current JWT, so updating the JWT in-place (same session) is required. The `changePassword` mutation in the `mustChangePassword` flow MUST still require the user's current (admin-set) password as input — no bypass is allowed. The admin communicates the temporary password to the user out-of-band.
- **FR-009c (Bootstrap path):** The existing CLI script at `cloud/apps/api/src/cli/` (the `create-user` command) MUST be updated to accept a `--role` argument defaulting to `ADMIN`. This is the bootstrap path for the very first admin account on a fresh deployment or after a DB reset — it operates outside the role check system. The spec does not add a new bootstrap mechanism; it extends the existing CLI.

### API — User Management

- **FR-010:** A new `createUser` GraphQL mutation MUST allow ADMIN users to create a new account with: `email` (unique), `name`, `password` (hashed), `role`.
- **FR-011:** A new `updateUserRole` GraphQL mutation MUST allow ADMIN users to change any user's role.
- **FR-012:** A new `listUsers` GraphQL query MUST return all users with: `id`, `email`, `name`, `role`, `lastLoginAt`, `createdAt`, `mustChangePassword`. Restricted to ADMIN users.
- **FR-013:** `createUser`, `updateUserRole`, and `listUsers` MUST return FORBIDDEN for VISITOR users.
- **FR-014:** Email addresses MUST be normalized to lowercase everywhere they are compared or stored. `createUser` MUST lowercase before storing. The login endpoint MUST lowercase the submitted email before the DB lookup so that a user created as `alice@example.com` can log in with `Alice@example.com`. The existing DB unique constraint on `email` enforces concurrent-safe uniqueness. Return a clear validation error on conflict.
- **FR-014a:** The REST write endpoints needing role gating are: `POST /api/import`. All other existing REST routes are read-only or use separate auth mechanisms (API keys + Basic auth for OData). If new REST write routes are added, they MUST add `requireAdmin()` middleware per the default-deny approach in FR-005a.
- **FR-014b:** MCP write tools MUST enforce role access. The MCP server at `cloud/apps/api/src/mcp/tools/` includes write-capable tools (e.g., `create-definition`, `update-llm-model`, `set-summarization-parallelism`, `trigger-recovery`, `add-tags-to-definitions`). Before implementation, audit `cloud/apps/api/src/mcp/` to determine how the calling user's identity and role are resolved in MCP tool handlers. All MCP write tools MUST check the resolved user's role and return a FORBIDDEN error for VISITOR users. If MCP tools use a server-level credential not tied to individual users, document this explicitly and verify that VISITOR users cannot obtain those credentials.

### Web — Navigation

- **FR-015:** The Archive tab MUST NOT render for VISITOR users.
- **FR-016:** The Settings tab MUST NOT render for VISITOR users. The `/settings/account` route MUST remain accessible to VISITOR users via direct navigation.
- **FR-017:** The "Manage Domains" menu item MUST NOT render for VISITOR users.
- **FR-018:** A new "User Management" entry MUST appear in the Settings menu for ADMIN users only.

### Web — Route Guards

- **FR-019:** A role-aware `ProtectedRoute` wrapper MUST redirect VISITOR users away from all restricted path prefixes using wildcard matching: `/archive` and all sub-paths, `/settings/system-health` and all sub-paths, `/settings/models` and all sub-paths, `/settings/infrastructure` and all sub-paths, `/settings/api-keys` and all sub-paths, `/settings/users` and all sub-paths, `/preambles` and all sub-paths, `/level-presets` and all sub-paths, `/domains/manage` and all sub-paths. New child routes under these prefixes are automatically covered.
- **FR-020:** The redirect target for unauthorized routes MUST be the home page (`/`).
- **FR-021:** The VISITOR-restricted action buttons (Start Run, Create Vignette, Create Domain, etc.) MUST be hidden (not merely disabled) on pages that are otherwise visible to Visitors. Hidden is preferred over disabled: it declutters the UI and eliminates any incentive for client-side manipulation.

### Web — User Management Page

- **FR-022:** A new `/settings/users` page MUST list all users in a table with columns: Name, Email, Role, Last Login, Created.
- **FR-023:** The page MUST include a "Create User" form with fields: Name, Email, Password, Role (dropdown: Admin / Visitor).
- **FR-024:** The page MUST include an inline role editor per user row (dropdown or button) that calls `updateUserRole`.
- **FR-025:** A notice MUST appear on role change: "Role changes take effect on the user's next login."

---

## Success Criteria

- **SC-001:** A Visitor-role user cannot successfully execute any write mutation or access any restricted REST endpoint when calling the API directly (not via UI) — verified by integration tests.
- **SC-002:** All existing Admin-role user workflows continue to work without regression — verified by existing test suite passing.
- **SC-003:** An admin can create a new Visitor account end-to-end via the UI in under 2 minutes.
- **SC-004:** A Visitor navigating directly to any restricted URL is redirected within one render cycle — no flash of restricted content.
- **SC-005:** The migration sets `role = ADMIN` for all existing users with zero downtime (additive schema change).

---

## Edge Cases

- **Last Admin protection:** `updateUserRole` MUST check-and-update atomically (within a Prisma `$transaction` with `SERIALIZABLE` isolation) that at least one ADMIN remains after the change, regardless of whose role is being changed (including self-demotion). If the change would leave zero Admins, return a validation error. The SERIALIZABLE isolation level ensures concurrent role changes that race to remove the last Admin will fail the transaction rather than succeed silently.
- **JWT stale role:** After any role change (promotion or demotion), the existing session JWT carries the old role. Restrictions do not change until the next login. This applies both ways: a demoted Admin retains write access for up to 24h (the JWT TTL), and a promoted Visitor cannot access admin features until they re-login. This is a known V1 limitation. The User Management page MUST display a notice on each role change: "Role changes take effect on the user's next login." Real-time revocation is a non-goal for V1.
- **API key auth with Visitor role:** API key authentication MUST also include the user's role (fetched from DB at auth time, since API keys don't carry a payload). The insertion point is `cloud/apps/api/src/auth/middleware.ts` in the API key auth branch — after the key is validated and the owning user is resolved, the user's `role` MUST be attached to `req.user`. The same `requireAdmin()` check in each resolver then covers both JWT and API key requests uniformly.
- **Create User with existing email:** Must return a clear error, not a DB constraint crash.
- **Visitor on a page with mixed actions:** Pages visible to Visitors (e.g., Runs list) that contain "Start Run" buttons must hide or disable those buttons — not show a broken partial UI.
- **Empty user list:** User management table should show an empty-state message if no users exist (edge case during DB reset).
- **`mustChangePassword` API bypass (V1 limitation):** The `mustChangePassword` flag is enforced only by the web route guard. A user with `mustChangePassword: true` can still call the API directly (GraphQL or REST) using their JWT before changing their password. This is an accepted V1 behavior — the flag is a UX mechanism to guide new users through the password change flow, not a data-protection control. All API-level access control is governed by the `role` field only. Server-side enforcement of `mustChangePassword` is a non-goal for V1.

---

## Key Entities

### `UserRole` enum (new)

```
ADMIN   — full access (default for all existing users)
VISITOR — read-only access
```

### `User` model additions

```
role:               UserRole  @default(ADMIN)
mustChangePassword: Boolean   @default(false)
```

Note: `lastLoginAt` already exists on the User model (`last_login_at` column). No new field needed for FR-012.

### `AuthUser` additions

```typescript
role: 'ADMIN' | 'VISITOR'
mustChangePassword: boolean
```

### New GraphQL operations

| Operation | Type | Description |
|-----------|------|-------------|
| `listUsers` | Query | Returns all users; Admin only |
| `createUser` | Mutation | Creates a new user with role; Admin only |
| `updateUserRole` | Mutation | Changes a user's role; Admin only |

**`listUsers` return type** (`UserSummary[]`):
```
id: String
email: String
name: String?
role: UserRole   (ADMIN | VISITOR)
lastLoginAt: DateTime?
createdAt: DateTime
mustChangePassword: Boolean
```

**`createUser` input**:
```
email: String   (required, unique)
name: String    (required)
password: String (required, min 12 chars — enforced server-side)
role: UserRole   (required: ADMIN | VISITOR)
```
**`createUser` return**: `UserSummary` (the newly created user, without passwordHash)

**`updateUserRole` input**:
```
userId: String  (required)
role: UserRole  (required: ADMIN | VISITOR)
```
**`updateUserRole` return**: `UserSummary` (the updated user)
