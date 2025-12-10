# Authentication

Cloud ValueRank uses JWT-based authentication for web users and API keys for programmatic access.

> **Original Design:** See [preplanning/authentication.md](../preplanning/authentication.md) for the original design rationale.

---

## Overview

Cloud ValueRank is an internal team tool with simplified authentication:

- **Single tenant** - All users share one workspace
- **Public visibility** - All data visible to authenticated users
- **Invite-only** - No public registration
- **No roles** - All authenticated users have equal access

---

## Authentication Methods

### 1. JWT Authentication (Web Frontend)

Email + password authentication returning a JWT token.

#### Login Flow

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Response

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "clxyz...",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

#### JWT Structure

```json
{
  "sub": "user_cuid",
  "email": "user@example.com",
  "iat": 1699900000,
  "exp": 1699986400
}
```

- **Expiry**: 24 hours
- **Signing**: HS256 with `JWT_SECRET` environment variable
- **Validation**: Verified on every authenticated request

#### Using the Token

Include the token in the `Authorization` header:

```http
GET /api/graphql
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

### 2. API Keys (MCP / Programmatic Access)

API keys enable AI agents and scripts to authenticate without user credentials.

#### Key Format

```
vr_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6
```

- **Prefix**: `vr_` (ValueRank)
- **Body**: 32 alphanumeric characters
- **Total**: 35 characters

#### Key Security

- Keys are shown **only once** at creation
- Only SHA-256 hashes are stored in the database
- Keys can be revoked at any time

#### Using an API Key

Include the key in the `X-API-Key` header:

```http
GET /api/graphql
X-API-Key: vr_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6
```

---

## API Endpoints

### Login

Authenticate with email and password.

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Rate Limited**: 10 attempts per 15 minutes per IP

**Responses**:
- `200` - Login successful, returns token and user
- `400` - Missing email or password
- `401` - Invalid credentials
- `429` - Rate limit exceeded

### Get Current User

Get the authenticated user's info.

```http
GET /api/auth/me
Authorization: Bearer {token}
```

**Response**:

```json
{
  "id": "clxyz...",
  "email": "user@example.com",
  "name": "User Name",
  "createdAt": "2024-01-01T00:00:00Z",
  "lastLoginAt": "2024-12-08T10:30:00Z"
}
```

---

## API Key Management

### List API Keys

```graphql
query MyApiKeys {
  apiKeys {
    id
    name
    keyPrefix   # e.g., "vr_abc1234"
    lastUsed
    createdAt
  }
}
```

### Create API Key

```graphql
mutation CreateApiKey($name: String!) {
  createApiKey(name: $name) {
    id
    name
    keyPrefix
    key         # Full key - shown only once!
  }
}
```

### Revoke API Key

```graphql
mutation RevokeApiKey($id: ID!) {
  revokeApiKey(id: $id)
}
```

---

## Authorization

### Middleware Flow

```
Request
    │
    ├─► Check X-API-Key header
    │   └─► Validate against hashed keys in DB
    │
    └─► Check Authorization: Bearer header
        └─► Verify JWT signature and expiry
    │
    ▼
req.user = { id, email }
```

### GraphQL Context

All GraphQL resolvers receive the authenticated user:

```typescript
// In resolver
resolve: async (_root, args, ctx) => {
  const userId = ctx.user?.id;  // User ID from JWT or API key
  // ...
}
```

### Protected Routes

All API routes except `/api/auth/login` require authentication:

```typescript
// Returns 401 if not authenticated
if (!req.user) {
  throw new AuthenticationError('Authentication required');
}
```

---

## User Management

### Database Schema

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  name         String?
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  apiKeys ApiKey[]
}

model ApiKey {
  id        String    @id @default(cuid())
  userId    String
  name      String                    // "Claude Desktop", "Cursor"
  keyHash   String    @unique         // SHA-256 hash
  keyPrefix String                    // "vr_abc1234" for display
  lastUsed  DateTime?
  expiresAt DateTime?                 // Optional expiry
  createdAt DateTime  @default(now())

  user User @relation(...)
}
```

### Creating Users

Users are created via database seeding or CLI - no public registration:

```bash
# Seed the development user
DATABASE_URL="..." npx prisma db seed

# Development user:
# Email: dev@valuerank.ai
# Password: development
```

### Password Security

- Passwords are hashed with bcrypt (cost factor 12)
- Minimum 8 characters
- Emails are normalized to lowercase

---

## LLM API Key Management

LLM provider keys are managed server-side via environment variables:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
XAI_API_KEY=...
DEEPSEEK_API_KEY=...
MISTRAL_API_KEY=...
```

**Why server-side?**
- Enables async background workers
- Simpler UX for internal team
- Centralized cost tracking
- Never exposed via API

---

## Rate Limiting

### Login Endpoint

```typescript
{
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 attempts per window
}
```

### API Requests

Light rate limiting is applied to prevent abuse:
- GraphQL queries: 1000 per minute
- GraphQL mutations: 100 per minute
- Export operations: 10 per minute

---

## Security Considerations

### What's Protected

| Resource | Protection |
|----------|------------|
| All definitions | Requires authentication |
| All runs | Requires authentication |
| All transcripts | Requires authentication |
| API keys | User-scoped (only see own keys) |
| LLM keys | Never exposed |

### What's NOT Implemented

| Feature | Reason |
|---------|--------|
| OAuth (Google, GitHub) | Overkill for internal team |
| Role-based permissions | All users are equal |
| Fine-grained scopes | Not needed for internal tool |
| Public registration | Invite-only |
| Password reset flow | Handle manually |
| Multi-tenancy | Single shared workspace |

---

## Key Source Files

- **Auth routes:** `apps/api/src/routes/auth.ts`
- **Auth services:** `apps/api/src/auth/services.ts`
- **Auth middleware:** `apps/api/src/auth/middleware.ts`
- **API key utilities:** `apps/api/src/auth/api-keys.ts`
- **Rate limiting:** `apps/api/src/auth/rate-limit.ts`

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Secret key for JWT signing (32+ chars) |
| `OPENAI_API_KEY` | No | OpenAI provider key |
| `ANTHROPIC_API_KEY` | No | Anthropic provider key |
| `GOOGLE_API_KEY` | No | Google AI provider key |
| `XAI_API_KEY` | No | xAI provider key |
| `DEEPSEEK_API_KEY` | No | DeepSeek provider key |
| `MISTRAL_API_KEY` | No | Mistral provider key |
