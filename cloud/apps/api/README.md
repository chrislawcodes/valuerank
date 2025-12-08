# ValueRank API

Express.js backend for the Cloud ValueRank evaluation platform.

## Quick Start

```bash
# From cloud/ directory
npm run dev
# API runs at http://localhost:3031
```

## Endpoints

### Health Check
- `GET /health` - API and service health status

### GraphQL
- `POST /graphql` - GraphQL API (JWT auth required)
- `GET /graphql` - GraphQL Playground (development only)

### MCP (Model Context Protocol)
- `POST /mcp` - MCP protocol endpoint for AI clients

---

## MCP Integration

The API exposes an MCP server for AI assistant integration (Claude Desktop, etc.).

### Authentication

All MCP requests require an API key via the `X-API-Key` header.

```bash
curl -X POST http://localhost:3031/mcp \
  -H "X-API-Key: vr_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

### Rate Limiting

- 120 requests per minute per API key
- Returns `429 Too Many Requests` when exceeded
- Check `X-RateLimit-*` headers for current status

### Available Tools

| Tool | Description | Token Budget |
|------|-------------|--------------|
| `list_runs` | Query evaluation runs with filters | 2KB |
| `get_run_summary` | Get aggregated analysis for a run | 5KB |
| `list_definitions` | Browse scenario definitions | 2KB |
| `graphql_query` | Execute read-only GraphQL queries | 10KB |
| `get_dimension_analysis` | See which dimensions drive divergence | 2KB |
| `get_transcript_summary` | Get transcript metadata | 1KB |

### Claude Desktop Configuration

Add to `~/.config/claude-desktop/config.json`:

```json
{
  "mcpServers": {
    "valuerank": {
      "url": "http://localhost:3031/mcp",
      "headers": {
        "X-API-Key": "vr_your_api_key"
      }
    }
  }
}
```

---

## Tool Reference

### list_runs

Query evaluation runs with optional filters.

**Parameters:**
- `definition_id` (string, optional) - Filter by definition
- `status` (string, optional) - Filter by status: pending, running, completed, failed
- `limit` (number, optional) - Max results (default: 20, max: 50)

**Example:**
```json
{
  "tool": "list_runs",
  "arguments": {
    "status": "completed",
    "limit": 10
  }
}
```

### get_run_summary

Get aggregated analysis results for a completed run.

**Parameters:**
- `run_id` (string, required) - The run ID to summarize
- `include_insights` (boolean, optional) - Include AI-generated insights

**Example:**
```json
{
  "tool": "get_run_summary",
  "arguments": {
    "run_id": "clx123abc",
    "include_insights": true
  }
}
```

### list_definitions

Browse available scenario definitions.

**Parameters:**
- `folder` (string, optional) - Filter by folder path
- `include_children` (boolean, optional) - Include child definitions

**Example:**
```json
{
  "tool": "list_definitions",
  "arguments": {
    "folder": "autonomous-vehicles"
  }
}
```

### graphql_query

Execute arbitrary GraphQL queries (read-only).

**Parameters:**
- `query` (string, required) - GraphQL query string
- `variables` (object, optional) - Query variables

**Restrictions:**
- Mutations are blocked (returns `MUTATION_NOT_ALLOWED`)
- Introspection queries are allowed

**Example:**
```json
{
  "tool": "graphql_query",
  "arguments": {
    "query": "query { runs(limit: 5) { id status } }"
  }
}
```

### get_dimension_analysis

Get dimension impact analysis for a run.

**Parameters:**
- `run_id` (string, required) - The run ID to analyze

**Example:**
```json
{
  "tool": "get_dimension_analysis",
  "arguments": {
    "run_id": "clx123abc"
  }
}
```

### get_transcript_summary

Get transcript metadata without full text.

**Parameters:**
- `run_id` (string, required) - The run ID
- `scenario_id` (string, required) - The scenario ID
- `model` (string, required) - Model identifier

**Example:**
```json
{
  "tool": "get_transcript_summary",
  "arguments": {
    "run_id": "clx123abc",
    "scenario_id": "scenario_12",
    "model": "openai:gpt-4"
  }
}
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | 3031 |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | JWT signing secret (32+ chars) | - |
| `LOG_LEVEL` | Logging level | info |
| `NODE_ENV` | Environment mode | development |

---

## Development

```bash
# Run with hot reload
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run typecheck

# Lint
npm run lint
```
