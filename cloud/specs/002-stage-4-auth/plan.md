# Implementation Plan: Stage 4 - Authentication System

**Branch**: `cloud-planning` | **Date**: 2025-12-06 | **Spec**: [spec.md](./spec.md)

## Summary

Implement JWT-based authentication for web frontend and API key authentication for MCP/programmatic access. The system uses bcrypt for password hashing and SHA-256 for API key storage, with a combined auth middleware that accepts either authentication method for GraphQL access.

---

## Technical Context

| Aspect | Value |
|--------|-------|
| **Language/Version** | TypeScript 5.3+ |
| **Primary Dependencies** | bcrypt, jsonwebtoken, express-rate-limit |
| **Storage** | PostgreSQL via Prisma (User, ApiKey models from Stage 2) |
| **Testing** | Vitest with supertest for API testing |
| **Target Platform** | Docker (local), Railway (production) |
| **Performance Goals** | JWT validation < 5ms overhead; login < 500ms |
| **Constraints** | Must integrate with existing Express middleware and GraphQL context |
| **Scale/Scope** | 3 REST endpoints, 4 GraphQL operations, CLI command |

---

## Constitution Check

**Status**: PASS

Validated against [CLAUDE.md](../../CLAUDE.md):

| Requirement | How Addressed |
|-------------|---------------|
| **File Size < 400 lines** | Split into auth/middleware.ts, auth/services.ts, auth/cli.ts |
| **No `any` Types** | Explicit types for JWT payload, auth context, API responses |
| **TypeScript Strict Mode** | All auth code compiles under strict mode |
| **Test Coverage 80%** | Unit tests for services, integration tests for middleware |
| **No console.log** | Use createLogger('auth') for all logging |
| **Structured Logging** | Log auth events with userId, method, outcome |
| **Custom Error Classes** | AuthenticationError extends AppError (401) |
| **Prisma Transactions** | Not needed (single-row auth operations) |

---

## Architecture Decisions

### Decision 1: JWT Library Selection

**Chosen**: `jsonwebtoken` (jose alternative considered)

**Rationale**:
- Battle-tested, most widely used JWT library in Node.js
- Simple API for sign/verify operations
- Well-documented, extensive community support
- Sufficient for internal tool requirements

**Alternatives Considered**:
- **jose**: More modern, better TypeScript support, but more complex API
- **@fastify/jwt**: Fastify-specific, would require adapter for Express

**Tradeoffs**:
- Pros: Simple, well-documented, synchronous verification
- Cons: Older API style, types require @types/jsonwebtoken

---

### Decision 2: Password Hashing with bcrypt

**Chosen**: `bcrypt` with cost factor 12

**Rationale**:
- Industry standard for password hashing
- Cost factor 12 provides good security/performance balance
- Native bindings for performance
- Already specified in design documentation

**Alternatives Considered**:
- **argon2**: Newer, memory-hard, but more complex setup
- **scrypt**: Good alternative, but bcrypt more familiar to team

**Tradeoffs**:
- Pros: Proven security, wide ecosystem support, predictable timing
- Cons: Cost factor may need adjustment for production hardware

---

### Decision 3: API Key Format and Storage

**Chosen**: `vr_` prefix + 32 alphanumeric chars, stored as SHA-256 hash

**Rationale**:
- Prefix enables easy identification of key type
- 32 chars provides 190+ bits of entropy
- SHA-256 is irreversible, fast for validation
- Storing hash only means compromised DB doesn't expose keys

**Key Generation**:
```
vr_[a-zA-Z0-9]{32}
Example: vr_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6
```

**Alternatives Considered**:
- **UUID format**: Less entropy, harder to type
- **bcrypt for keys**: Slower verification, unnecessary for random keys

**Tradeoffs**:
- Pros: Fast validation, secure storage, recognizable format
- Cons: No key versioning (acceptable for internal tool)

---

### Decision 4: Auth Middleware Integration Pattern

**Chosen**: Combined middleware that populates `req.user` before GraphQL

**Rationale**:
- Single middleware handles both JWT and API key
- GraphQL context reads from `req.user` (already established pattern)
- Unauthenticated requests get `req.user = null`
- Individual resolvers can check auth as needed

**Flow**:
```
Request → Auth Middleware → req.user populated → GraphQL Yoga → Context(req.user) → Resolvers
```

**Alternatives Considered**:
- **Separate middlewares**: More complex routing
- **GraphQL-only auth**: Would leave REST endpoints unprotected

**Tradeoffs**:
- Pros: Consistent pattern, works for REST and GraphQL
- Cons: Auth check on every request (negligible overhead)

---

### Decision 5: Rate Limiting Strategy

**Chosen**: `express-rate-limit` for login endpoint only

**Rationale**:
- Simple in-memory rate limiting sufficient for internal tool
- Only login endpoint needs protection (other endpoints require auth)
- 10 attempts per 15 minutes matches design spec

