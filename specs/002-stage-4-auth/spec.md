# Stage 4: Authentication System

> Part of [High-Level Implementation Plan](../high-level.md)
>
> Must adhere to [Project Constitution](../../CLAUDE.md)
>
> Design reference: [Authentication Documentation](../../docs/authentication.md)

**Goal:** Implement simple JWT-based auth for web and API key auth for MCP/programmatic access.

---

## Deliverables Summary

| Deliverable | Description |
|-------------|-------------|
| User registration CLI | `npm run create-user` command for invite-only user creation |
| Login endpoint | `POST /api/auth/login` returning JWT token |
| JWT middleware | Validates Bearer tokens for protected routes |
| API key generation | Create/list/revoke API keys for MCP access |
| API key validation | `X-API-Key` header authentication |
| Combined auth middleware | Accepts either JWT or API key for GraphQL |
| Password hashing | bcrypt with cost factor 12 |
| GraphQL auth context | User info available in resolver context |

---

## User Scenarios & Testing

### User Story 1 - Create User via CLI (Priority: P1)

As an administrator, I need to create user accounts via CLI so that team members can access the system without public registration.

**Why this priority**: User creation is the foundation - without users, no authentication can happen. Invite-only model is core to the internal team security model.

**Independent Test**: Run CLI command and verify user exists in database with hashed password.

**Acceptance Scenarios**:

1. **Given** valid email and password, **When** running `npm run create-user`, **Then** user created with bcrypt-hashed password
2. **Given** existing email, **When** creating user, **Then** clear error message about duplicate email
3. **Given** password less than 8 characters, **When** creating, **Then** validation error returned
4. **Given** invalid email format, **When** creating, **Then** validation error returned
5. **Given** successful creation, **When** querying database, **Then** password_hash is bcrypt format (starts with `$2b$`)

---

### User Story 2 - Login with Email/Password (Priority: P1)

As a user, I need to login with my email and password so that I can access the web frontend.

**Why this priority**: Login is the entry point for all web interactions. Without login, the frontend is unusable.

**Independent Test**: POST to login endpoint with valid credentials and verify JWT returned.

**Acceptance Scenarios**:

1. **Given** valid email and password, **When** calling `POST /api/auth/login`, **Then** JWT token returned with user info
2. **Given** invalid password, **When** logging in, **Then** 401 Unauthorized (generic message, no email hint)
3. **Given** non-existent email, **When** logging in, **Then** 401 Unauthorized (same message as invalid password)
4. **Given** successful login, **When** decoding JWT, **Then** contains `sub` (user ID), `email`, `iat`, `exp`
5. **Given** JWT returned, **When** checking expiry, **Then** expires in 24 hours from issue time
6. **Given** successful login, **When** checking database, **Then** `last_login_at` updated on user record

---

### User Story 3 - Access Protected GraphQL Routes (Priority: P1)

As a user, I need my JWT token to be validated on GraphQL requests so that only authenticated users can query/mutate data.

**Why this priority**: Without auth middleware, all data is publicly accessible. This is the core security boundary.

**Independent Test**: Make GraphQL request with valid/invalid/missing token and verify appropriate responses.

**Acceptance Scenarios**:

1. **Given** valid JWT in Authorization header, **When** making GraphQL request, **Then** request succeeds and user available in context
2. **Given** expired JWT, **When** making GraphQL request, **Then** 401 Unauthorized with "Token expired" message
3. **Given** malformed JWT, **When** making GraphQL request, **Then** 401 Unauthorized with "Invalid token" message
4. **Given** no Authorization header, **When** making GraphQL request, **Then** 401 Unauthorized with "No token provided" message
5. **Given** valid token, **When** accessing context.user in resolver, **Then** user ID and email available

---

### User Story 4 - Create API Key for MCP (Priority: P1)

As a user, I need to generate API keys so that I can connect local AI tools (Claude Desktop, Cursor) via MCP.

**Why this priority**: API keys enable the MCP integration which is a core product feature for AI-assisted experimentation.

**Independent Test**: Authenticated request to create API key returns key once, then only prefix visible in list.

**Acceptance Scenarios**:

1. **Given** authenticated user, **When** calling create API key mutation, **Then** full key returned (32+ chars, `vr_` prefix)
2. **Given** API key created, **When** key returned, **Then** this is the ONLY time full key is shown
3. **Given** API key created, **When** stored in database, **Then** only SHA-256 hash stored (not plaintext)
4. **Given** API key with name "Claude Desktop", **When** listing keys, **Then** name and key_prefix (e.g., `vr_abc123`) shown
5. **Given** existing API keys, **When** listing via query, **Then** all user's keys returned with creation date

---

### User Story 5 - Authenticate via API Key (Priority: P1)

