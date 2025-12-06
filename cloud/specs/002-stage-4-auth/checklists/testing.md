# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)
**Constitution**: [CLAUDE.md](../../../CLAUDE.md)

---

## Coverage Requirements (per constitution)

- [ ] **Line coverage ≥ 80%** on auth modules
  - Reference: CLAUDE.md § Coverage Targets
  - Command: `npm run test:coverage`

- [ ] **Branch coverage ≥ 75%** on auth modules
  - Reference: CLAUDE.md § Coverage Targets
  - Check: if/else paths, error cases

- [ ] **Function coverage ≥ 80%** on auth modules
  - Reference: CLAUDE.md § Coverage Targets
  - All public functions tested

---

## Test Structure (per constitution)

- [ ] **Describe/it pattern** - Organized by function
  - Reference: CLAUDE.md § Test Structure
  ```typescript
  describe('AuthService', () => {
    describe('login', () => {
      it('returns JWT for valid credentials');
      it('returns 401 for wrong password');
    });
  });
  ```

- [ ] **Test files location** - Mirror src structure
  - Reference: CLAUDE.md § Test Files Location
  - Pattern: `tests/auth/services.test.ts` for `src/auth/services.ts`

---

## What to Test (per constitution)

- [ ] **Business logic** - Password hashing, JWT generation
  - Reference: CLAUDE.md § What to Test
  - Test: hash generation, token signing, payload structure

- [ ] **Data transformations** - Email normalization, key formatting
  - Reference: CLAUDE.md § What to Test
  - Test: lowercase email, vr_ prefix, hash format

- [ ] **Edge cases** - Invalid inputs, expired tokens, rate limits
  - Reference: CLAUDE.md § What to Test
  - Test: empty password, malformed JWT, 11th login attempt

- [ ] **Mock external dependencies** - Database calls mocked
  - Reference: CLAUDE.md § What to Test
  - Use vitest mocks for Prisma

---

## Pre-Commit Requirements

- [ ] **All tests pass** before commit
  - Command: `npm test`
  - No skipped tests in auth modules

- [ ] **Type check passes**
  - Command: `npm run typecheck`
  - No TypeScript errors in auth code

- [ ] **Lint passes**
  - Command: `npm run lint`
  - No ESLint errors/warnings

---

## Unit Tests Required

### Auth Services (apps/api/tests/auth/services.test.ts)

- [ ] `hashPassword` returns bcrypt hash
- [ ] `verifyPassword` returns true for correct password
- [ ] `verifyPassword` returns false for wrong password
- [ ] `signToken` returns valid JWT
- [ ] `verifyToken` returns payload for valid token
- [ ] `verifyToken` throws for expired token
- [ ] `verifyToken` throws for malformed token
- [ ] Clock skew within 30 seconds accepted

### API Keys (apps/api/tests/auth/api-keys.test.ts)

- [ ] `generateApiKey` returns key with vr_ prefix
- [ ] `generateApiKey` returns 36-character key
- [ ] `hashApiKey` returns SHA-256 hash
- [ ] `validateApiKey` returns true for valid key
- [ ] `validateApiKey` returns false for invalid key
- [ ] Key prefix extraction works correctly

### Middleware (apps/api/tests/auth/middleware.test.ts)

- [ ] Extracts JWT from Authorization header
- [ ] Handles "Bearer " prefix correctly
- [ ] Handles missing Authorization header
- [ ] Extracts API key from X-API-Key header
- [ ] Returns 401 for invalid JWT
- [ ] Returns 401 for invalid API key
- [ ] Sets req.user for valid auth
- [ ] Sets authMethod correctly (jwt/api_key)

---

## Integration Tests Required

### Login Route (apps/api/tests/routes/auth.test.ts)

- [ ] POST /api/auth/login with valid credentials returns JWT
- [ ] POST /api/auth/login with wrong password returns 401
- [ ] POST /api/auth/login with non-existent email returns 401
- [ ] POST /api/auth/login updates last_login_at
- [ ] GET /api/auth/me returns user with valid JWT
- [ ] GET /api/auth/me returns 401 without auth
- [ ] Rate limiting triggers after 10 attempts

### GraphQL Auth (apps/api/tests/graphql/auth.test.ts)

- [ ] Protected queries require auth
- [ ] Protected mutations require auth
- [ ] Valid JWT grants access
- [ ] Valid API key grants access
- [ ] Introspection works without auth
- [ ] createApiKey returns full key once
- [ ] apiKeys returns only prefixes
- [ ] revokeApiKey deletes key
- [ ] Revoked key no longer authenticates

---

## Test Data Setup

- [ ] **Test user fixture** - Known email/password for tests
  - Email: `test@example.com`
  - Password: `testpassword123`
  - Created in beforeEach/beforeAll

- [ ] **Test API key fixture** - Known key for tests
  - Full key stored in test variable
  - Hash stored in test database

- [ ] **Database isolation** - Tests don't affect each other
  - Use transactions or cleanup in afterEach
  - No test order dependencies