**Alternatives Considered**:
- **Redis-backed rate limiting**: Overkill for single-instance internal tool
- **GraphQL-level rate limiting**: More complex, not needed initially

**Tradeoffs**:
- Pros: Simple setup, no external dependencies
- Cons: Rate limits reset on server restart (acceptable)

---

### Decision 6: Auth Context in GraphQL

**Chosen**: Extend existing Context with auth fields

**Rationale**:
- Build on existing Stage 3 context pattern
- Add `user` and `authMethod` fields
- Resolvers access via `ctx.user`

**Context Extension**:
```typescript
interface Context {
  req: Request;
  log: Logger;
  loaders: DataLoaders;
  // New auth fields
  user: { id: string; email: string } | null;
  authMethod: 'jwt' | 'api_key' | null;
}
```

**Alternatives Considered**:
- **Separate auth context**: Would duplicate pattern
- **Token in context**: Unnecessary, already validated

**Tradeoffs**:
- Pros: Consistent pattern, type-safe user access
- Cons: Context grows (acceptable)

---

## Project Structure

### New Files

```
apps/api/src/
├── auth/
│   ├── index.ts              # Re-exports public auth API
│   ├── middleware.ts         # Express auth middleware (JWT + API key)
│   ├── services.ts           # Auth business logic (login, token generation)
│   ├── api-keys.ts           # API key generation and validation
│   ├── types.ts              # Auth-specific type definitions
│   └── errors.ts             # AuthenticationError class
│
├── routes/
│   └── auth.ts               # POST /api/auth/login, GET /api/auth/me
│
├── cli/
│   └── create-user.ts        # npm run create-user command
│
└── graphql/
    ├── mutations/
    │   └── api-key.ts        # createApiKey, revokeApiKey mutations
    └── queries/
        └── user.ts           # me, apiKeys queries

packages/shared/src/
└── errors.ts                 # Add AuthenticationError (export from here)
```

### Modified Files

| File | Change |
|------|--------|
| `apps/api/src/server.ts` | Add auth middleware before GraphQL, mount auth routes |
| `apps/api/src/graphql/context.ts` | Add user and authMethod to Context |
| `apps/api/package.json` | Add bcrypt, jsonwebtoken, express-rate-limit |
| `packages/shared/src/errors.ts` | Add AuthenticationError class |
| `packages/shared/src/index.ts` | Export AuthenticationError |

---

## Implementation Phases

### Phase 1: Foundation (~25% of work)

