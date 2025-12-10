# REST API Endpoints

> Part of [Cloud ValueRank Documentation](../README.md)
>
> See also: [GraphQL Schema](./graphql-schema.md) | [MCP Tools](./mcp-tools.md)

This document covers all REST endpoints in Cloud ValueRank. The primary API is GraphQL, but REST endpoints handle authentication, file exports/imports, health checks, and the MCP protocol.

---

## Base URL

```
Development: http://localhost:3030
Production:  https://your-deployment.railway.app
```

---

## Authentication

The API supports two authentication methods:

### JWT Bearer Token
```
Authorization: Bearer <jwt_token>
```

Obtained via the `/api/auth/login` endpoint.

### API Key
```
X-API-Key: <api_key>
```

Generated via the GraphQL `createApiKey` mutation.

Both methods populate `req.user` with user information. Protected routes require one of these methods.

---

## Health Endpoints

Health endpoints are unauthenticated and used for monitoring.

### GET `/`

Basic API info.

**Response** (200):
```json
{
  "name": "Cloud ValueRank API",
  "version": "0.1.0"
}
```

### GET `/health`

Database connectivity check.

**Response** (200):
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:45.123Z",
  "services": {
    "database": "connected"
  }
}
```

**Error Response** (503):
```json
{
  "status": "unhealthy",
  "timestamp": "2025-01-15T10:30:45.123Z",
  "services": {
    "database": "disconnected"
  }
}
```

### GET `/health/providers`

Check LLM provider API connectivity.

**Query Parameters**:
- `refresh=true` - Force refresh cached provider status

**Response** (200):
```json
{
  "openai": {
    "status": "ok",
    "latencyMs": 245,
    "lastChecked": "2025-01-15T10:30:45.123Z"
  },
  "anthropic": {
    "status": "ok",
    "latencyMs": 312,
    "lastChecked": "2025-01-15T10:30:45.123Z"
  }
}
```

### GET `/health/queue`

Check job queue (PgBoss) status.

**Response** (200):
```json
{
  "status": "ok",
  "isHealthy": true,
  "pending": 5,
  "active": 2,
  "completed": 150,
  "failed": 3
}
```

**Degraded Response** (200):
```json
{
  "status": "degraded",
  "isHealthy": false,
  "message": "High failure rate detected"
}
```

### GET `/health/workers`

Check Python worker status.

**Query Parameters**:
- `refresh=true` - Force refresh cached worker status

**Response** (200):
```json
{
  "status": "ok",
  "isHealthy": true,
  "pythonVersion": "3.11.0",
  "workersAvailable": true
}
```

### GET `/health/system`

Comprehensive system health (all services in parallel).

**Query Parameters**:
- `refresh=true` - Force refresh all cached statuses

**Response** (200):
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:45.123Z",
  "database": "connected",
  "providers": {
    "openai": {"status": "ok"},
    "anthropic": {"status": "ok"}
  },
  "queue": {
    "status": "ok",
    "isHealthy": true
  },
  "worker": {
    "status": "ok",
    "isHealthy": true
  }
}
```

**Degraded Response** (200):
```json
{
  "status": "degraded",
  "timestamp": "2025-01-15T10:30:45.123Z",
  "database": "connected",
  "providers": {
    "openai": {"status": "error", "error": "API key invalid"}
  },
  "queue": {"status": "ok"},
  "worker": {"status": "ok"}
}
```

---

## Authentication Endpoints

### POST `/api/auth/login`

Authenticate user and receive JWT token.

**Rate Limiting**: 10 attempts per 15 minutes per IP

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Success Response** (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

**Error Responses**:
- `400` - Missing email or password
- `401` - Invalid credentials
- `429` - Rate limit exceeded

**Security Notes**:
- Returns generic "Invalid credentials" for both non-existent user and wrong password
- Updates `lastLoginAt` on successful login

### GET `/api/auth/me`

Get current authenticated user info.

**Authentication**: Required

**Success Response** (200):
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "name": "User Name",
  "createdAt": "2025-01-01T10:00:00Z",
  "lastLoginAt": "2025-01-15T10:30:45.123Z"
}
```

**Error Responses**:
- `401` - Authentication required or invalid token
- `404` - User not found

---

## Export Endpoints

All export endpoints require authentication.

### GET `/api/export/runs/:id/csv`

Download run results as CSV file.

**Authentication**: Required

**URL Parameters**:
- `id` - Run UUID

**Response Headers**:
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="run-<id>.csv"
```