As an MCP client, I need to authenticate using an API key so that I can access GraphQL without a JWT.

**Why this priority**: MCP clients can't do browser-based login. API keys are the only auth mechanism for programmatic access.

**Independent Test**: Make GraphQL request with valid X-API-Key header and verify access granted.

**Acceptance Scenarios**:

1. **Given** valid API key in `X-API-Key` header, **When** making GraphQL request, **Then** request succeeds
2. **Given** valid API key, **When** authenticating, **Then** `last_used_at` updated on API key record
3. **Given** invalid API key, **When** making request, **Then** 401 Unauthorized
4. **Given** expired API key (if expiry set), **When** making request, **Then** 401 Unauthorized with "Key expired" message
5. **Given** API key auth, **When** accessing context.user, **Then** associated user ID available

---

### User Story 6 - Revoke API Key (Priority: P2)

As a user, I need to revoke API keys so that I can disable compromised or unused keys.

**Why this priority**: Security hygiene feature. Important but not blocking for initial functionality.

**Independent Test**: Revoke a key and verify it no longer authenticates.

**Acceptance Scenarios**:

1. **Given** existing API key, **When** calling revoke mutation, **Then** key deleted from database
2. **Given** revoked key, **When** attempting to authenticate, **Then** 401 Unauthorized
3. **Given** key ID belonging to another user, **When** attempting to revoke, **Then** NotFoundError (no hint about other user's keys)
4. **Given** non-existent key ID, **When** revoking, **Then** NotFoundError

---

### User Story 7 - Get Current User Info (Priority: P2)

As a frontend, I need to fetch the current user's info so that I can display their email and manage session state.

**Why this priority**: Needed for frontend UX but not blocking for core auth flow.

**Independent Test**: Query `me` with valid token and verify user info returned.

**Acceptance Scenarios**:

1. **Given** valid JWT, **When** querying `me`, **Then** user id, email, name returned
2. **Given** API key auth, **When** querying `me`, **Then** associated user info returned
3. **Given** unauthenticated request, **When** querying `me`, **Then** 401 Unauthorized

---

### User Story 8 - Rate Limiting on Login (Priority: P3)

As a system, I need to rate limit login attempts so that brute force attacks are mitigated.

**Why this priority**: Security hardening. Lower priority for internal tool with trusted users, but good practice.

**Independent Test**: Make 11 login attempts in 15 minutes and verify rate limit triggered.

**Acceptance Scenarios**:

1. **Given** 10 login attempts in 15 minutes, **When** making 11th attempt, **Then** 429 Too Many Requests
2. **Given** rate limited, **When** waiting 15 minutes, **Then** can attempt login again
3. **Given** successful login, **When** counting attempts, **Then** successful logins also count toward limit

---

## Edge Cases

- **Case-insensitive email**: `User@Example.com` and `user@example.com` should be treated as same user
- **JWT secret rotation**: System should handle gracefully (future consideration, document but don't implement)
- **Concurrent login**: Multiple simultaneous logins should all succeed
- **Token in multiple formats**: Accept `Bearer <token>` or just `<token>` in Authorization header
- **Empty API key name**: Should require non-empty name for API keys
- **API key with special characters**: Name should allow any UTF-8 characters
- **Clock skew**: JWT validation should allow small clock skew (±30 seconds)
- **User deletion**: Cascading delete of API keys when user deleted (already in Prisma schema)
- **Whitespace in password**: Allow but don't trim (passwords are literal)
- **Very long passwords**: Accept up to 72 bytes (bcrypt limit)
- **Simultaneous API key creation**: Multiple keys created in parallel should all succeed
- **GraphQL introspection**: Should work without authentication (needed for schema discovery)
- **Health endpoints**: `/health` should remain unauthenticated

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide `npm run create-user` CLI command for user creation
- **FR-002**: System MUST hash passwords using bcrypt with cost factor 12
- **FR-003**: System MUST expose `POST /api/auth/login` endpoint accepting email/password
- **FR-004**: System MUST return JWT token on successful login with 24-hour expiry
- **FR-005**: System MUST update `last_login_at` on successful login
- **FR-006**: System MUST validate JWT tokens on protected routes via `Authorization: Bearer <token>` header
- **FR-007**: System MUST provide GraphQL mutation `createApiKey` returning plaintext key once
- **FR-008**: System MUST store API key hashes (SHA-256), never plaintext
- **FR-009**: System MUST generate API keys with `vr_` prefix and 32+ random characters
- **FR-010**: System MUST validate API keys via `X-API-Key` header
- **FR-011**: System MUST update `last_used_at` on successful API key authentication
- **FR-012**: System MUST provide GraphQL mutation `revokeApiKey` to delete keys
- **FR-013**: System MUST provide GraphQL query `apiKeys` listing user's keys (prefix only)
- **FR-014**: System MUST provide GraphQL query `me` returning current user info
- **FR-015**: System MUST reject requests with expired tokens with 401 status
- **FR-016**: Auth middleware MUST accept either JWT or API key (combined auth)
- **FR-017**: System SHOULD implement rate limiting on login endpoint (10 attempts/15 min)
- **FR-018**: Password validation MUST require minimum 8 characters
- **FR-019**: Health endpoints (`/health`, `/ready`) MUST remain unauthenticated
- **FR-020**: GraphQL introspection MUST remain accessible without authentication

### Non-Functional Requirements

- **NFR-001**: Login endpoint MUST respond within 500ms under normal load
- **NFR-002**: JWT validation MUST add less than 5ms to request processing
- **NFR-003**: All auth errors MUST be logged with request context (per CLAUDE.md)
- **NFR-004**: No `any` types in auth code (per CLAUDE.md)
- **NFR-005**: Auth services MUST have 80%+ test coverage (per CLAUDE.md)
- **NFR-006**: Auth files MUST be under 400 lines each (per CLAUDE.md)

---

## Success Criteria

- **SC-001**: User can be created via CLI and log in successfully
- **SC-002**: GraphQL requests without valid auth receive 401 Unauthorized
- **SC-003**: GraphQL requests with valid JWT succeed and have user in context
- **SC-004**: API keys can be created, listed (prefix only), and revoked via GraphQL
- **SC-005**: GraphQL requests with valid API key succeed (same as JWT)
- **SC-006**: Passwords are never stored in plaintext (bcrypt hashes only)
- **SC-007**: API keys are never stored in plaintext (SHA-256 hashes only)
- **SC-008**: 80%+ test coverage on auth middleware and services
- **SC-009**: Login fails after 10 attempts within 15 minutes (rate limiting)
- **SC-010**: All existing GraphQL queries/mutations require authentication

---

## Key Entities

### JWT Token Structure

```typescript
{
  sub: string;     // User ID (cuid)
  email: string;   // User email
  iat: number;     // Issued at (Unix timestamp)
  exp: number;     // Expiry (24h from iat)
}
```

### API Key Format

```
vr_[32 random alphanumeric characters]
Example: vr_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### Auth Context

```typescript
interface AuthContext {
  user: {
    id: string;
    email: string;
  } | null;
  authMethod: 'jwt' | 'api_key' | null;
}
```

---

## Assumptions

1. **No refresh tokens initially**: 24-hour JWT expiry is acceptable for internal tool (user re-logs in daily)
2. **No password reset flow**: Handled manually via CLI for internal team
3. **No session management UI**: Use CLI for user management
4. **Single tenant**: All authenticated users see all data (no row-level security)
5. **Email uniqueness is case-insensitive**: Normalized to lowercase before storage
6. **No OAuth/SSO**: Simple email/password sufficient for internal team
7. **Environment variable for JWT secret**: `JWT_SECRET` must be set in environment

---

## Constitution Compliance

**Status**: PASS

Validated against [CLAUDE.md](../../CLAUDE.md):

| Requirement | Implementation |
|-------------|----------------|
| **No `any` Types** | All auth types explicitly defined; NFR-004 |
| **TypeScript Strict Mode** | Auth code compiles under strict mode |
| **Test Coverage 80%** | Auth services and middleware have unit tests; NFR-005 |
| **No console.log** | All logging via createLogger; NFR-003 |
| **File Size < 400 lines** | Auth split into auth/middleware, auth/services, auth/cli; NFR-006 |
| **Structured Logging** | Log auth events with userId, method, outcome |
| **Custom Error Classes** | AuthenticationError, InvalidCredentialsError extend AppError |
| **Prisma Transactions** | Not needed (single-row operations) |

---

## Dependencies

- **Stage 1** (complete): Express server, logging, error handling
- **Stage 2** (complete): Prisma schema with User and ApiKey models
- **Stage 3** (complete): GraphQL API with Pothos, context, and resolver patterns

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| OAuth (Google, GitHub) | Overkill for internal team |
| Role-based permissions | All users are equal (per design doc) |
| Fine-grained API key scopes | Not needed for internal tool |
| Public registration | Invite-only model |
| Password reset flow | Manual CLI process for internal team |
| Multi-tenancy | Single shared workspace |
| Session management UI | CLI-based user management |
| Refresh tokens | 24-hour JWT expiry acceptable initially |

---

## Next Steps

1. Review this spec for accuracy
2. When ready for technical planning, invoke the **feature-plan** skill
3. Or ask clarifying questions if requirements need refinement