1. **Add dependencies** - bcrypt, jsonwebtoken, express-rate-limit, @types/*
2. **Create auth types** - JWTPayload, AuthContext, LoginRequest, etc.
3. **Create AuthenticationError** - Extends AppError with 401 status
4. **Create auth services** - Password hashing, JWT sign/verify
5. **Environment config** - JWT_SECRET validation

### Phase 2: REST Authentication (~25% of work)

1. **Create login endpoint** - POST /api/auth/login
2. **Create me endpoint** - GET /api/auth/me
3. **Create auth middleware** - JWT validation, req.user population
4. **Add rate limiting** - express-rate-limit on login
5. **Mount routes** - Update server.ts with auth routes

### Phase 3: API Key System (~25% of work)

1. **Create API key generation** - Secure random with vr_ prefix
2. **Create API key validation** - SHA-256 hash lookup
3. **Extend auth middleware** - Check X-API-Key header
4. **GraphQL mutations** - createApiKey, revokeApiKey
5. **GraphQL queries** - apiKeys listing

### Phase 4: GraphQL Integration (~15% of work)

1. **Update context** - Add user and authMethod
2. **Create me query** - Return current user via GraphQL
3. **Protect operations** - Add auth check to mutations
4. **Introspection exception** - Keep introspection public

### Phase 5: CLI & Testing (~10% of work)

1. **Create CLI command** - npm run create-user
2. **Unit tests** - Auth services, password hashing, JWT
3. **Integration tests** - Login flow, protected routes, API keys
4. **Manual testing** - End-to-end auth flows

---

## Data Flow

### JWT Authentication Flow

```
Login Request                                       Database
      │                                                │
      ▼                                                │
POST /api/auth/login                                   │
      │                                                │
      ├── Validate Input (email, password)             │
      │                                                │
      ├── Find User ─────────────────────────────────▶│── SELECT * FROM users WHERE email = ?
      │                                                │
      ├── Verify Password (bcrypt.compare)             │
      │                                                │
      ├── Generate JWT (24h expiry)                    │
      │                                                │
      ├── Update last_login_at ───────────────────────▶│── UPDATE users SET last_login_at = NOW()
      │                                                │
      └── Return { token, user }                       │
```

### API Key Authentication Flow

```
GraphQL Request with X-API-Key                      Database
      │                                                │
      ▼                                                │
Auth Middleware                                        │
      │                                                │
      ├── Extract X-API-Key header                     │
      │                                                │
      ├── Hash key (SHA-256)                           │
      │                                                │
      ├── Find API Key ──────────────────────────────▶│── SELECT * FROM api_keys WHERE key_hash = ?
      │                                                │
      ├── Check expiry (if set)                        │
      │                                                │
      ├── Update last_used ──────────────────────────▶│── UPDATE api_keys SET last_used = NOW()
      │                                                │
      ├── Load User ─────────────────────────────────▶│── SELECT * FROM users WHERE id = ?
      │                                                │
      └── Set req.user = { id, email }                 │
```

---

## Error Handling Strategy

| Error Type | When | HTTP Status | Response |
|------------|------|-------------|----------|
| AuthenticationError | No token provided | 401 | `{ error: "UNAUTHORIZED", message: "No token provided" }` |
| AuthenticationError | Invalid/expired token | 401 | `{ error: "UNAUTHORIZED", message: "Invalid token" }` |
| AuthenticationError | Invalid credentials | 401 | `{ error: "UNAUTHORIZED", message: "Invalid credentials" }` |
| AuthenticationError | Invalid API key | 401 | `{ error: "UNAUTHORIZED", message: "Invalid API key" }` |
| ValidationError | Password too short | 400 | `{ error: "VALIDATION_ERROR", message: "Password must be at least 8 characters" }` |
| NotFoundError | API key not found (revoke) | 404 | `{ error: "NOT_FOUND", message: "API key not found" }` |
| RateLimitError | Too many login attempts | 429 | `{ error: "RATE_LIMITED", message: "Too many login attempts" }` |

**Security Note**: Login errors use generic "Invalid credentials" to prevent email enumeration.

---

## Testing Strategy

### Unit Tests

| File | Tests |
|------|-------|
| `tests/auth/services.test.ts` | Password hashing, JWT sign/verify, token parsing |
| `tests/auth/api-keys.test.ts` | Key generation, hash validation, format validation |
| `tests/auth/middleware.test.ts` | JWT extraction, API key extraction, error handling |

### Integration Tests

| File | Tests |
|------|-------|
| `tests/routes/auth.test.ts` | Login flow, me endpoint, rate limiting |
| `tests/graphql/auth.test.ts` | Protected mutations, API key operations, me query |

### Test Cases (Key Scenarios)

```typescript
describe('Auth Services', () => {
  describe('login', () => {
    it('returns JWT for valid credentials');
    it('returns 401 for wrong password');
    it('returns 401 for non-existent email');
    it('updates last_login_at on success');
  });

  describe('JWT validation', () => {
    it('accepts valid unexpired token');
    it('rejects expired token');
    it('rejects malformed token');
    it('handles clock skew within 30 seconds');
  });
});

describe('API Keys', () => {
  describe('createApiKey', () => {
    it('generates key with vr_ prefix');
    it('stores only hash in database');
    it('returns full key only once');
  });

  describe('validateApiKey', () => {
    it('accepts valid key');
    it('rejects invalid key');
    it('updates last_used on success');
  });
});
```

---

## Security Considerations

### Password Security
- bcrypt cost factor 12 (~250ms hash time)
- Passwords stored as bcrypt hash only
- Minimum 8 characters enforced
- No complexity requirements (internal tool)

### JWT Security
- HS256 algorithm with strong secret
- 24-hour expiry (internal tool acceptable)
- Secret from environment variable (required)
- No token in URL parameters

### API Key Security
- SHA-256 hash stored (not plaintext)
- Full key shown only once at creation
- Keys can be revoked immediately
- Prefix identifies key type (vr_)

### Rate Limiting
- 10 login attempts per 15 minutes per IP
- No rate limit on API key auth (already authenticated)
- Rate limit reset on server restart (acceptable for internal)

---

## Environment Configuration

### Required Variables

```bash
# JWT signing secret (required, 32+ characters)
JWT_SECRET=your-secure-random-secret-here

# Existing variables
DATABASE_URL=postgresql://...
```

### Validation

```typescript
// In config.ts
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters');
}
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "express-rate-limit": "^7.1.5"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/jsonwebtoken": "^9.0.5"
  }
}
```

---

## Open Questions (Resolved)

1. **Refresh tokens?**
   - Decision: No, 24h expiry acceptable for internal tool (per spec)

2. **Password reset?**
   - Decision: No, manual CLI process for internal team (per spec)

3. **Session storage?**
   - Decision: No, JWT is stateless (no server-side session tracking)

4. **CORS for auth?**
   - Decision: Use existing CORS config, auth cookies not needed (Bearer tokens)

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Login latency | < 500ms | Test with bcrypt cost factor 12 |
| JWT validation overhead | < 5ms | Benchmark middleware |
| Test coverage | > 80% | Vitest coverage report |
| Type safety | 0 `any` types | ESLint enforcement |
| Security | No plaintext secrets | Code review, tests |

---

## Next Steps

1. Review this plan for technical accuracy
2. When ready for task breakdown, invoke the **feature-tasks** skill
3. Or refine architecture decisions if needed