**CSV Format**:
```csv
Index,RunId,ModelId,ScenarioId,ScenarioName,Dimension1,Dimension2,...
1,run-123,gpt-4,scenario-1,Medical Triage,High,3,...
2,run-123,gpt-4,scenario-2,Resource Allocation,Medium,5,...
```

**Notes**:
- Includes UTF-8 BOM for Excel compatibility
- Dynamic dimension columns extracted from scenario content
- Sorted by model, then scenario
- One row per transcript

**Error Responses**:
- `401` - Authentication required
- `404` - Run not found

### GET `/api/export/definitions/:id/md`

Download definition as markdown file.

**Authentication**: Required

**URL Parameters**:
- `id` - Definition UUID

**Response Headers**:
```
Content-Type: text/markdown; charset=utf-8
Content-Disposition: attachment; filename="<definition-name>.md"
```

**Markdown Format**:
```markdown
---
name: Medical Resource Allocation
tags:
  - healthcare
  - ethics
---

# Preamble

You are an ethics advisor helping a hospital...

# Template

A hospital with limited resources must decide...

# Dimensions

## Physical_Safety

- **1**: Minor risk
- **3**: Moderate risk
- **5**: Life-threatening

## Economics

- **1**: Minimal cost
- **3**: Significant cost
- **5**: Catastrophic cost
```

**Notes**:
- Compatible with devtool's `parseScenarioMd()` parser
- Includes inherited content from base definition (if forked)
- Tag information included in frontmatter

**Error Responses**:
- `401` - Authentication required
- `404` - Definition not found

### GET `/api/export/definitions/:id/scenarios.yaml`

Download scenarios as CLI-compatible YAML file.

**Authentication**: Required

**URL Parameters**:
- `id` - Definition UUID

**Response Headers**:
```
Content-Type: text/yaml; charset=utf-8
Content-Disposition: attachment; filename="<definition-name>-scenarios.yaml"
```

**YAML Format**:
```yaml
# Generated from: Medical Resource Allocation
# Definition ID: def-123
# Generated at: 2025-01-15T10:30:45.123Z

scenarios:
  - id: scenario-1
    name: "High stakes, limited resources"
    body: |
      A hospital with limited resources must decide...
    dimensions:
      Physical_Safety: 5
      Economics: 3

  - id: scenario-2
    name: "Moderate stakes, adequate resources"
    body: |
      A hospital with adequate resources must decide...
    dimensions:
      Physical_Safety: 3
      Economics: 1
```

**Notes**:
- Compatible with `src/probe.py` CLI tool
- All scenarios for the definition
- Includes category from tags

**Error Responses**:
- `401` - Authentication required
- `404` - Definition not found

---

## Import Endpoints

### POST `/api/import/definition`

Import a definition from markdown content.

**Authentication**: Required

**Request Body**:
```json
{
  "content": "---\nname: My Definition\ntags:\n  - ethics\n---\n\n# Preamble\n...",
  "name": "Optional Name Override",
  "forceAlternativeName": false
}
```

**Fields**:
- `content` (required) - Raw markdown content with YAML frontmatter
- `name` (optional) - Override name from frontmatter
- `forceAlternativeName` (optional) - Use alternative name if conflict

**Success Response** (201):
```json
{
  "id": "definition-uuid",
  "name": "Definition Name"
}
```

**With Alternative Name** (201):
```json
{
  "id": "definition-uuid",
  "name": "Definition Name (2)",
  "originalName": "Definition Name",
  "usedAlternativeName": true
}
```

