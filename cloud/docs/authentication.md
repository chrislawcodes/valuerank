# Authentication & Authorization

> Part of [Cloud ValueRank Architecture](./architecture-overview.md)

## Overview

Cloud ValueRank needs authentication for:
1. **Web Frontend**: Human users accessing the dashboard
2. **MCP Interface**: AI agents accessing the API programmatically
3. **API Access**: Direct API consumers (scripts, integrations)

## User Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| **Admin** | System administrators | Full access: user management, system config, all data |
| **Editor** | Scenario authors | Create/edit definitions, start runs, view all results |
| **Viewer** | Results consumers | View runs, results, and analysis (read-only) |

### Permission Matrix

| Action | Admin | Editor | Viewer |
|--------|-------|--------|--------|
| View runs & results | ✅ | ✅ | ✅ |
| View definitions | ✅ | ✅ | ✅ |
| Create/edit definitions | ✅ | ✅ | ❌ |
| Start/pause/cancel runs | ✅ | ✅ | ❌ |
| Create experiments | ✅ | ✅ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| System configuration | ✅ | ❌ | ❌ |
| API key management | ✅ | Own keys | Own keys |
| Delete data | ✅ | Own data | ❌ |

---

## Authentication Methods

### Phase 1: Email + Password

Simple, standard authentication to start:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   API       │────▶│  PostgreSQL │
│             │     │   Server    │     │   (users)   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │   JWT Token       │
       ◀───────────────────┘
```

**Implementation:**
- Password hashing: bcrypt (cost factor 12)
- Session tokens: JWT with short expiry (15 min access, 7 day refresh)
- Store refresh tokens in database for revocation

**Database Schema:**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**API Endpoints:**
```
POST /api/auth/register     # Create account (if open registration)
POST /api/auth/login        # Email + password → JWT tokens
POST /api/auth/refresh      # Refresh token → new access token
POST /api/auth/logout       # Invalidate refresh token
POST /api/auth/password     # Change password (authenticated)
```

### Phase 2: OAuth / Google Login

Add OAuth for convenience and enterprise SSO:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   API       │────▶│   Google    │
│             │     │   Server    │     │   OAuth     │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │   JWT Token       │
       ◀───────────────────┘
```

**Implementation:**
- Use Passport.js with `passport-google-oauth20`
- Link OAuth accounts to existing users by email
- Auto-create users on first OAuth login (default: viewer role)

**Additional Schema:**
```sql
CREATE TABLE oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,        -- 'google', 'github', etc.
  provider_user_id VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, provider_user_id)
);
```

**API Endpoints:**
```
GET  /api/auth/google           # Redirect to Google OAuth
GET  /api/auth/google/callback  # OAuth callback → JWT tokens
POST /api/auth/link/google      # Link Google to existing account
```

---

## API Key Authentication

For programmatic access (scripts, MCP, integrations):

```
┌─────────────┐     ┌─────────────┐
│  MCP Agent  │────▶│   API       │
│  or Script  │     │   Server    │
└─────────────┘     └─────────────┘
       │
       │  X-ValueRank-API-Key: vr_live_...
       └──────────────────────────────────▶
```

**Key Format:**
```
vr_live_abc123xyz...  # Production keys
vr_test_abc123xyz...  # Test/development keys
```

**Database Schema:**
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,           -- "My MCP Agent", "CI Pipeline"
  key_hash VARCHAR(255) NOT NULL,       -- SHA-256 hash of key
  key_prefix VARCHAR(20) NOT NULL,      -- "vr_live_abc" for display
  role VARCHAR(50) NOT NULL,            -- Inherited or restricted
  scopes TEXT[],                        -- Optional: limit to specific actions
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,               -- Optional expiration
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Properties:**
- Keys inherit user's role by default, or can be restricted further
- Optional scopes for fine-grained access (e.g., `read:runs`, `write:definitions`)
- Keys can have expiration dates
- Track last usage for security auditing

**API Endpoints:**
```
GET    /api/keys              # List user's API keys
POST   /api/keys              # Create new key (returns plaintext once)
DELETE /api/keys/:id          # Revoke key
```

---

## MCP Authentication

MCP interface uses API key authentication with additional considerations:

### Authentication Flow
```typescript
// MCP server validates on every request
auth: {
  type: "api_key",
  header: "X-ValueRank-API-Key",
  validate: async (key) => {
    const apiKey = await db.apiKeys.findByHash(sha256(key));
    if (!apiKey) throw new AuthError("Invalid API key");
    if (apiKey.expires_at && apiKey.expires_at < new Date()) {
      throw new AuthError("API key expired");
    }
    await db.apiKeys.updateLastUsed(apiKey.id);
    return { user_id: apiKey.user_id, role: apiKey.role };
  }
}
```

### MCP-Specific Scopes

For AI agents, offer granular scopes:

| Scope | Description |
|-------|-------------|
| `read:runs` | View runs and results |
| `read:definitions` | View scenario definitions |
| `write:definitions` | Create/edit definitions |
| `write:runs` | Start/manage runs |
| `read:experiments` | View experiments |
| `write:experiments` | Create experiments |

**Example: Read-only MCP agent**
```
Scopes: ["read:runs", "read:definitions", "read:experiments"]
```

**Example: Full authoring agent**
```
Scopes: ["read:*", "write:definitions", "write:runs", "write:experiments"]
```

### Rate Limiting by Key

```typescript
// Different limits per role/key
rateLimits: {
  viewer: { requests_per_minute: 30 },
  editor: { requests_per_minute: 60 },
  admin:  { requests_per_minute: 120 }
}
```

---

## Session Management

### JWT Token Structure

```typescript
// Access token (short-lived)
{
  sub: "user_uuid",
  role: "editor",
  iat: 1699900000,
  exp: 1699900900  // 15 minutes
}

// Refresh token (long-lived, stored in DB)
{
  sub: "user_uuid",
  jti: "refresh_token_uuid",  // For revocation lookup
  iat: 1699900000,
  exp: 1700504900  // 7 days
}
```

### Token Refresh Flow

```
1. Client sends expired access token
2. Server returns 401
3. Client sends refresh token to /api/auth/refresh
4. Server validates refresh token exists in DB and not expired
5. Server issues new access token
6. (Optional) Server rotates refresh token
```

### Logout / Revocation

```
1. Client calls /api/auth/logout with refresh token
2. Server deletes refresh token from DB
3. Access token remains valid until expiry (15 min max)
```

---

## Security Considerations

### Password Requirements
- Minimum 8 characters
- Check against common password lists (e.g., Have I Been Pwned)
- No complexity requirements (length > complexity per NIST)

### Brute Force Protection
```typescript
// Rate limit login attempts
loginLimiter: {
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // 5 attempts
  message: "Too many login attempts, try again later"
}
```

### HTTPS Only
- All auth endpoints require HTTPS
- Cookies: `Secure`, `HttpOnly`, `SameSite=Strict`

### API Key Security
- Keys shown only once at creation
- Store only hashed keys in database
- Keys can be rotated without changing permissions

---

## Implementation Plan

### Phase 1: Email + Password (MVP)
1. User table with bcrypt passwords
2. JWT access/refresh token flow
3. Basic role-based authorization middleware
4. API key generation for MCP access

### Phase 2: OAuth
1. Add Google OAuth provider
2. Account linking (OAuth to existing email)
3. Auto-provisioning on first OAuth login

### Phase 3: Advanced Features
- Additional OAuth providers (GitHub, Microsoft)
- Fine-grained scopes for API keys
- Admin user management UI
- Audit logging for auth events

---

## Authorization Middleware

```typescript
// Express middleware example
function requireRole(...allowedRoles: string[]) {
  return (req, res, next) => {
    const user = req.user;  // Set by auth middleware
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

// Usage
app.post("/api/definitions", requireRole("admin", "editor"), createDefinition);
app.get("/api/runs", requireRole("admin", "editor", "viewer"), listRuns);
app.post("/api/admin/users", requireRole("admin"), manageUsers);
```

---

## User Management (Admin)

### Admin API Endpoints
```
GET    /api/admin/users           # List all users
POST   /api/admin/users           # Create user (with role)
PATCH  /api/admin/users/:id       # Update user role
DELETE /api/admin/users/:id       # Deactivate user
GET    /api/admin/users/:id/keys  # View user's API keys
DELETE /api/admin/keys/:id        # Revoke any API key
```

### Initial Admin Setup
```bash
# Create first admin via CLI or environment variable
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<generated>
```
