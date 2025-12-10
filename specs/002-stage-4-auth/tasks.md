# Tasks: Stage 4 - Authentication System

**Prerequisites**: plan.md, spec.md, contracts/auth-schema.graphql

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[US#]**: User story label (for story phases only)
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and initialize project structure

- [X] T001 Add auth dependencies to `apps/api/package.json` (bcrypt, jsonwebtoken, express-rate-limit, @types/*)
- [X] T002 [P] Add JWT_SECRET to `.env.example` with documentation
- [X] T003 [P] Add JWT_SECRET validation to `apps/api/src/config.ts`

**Checkpoint**: Dependencies installed, environment configured

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

This phase creates the shared auth types, error classes, and service foundations that all user stories depend on.

- [X] T004 Create `packages/shared/src/errors.ts` - Add AuthenticationError class extending AppError (401 status)
- [X] T005 [P] Export AuthenticationError from `packages/shared/src/index.ts`
- [X] T006 [P] Create `apps/api/src/auth/types.ts` - JWT payload, auth context, login request/response types
- [X] T007 Create `apps/api/src/auth/services.ts` - Password hashing (bcrypt), JWT sign/verify utilities
- [X] T008 Create `apps/api/src/auth/api-keys.ts` - Key generation (vr_ prefix), hash generation (SHA-256)
- [X] T009 Create `apps/api/src/auth/index.ts` - Re-export public auth API

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Create User via CLI (Priority: P1)

**Goal**: Enable administrators to create user accounts via CLI command

**Independent Test**: Run `npm run create-user` and verify user exists in database with bcrypt-hashed password

### Implementation for User Story 1

- [X] T010 [US1] Create `apps/api/src/cli/create-user.ts` - CLI script with commander for user creation
- [X] T011 [US1] Add email validation (format check) in CLI
- [X] T012 [US1] Add password validation (min 8 chars) in CLI
- [X] T013 [US1] Implement duplicate email check in CLI
- [X] T014 [US1] Add `create-user` script to `apps/api/package.json`
- [X] T015 [US1] Write unit tests in `apps/api/tests/cli/create-user.test.ts`

**Checkpoint**: User Story 1 complete - users can be created via CLI

---

## Phase 4: User Story 2 - Login with Email/Password (Priority: P1)

**Goal**: Enable users to authenticate and receive JWT token

**Independent Test**: POST to `/api/auth/login` with valid credentials returns JWT token

### Implementation for User Story 2

- [X] T016 [US2] Create `apps/api/src/routes/auth.ts` - Express router for auth endpoints
- [X] T017 [US2] Implement POST `/api/auth/login` endpoint in routes/auth.ts
- [X] T018 [US2] Add case-insensitive email lookup (normalize to lowercase)
- [X] T019 [US2] Update `last_login_at` on successful login
- [X] T020 [US2] Return generic "Invalid credentials" for both wrong password and non-existent email
- [X] T021 [US2] Mount auth routes in `apps/api/src/server.ts`
- [X] T022 [US2] Write integration tests in `apps/api/tests/routes/auth.test.ts`

**Checkpoint**: User Story 2 complete - users can login and receive JWT

---

## Phase 5: User Story 3 - Access Protected GraphQL Routes (Priority: P1)

**Goal**: Require authentication for GraphQL operations

**Independent Test**: GraphQL requests without valid auth receive 401; with valid JWT succeed

### Implementation for User Story 3

- [X] T023 [US3] Create `apps/api/src/auth/middleware.ts` - JWT validation middleware
- [X] T024 [US3] Extract Bearer token from Authorization header
- [X] T025 [US3] Handle clock skew (30-second tolerance) in JWT validation
- [X] T026 [US3] Populate `req.user` with decoded JWT payload on success
- [X] T027 [US3] Update `apps/api/src/graphql/context.ts` - Add user and authMethod to Context
- [X] T028 [US3] Add auth check before GraphQL in `apps/api/src/server.ts`
- [X] T029 [US3] Keep introspection public (skip auth for __schema queries)
- [X] T030 [US3] Write middleware tests in `apps/api/tests/auth/middleware.test.ts`

**Checkpoint**: User Story 3 complete - GraphQL protected, valid JWT grants access

---

## Phase 6: User Story 4 - Create API Key for MCP (Priority: P1)

**Goal**: Enable users to generate API keys for programmatic access

**Independent Test**: Authenticated GraphQL mutation creates key, returns full key once, stores only hash

### Implementation for User Story 4

- [X] T031 [US4] Create `apps/api/src/graphql/types/api-key.ts` - ApiKey and CreateApiKeyResult types
- [X] T032 [US4] Create `apps/api/src/graphql/mutations/api-key.ts` - createApiKey mutation
- [X] T033 [US4] Generate secure random key with vr_ prefix (32 alphanumeric chars)
- [X] T034 [US4] Store SHA-256 hash and key_prefix in database (never plaintext)
- [X] T035 [US4] Return full key only in mutation response
- [X] T036 [US4] Register api-key mutations in `apps/api/src/graphql/mutations/index.ts`
- [X] T037 [US4] Write tests in `apps/api/tests/graphql/mutations/api-key.test.ts`

**Checkpoint**: User Story 4 complete - API keys can be created

---

## Phase 7: User Story 5 - Authenticate via API Key (Priority: P1)

**Goal**: Accept API key as alternative to JWT for GraphQL access

**Independent Test**: GraphQL request with valid X-API-Key header succeeds

### Implementation for User Story 5

- [X] T038 [US5] Extend `apps/api/src/auth/middleware.ts` - Check X-API-Key header
- [X] T039 [US5] Hash incoming key and lookup in database
- [X] T040 [US5] Check key expiry (if expires_at set)
- [X] T041 [US5] Update `last_used` on successful API key auth
- [X] T042 [US5] Load associated user and populate req.user
- [X] T043 [US5] Set authMethod to 'api_key' in context
- [X] T044 [US5] Write API key auth tests in `apps/api/tests/auth/api-key-auth.test.ts`

**Checkpoint**: User Story 5 complete - API key authentication works

---

## Phase 8: User Story 6 - Revoke API Key (Priority: P2)

**Goal**: Enable users to revoke (delete) their API keys

**Independent Test**: Revoke key via mutation, verify key no longer authenticates

### Implementation for User Story 6

- [X] T045 [US6] Add revokeApiKey mutation to `apps/api/src/graphql/mutations/api-key.ts`
- [X] T046 [US6] Verify key belongs to current user before deletion
- [X] T047 [US6] Return NotFoundError if key doesn't exist or belongs to another user
- [X] T048 [US6] Write revoke tests in `apps/api/tests/graphql/mutations/api-key.test.ts`

**Checkpoint**: User Story 6 complete - API keys can be revoked

---

## Phase 9: User Story 7 - Get Current User Info (Priority: P2)

**Goal**: Provide queries for current user info and API key listing

**Independent Test**: Query `me` returns authenticated user info; `apiKeys` lists user's keys

### Implementation for User Story 7

- [X] T049 [US7] Create `apps/api/src/graphql/types/user.ts` - User GraphQL type
- [X] T050 [US7] Create `apps/api/src/graphql/queries/user.ts` - me query
- [X] T051 [US7] Add apiKeys query to `apps/api/src/graphql/queries/user.ts`
- [X] T052 [US7] Return only key_prefix (not full key) in apiKeys listing
- [X] T053 [US7] Register user queries in `apps/api/src/graphql/queries/index.ts`
- [X] T054 [US7] Write tests in `apps/api/tests/graphql/queries/user.test.ts`

**Checkpoint**: User Story 7 complete - me and apiKeys queries work

---

## Phase 10: User Story 8 - Rate Limiting on Login (Priority: P3)

**Goal**: Protect login endpoint from brute force attacks

**Independent Test**: 11th login attempt within 15 minutes returns 429 Too Many Requests

### Implementation for User Story 8

- [X] T055 [US8] Add express-rate-limit configuration in `apps/api/src/auth/rate-limit.ts`
- [X] T056 [US8] Configure: 10 attempts per 15 minutes per IP
- [X] T057 [US8] Return 429 with clear error message when rate limited
- [X] T058 [US8] Apply rate limiter to login route in `apps/api/src/routes/auth.ts`
- [X] T059 [US8] Write rate limit tests in `apps/api/tests/routes/auth.test.ts`

**Checkpoint**: User Story 8 complete - login rate limiting active

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Integration testing, documentation, and final validation

- [X] T060 Add GET `/api/auth/me` endpoint in `apps/api/src/routes/auth.ts`
- [X] T061 [P] Run full test suite with coverage (`npm run test:coverage`)
- [X] T062 [P] Verify 80%+ coverage on auth modules (88.14% achieved)
- [X] T063 Follow quickstart.md to validate all user stories manually
- [X] T064 Verify health endpoints remain unauthenticated
- [X] T065 Verify GraphQL introspection works without auth

**Checkpoint**: Stage 4 Authentication complete and validated

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundation) ─── BLOCKS ALL USER STORIES
    │
    ├─────────┬─────────┬─────────┬─────────┐
    ▼         ▼         ▼         ▼         ▼
Phase 3    Phase 4   Phase 5   Phase 6   Phase 7
(US1)      (US2)     (US3)     (US4)     (US5)
CLI        Login     JWT MW    Create    API Key
                               Key       Auth
    │         │         │         │         │
    └─────────┴────┬────┴─────────┴─────────┘
                   ▼
              Phase 8 (US6) ─── Depends on US4, US5
              Revoke Key
                   │
                   ▼
              Phase 9 (US7) ─── Depends on US3, US4
              me, apiKeys
                   │
                   ▼
              Phase 10 (US8) ─── Depends on US2
              Rate Limiting
                   │
                   ▼
              Phase 11 (Polish)
```

### User Story Dependencies

| User Story | Depends On | Can Parallel With |
|------------|------------|-------------------|
| US1 (CLI) | Foundation | US2, US3, US4, US5 |
| US2 (Login) | Foundation | US1, US3, US4, US5 |
| US3 (JWT Middleware) | Foundation | US1, US2, US4 |
| US4 (Create API Key) | Foundation, US3 | US1, US2 |
| US5 (API Key Auth) | Foundation, US4 | US1, US2 |
| US6 (Revoke Key) | US4, US5 | US7, US8 |
| US7 (me, apiKeys) | US3, US4 | US6, US8 |
| US8 (Rate Limiting) | US2 | US6, US7 |

### Parallel Opportunities

**Within Phase 2 (Foundation)**:
- T005, T006 can run in parallel (different files)

**Across User Story Phases**:
- US1, US2, US3, US4, US5 can be worked on in parallel by different developers
- All require Foundation complete first

**Within Phase 11 (Polish)**:
- T061, T062 can run in parallel

---

## Task Statistics

| Phase | Tasks | Parallel | Description |
|-------|-------|----------|-------------|
| Setup | 3 | 2 | Dependencies, config |
| Foundation | 6 | 2 | Types, services, auth core |
| US1 (CLI) | 6 | 0 | Create user command |
| US2 (Login) | 7 | 0 | Login endpoint |
| US3 (JWT MW) | 8 | 0 | JWT middleware |
| US4 (Create Key) | 7 | 0 | API key creation |
| US5 (API Key Auth) | 7 | 0 | API key validation |
| US6 (Revoke) | 4 | 0 | Key revocation |
| US7 (me, apiKeys) | 6 | 0 | User queries |
| US8 (Rate Limit) | 5 | 0 | Brute force protection |
| Polish | 6 | 2 | Integration, validation |
| **Total** | **65** | **6** | |

---

## Critical Path (MVP)

For minimum viable auth system, complete in order:

1. **Phase 1**: Setup (T001-T003)
2. **Phase 2**: Foundation (T004-T009)
3. **Phase 4**: Login (T016-T022) - Users can authenticate
4. **Phase 5**: JWT Middleware (T023-T030) - GraphQL protected
5. **Phase 6**: Create API Key (T031-T037) - MCP access enabled
6. **Phase 7**: API Key Auth (T038-T044) - MCP can authenticate

After this, the auth system is functional. US1 (CLI), US6-US8 are important but not blocking.