**Validation Error Response** (400):
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Definition validation failed",
  "details": [
    "Missing required section: Preamble",
    "Invalid dimension format in Physical_Safety"
  ],
  "suggestions": {
    "alternativeName": "Definition Name (2)"
  }
}
```

**Error Responses**:
- `400` - Validation errors (invalid format, missing sections, name conflict)
- `401` - Authentication required

---

## GraphQL Endpoint

### POST `/graphql`

Execute GraphQL queries and mutations.

**Authentication**: Required (except for introspection)

**Content-Type**: `application/json`

**Request Body**:
```json
{
  "query": "query { definitions { id name } }",
  "variables": {}
}
```

**Allowed Without Auth**:
- Introspection queries (containing `__schema`, `__type`, or `IntrospectionQuery`)

**Success Response** (200):
```json
{
  "data": {
    "definitions": [
      {"id": "def-1", "name": "Medical Triage"},
      {"id": "def-2", "name": "Resource Allocation"}
    ]
  }
}
```

**Auth Error Response** (401):
```json
{
  "error": "AUTHENTICATION_ERROR",
  "message": "Authentication required"
}
```

See [GraphQL Schema Reference](./graphql-schema.md) for complete documentation.

---

## MCP Endpoint

The MCP (Model Context Protocol) endpoint enables AI agent access.

### POST `/mcp`

Handle MCP protocol requests.

**Authentication**: Required (API Key only)

**Rate Limiting**: 120 requests per minute per API key

**Request Headers**:
```
X-API-Key: <api-key>
mcp-session-id: <session-id>  (optional, for session reuse)
```

**Request Body**: MCP protocol JSON

**Response**:
- New session: Returns `mcp-session-id` header
- Existing session: Reuses session transport

**Error Responses**:
- `401` - Invalid API key
- `429` - Rate limit exceeded (120 req/min)
- `500` - MCP request processing failed

### DELETE `/mcp`

Terminate an MCP session.

**Authentication**: Required (API Key only)

**Request Headers**:
```
X-API-Key: <api-key>
mcp-session-id: <session-id>
```

**Response**: `204 No Content`

**Error Responses**:
- `400` - Session ID required
- `401` - Invalid API key

See [MCP Tools Reference](./mcp-tools.md) for available tools and resources.

---

## Request Tracking

Every request receives:

- **`x-request-id`** header - Auto-generated UUID if not provided
- Structured logging with request timing
- Correlation ID for tracing

Example log output:
```
{"level":"info","requestId":"abc-123","path":"/api/auth/login","method":"POST","msg":"Request started"}
{"level":"info","requestId":"abc-123","status":200,"duration":45,"msg":"Request completed"}
```

---

## Error Handling

All endpoints use consistent error format:

```json
{
  "error": "<ERROR_CODE>",
  "message": "Human-readable message",
  "details": ["Optional array of specific issues"]
}
```

**Common Error Codes**:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTHENTICATION_ERROR` | 401 | Auth required or invalid |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Server error |

---

## CORS

CORS is enabled for all origins with the following headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, X-Request-ID
```

---

## Summary Table

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | No | API info |
| GET | `/health` | No | Database health |
| GET | `/health/providers` | No | LLM provider status |
| GET | `/health/queue` | No | Job queue status |
| GET | `/health/workers` | No | Python worker status |
| GET | `/health/system` | No | Full system health |
| POST | `/api/auth/login` | No* | User login |
| GET | `/api/auth/me` | Yes | Get current user |
| GET | `/api/export/runs/:id/csv` | Yes | Export run as CSV |
| GET | `/api/export/definitions/:id/md` | Yes | Export definition as MD |
| GET | `/api/export/definitions/:id/scenarios.yaml` | Yes | Export scenarios as YAML |
| POST | `/api/import/definition` | Yes | Import definition from MD |
| POST | `/graphql` | Yes** | GraphQL API |
| POST | `/mcp` | Yes*** | MCP protocol |
| DELETE | `/mcp` | Yes*** | Terminate MCP session |

\* Rate limited: 10 attempts per 15 minutes per IP
\*\* Introspection queries allowed without auth
\*\*\* Requires API Key (not JWT)

---

## Source Files

- **Routes**: `apps/api/src/routes/`
  - `auth.ts` - Authentication endpoints
  - `export.ts` - Export endpoints
  - `import.ts` - Import endpoints
- **Health**: `apps/api/src/health.ts`
- **Auth Middleware**: `apps/api/src/auth/middleware.ts`
- **Rate Limiting**: `apps/api/src/auth/rate-limit.ts`
- **Server Setup**: `apps/api/src/server.ts`
