# Authentication & Authorization

> Part of [Cloud ValueRank Architecture](./architecture-overview.md)
>
> See also: [Product Specification](./product-spec.md) for context on these decisions

## Overview

Cloud ValueRank is an **internal team tool** with simplified authentication:

- **Single tenant**: All users share one workspace
- **Public visibility**: All data visible to all authenticated users
- **Invite-only**: No public registration
- **Server-side LLM keys**: Stored centrally, enabling async workers

---

## User Model

### Single Role: Authenticated User

All authenticated users have full access to:
- View all definitions, runs, experiments, results
- Create/edit definitions
- Start/pause/cancel runs
- Create experiments
- Fork any definition
- Generate API keys for MCP access

**No role hierarchy.** If you're authenticated, you can do everything.

### Admin Functions (Environment-based)

System administration (user creation, LLM key config) is handled via:
- Environment variables for LLM API keys
- CLI or direct database for user management
- No admin UI needed for internal team

---

## Authentication Methods

### Web Frontend: Email + Password

Simple JWT-based authentication:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   API       │────▶│  PostgreSQL │
│             │     │   Server    │     │   (users)   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │   JWT Token       │
       ◀───────────────────┘
```

**Implementation:**
- Password hashing: bcrypt (cost factor 12)
- Access token: JWT, 24-hour expiry (longer for internal tool)
- Refresh token: Optional, 30-day expiry
- Store refresh tokens in DB for revocation if needed

**Database Schema:**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
```

**API Endpoints:**
```
POST /api/auth/login        # Email + password → JWT token
POST /api/auth/logout       # Invalidate refresh token (if using)
GET  /api/auth/me           # Get current user info
```

**No registration endpoint.** Users are created via CLI or direct DB insert.

### MCP / Programmatic Access: API Keys

For AI agents connecting via MCP (local chat integration):

```
┌─────────────┐     ┌─────────────┐
│  Local LLM  │────▶│   API       │
│  (Claude,   │     │   Server    │
│   etc.)     │     │             │
└─────────────┘     └─────────────┘
       │
       │  X-API-Key: vr_abc123xyz...
       └──────────────────────────────▶
```

**Key Format:**
```
vr_abc123xyz...  # 32+ character random string
```

**Database Schema:**
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,           -- "Claude Desktop", "Cursor"
  key_hash VARCHAR(255) NOT NULL,       -- SHA-256 hash
  key_prefix VARCHAR(10) NOT NULL,      -- "vr_abc1" for display
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**API Endpoints:**
```
GET    /api/keys              # List user's API keys (shows prefix only)
POST   /api/keys              # Create new key (returns plaintext ONCE)
DELETE /api/keys/:id          # Revoke key
```

---

## LLM API Key Management

LLM provider keys (OpenAI, Anthropic, etc.) are managed server-side:

```bash
# Environment variables
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

**Rationale:**
- Enables async background workers (users don't need browser open)
- Simpler UX for internal team
- Centralized cost tracking

**Security:**
- Keys stored in environment, not database
- Never exposed via API
- Workers read from environment at startup

---

## Session Management

### JWT Structure

```typescript
// Access token
{
  sub: "user_uuid",
  email: "user@example.com",
  iat: 1699900000,
  exp: 1699986400  // 24 hours for internal tool
}
```

### Token Flow

```
1. User logs in with email/password
2. Server returns JWT access token
3. Client stores token (localStorage or httpOnly cookie)
4. Client sends token in Authorization header
5. Token expires after 24 hours → re-login
```

For internal tool with trusted users, simpler flow is fine.

---

## Authorization Middleware

```typescript
// Simple auth check - no role hierarchy
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// API key auth for MCP
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];

  if (!key) {
    return res.status(401).json({ error: 'No API key provided' });
  }

  const keyHash = sha256(key);
  const apiKey = await db.apiKeys.findByHash(keyHash);

  if (!apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  await db.apiKeys.updateLastUsed(apiKey.id);
  req.user = { id: apiKey.user_id };
  next();
}

// Combined: accept either JWT or API key
function requireAuthOrApiKey(req, res, next) {
  if (req.headers['x-api-key']) {
    return requireApiKey(req, res, next);
  }
  return requireAuth(req, res, next);
}
```

---

## User Management

### Creating Users (CLI)

```bash
# Via environment at startup (first admin)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<generated>

# Via CLI command
npm run create-user -- --email user@example.com --password <password>
```

### Listing Users

```bash
npm run list-users
```

No UI for user management - internal team handles via CLI.

---

## Security Considerations

### Password Requirements
- Minimum 8 characters
- No complexity requirements (internal tool, trusted users)

### Rate Limiting
```typescript
// Light rate limiting for internal tool
loginLimiter: {
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 attempts
}
```

### API Key Security
- Keys shown only once at creation
- Only hash stored in database
- Revocable at any time

---

## What We're NOT Building

| Feature | Reason |
|---------|--------|
| OAuth (Google, GitHub) | Overkill for internal team |
| Role-based permissions | All users are equal |
| Fine-grained scopes | Not needed for internal tool |
| Public registration | Invite-only |
| Password reset flow | Handle manually for internal team |
| Multi-tenancy | Single shared workspace |
| Session management UI | Use CLI for user management |
