# Quickstart: Stage 12 - MCP Read Tools

Manual testing guide for MCP integration with AI clients.

## Prerequisites

- [ ] Development environment running (`npm run dev` from cloud/)
- [ ] PostgreSQL database running (`docker-compose up -d postgres`)
- [ ] Test data seeded (`npm run db:seed`)
- [ ] At least one completed run with analysis results
- [ ] API key generated via web UI or database
- [ ] Claude Desktop or MCP-compatible client installed

---

## Setting Up Claude Desktop

### 1. Generate API Key

```bash
# Via web UI
1. Login to http://localhost:5173
2. Go to Settings > API Keys
3. Click "Generate New Key"
4. Copy the key (shown only once!)

# Or via database
INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM users LIMIT 1),
  'Claude Desktop',
  -- hash of 'vr_test_key_for_development'
  'sha256hash...',
  'vr_test_'
);
```

### 2. Configure Claude Desktop

Edit your Claude Desktop config (`~/.config/claude-desktop/config.json` on Mac/Linux):

```json
{
  "mcpServers": {
    "valuerank": {
      "url": "http://localhost:3031/mcp",
      "headers": {
        "X-API-Key": "vr_your_api_key_here"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

Restart the app to load the new MCP configuration.

---

## Testing User Story 1: Query Runs from Local AI Chat

**Goal**: Verify AI can list and query runs via MCP

### Test Steps

1. Open Claude Desktop
2. Ask: "What are my recent ValueRank runs?"
3. Verify Claude calls the `list_runs` tool
4. Verify response includes run IDs, status, and models

**Expected Output**:
```
I found 3 recent runs:

1. run_abc123 (completed)
   - Models: openai:gpt-4, anthropic:claude-3
   - Scenarios: 50
   - Created: 2024-01-16

2. run_def456 (running)
   - Models: openai:gpt-4o
   - Scenarios: 25
   - Created: 2024-01-16
...
```

### Verification

```bash
# Check API logs for MCP request
tail -f logs/api.log | grep mcp

# Verify rate limit headers in response
curl -X POST http://localhost:3031/mcp \
  -H "X-API-Key: vr_your_key" \
  -H "Content-Type: application/json" \
  -d '{"tool": "list_runs", "arguments": {"limit": 5}}'
```

---

## Testing User Story 2: View Run Summary via MCP

**Goal**: Verify AI can retrieve aggregated analysis for a run

### Test Steps

1. First, get a run ID: "List my completed runs"
2. Ask: "Summarize run [run_id]"
3. Verify Claude calls `get_run_summary`
4. Verify response includes basic stats, model agreement, contested scenarios

**Expected Output**:
```
Run run_abc123 Summary:

Basic Stats:
- 2 models evaluated
- 100 transcripts completed

Model Agreement:
- Average correlation: 0.85
- No outlier models detected

Most Contested Scenarios:
1. scenario_12 (variance: 0.45)
2. scenario_8 (variance: 0.38)

Insights:
- GPT-4 prioritizes Physical_Safety 15% more than Claude
```

### Verification

Check response is under 5KB token budget:

```bash
# Get raw response and check size
curl -s -X POST http://localhost:3031/mcp \
  -H "X-API-Key: vr_your_key" \
  -H "Content-Type: application/json" \
  -d '{"tool": "get_run_summary", "arguments": {"run_id": "run_abc123"}}' \
  | wc -c
# Should be < 5120 bytes
```

---

## Testing User Story 3: Browse Definitions via MCP

**Goal**: Verify AI can list and explore definitions

### Test Steps

1. Ask: "What scenario definitions are available?"
2. Verify Claude calls `list_definitions`
3. Ask: "Show me definitions in the 'safety' folder"
4. Verify filter is applied correctly

**Expected Output**:
```
Available Definitions:

1. trolley-av-v1 (baseline)
   - Folder: autonomous-vehicles
   - Created: 2024-01-10

2. cafe-safety-dilemma (softer-framing)
   - Folder: workplace-safety
   - Parent: cafe-safety-dilemma (original)
   - Created: 2024-01-12
```

### Verification

```bash
# Test folder filter
curl -X POST http://localhost:3031/mcp \
  -H "X-API-Key: vr_your_key" \
  -d '{"tool": "list_definitions", "arguments": {"folder": "autonomous-vehicles"}}'
```

---

## Testing User Story 4: Execute GraphQL Query

**Goal**: Verify AI can run custom GraphQL queries

### Test Steps

1. Ask: "Find the top 5 scenarios with highest variance using GraphQL"
2. Verify Claude constructs a valid GraphQL query
3. Verify raw GraphQL response is returned

**Expected Output**:
```
I'll query that for you...

Query executed successfully:

{
  "data": {
    "run": {
      "analysis": {
        "mostContestedScenarios": [
          {"scenarioId": "scenario_12", "variance": 0.45},
          ...
        ]
      }
    }
  }
}
```

### Verification

Test mutation rejection:

```bash
# This should fail with MUTATION_NOT_ALLOWED
curl -X POST http://localhost:3031/mcp \
  -H "X-API-Key: vr_your_key" \
  -d '{
    "tool": "graphql_query",
    "arguments": {
      "query": "mutation { createRun(input: {}) { id } }"
    }
  }'

# Expected error:
# {"error": "MUTATION_NOT_ALLOWED", "message": "MCP read tools do not support GraphQL mutations"}
```

---

## Testing User Story 5: Dimension Analysis

**Goal**: Verify AI can get variable impact analysis

### Test Steps

1. Ask: "Which dimensions matter most in run [run_id]?"
2. Verify Claude calls `get_dimension_analysis`
3. Verify ranked dimensions with effect sizes returned

**Expected Output**:
```
Dimension Analysis for run_abc123:

Most Impactful Dimensions:
1. severity (effect: 0.42) - Highest impact on model divergence
2. victim_type (effect: 0.28)
3. certainty (effect: 0.15)

Models disagree most on: severity, victim_type
```

---

## Testing User Story 6: Transcript Summary

**Goal**: Verify AI can get transcript details without raw text

### Test Steps

1. Ask: "Tell me about the transcript for scenario_12 with GPT-4 in run [run_id]"
2. Verify Claude calls `get_transcript_summary`
3. Verify key reasoning points returned (NOT full transcript)

**Expected Output**:
```
Transcript Summary:

Run: run_abc123
Scenario: scenario_12
Model: openai:gpt-4

Stats:
- 4 dialogue turns
- ~850 words

Decision: prioritize_safety

Key Reasoning:
1. Model emphasized duty of care to customers
2. Economic concerns were secondary to physical safety
3. Referenced regulatory compliance requirements
```

---

## Testing User Story 7: Authentication

**Goal**: Verify API key authentication works

### Test Steps

```bash
# Test without API key - should fail
curl -X POST http://localhost:3031/mcp \
  -H "Content-Type: application/json" \
  -d '{"tool": "list_runs"}'
# Expected: 401 AUTHENTICATION_REQUIRED

# Test with invalid key - should fail
curl -X POST http://localhost:3031/mcp \
  -H "X-API-Key: invalid_key" \
  -d '{"tool": "list_runs"}'
# Expected: 401 INVALID_API_KEY

# Test with valid key - should succeed
curl -X POST http://localhost:3031/mcp \
  -H "X-API-Key: vr_your_valid_key" \
  -d '{"tool": "list_runs"}'
# Expected: 200 with run list
```

---

## Testing User Story 8: Rate Limiting

**Goal**: Verify rate limiting prevents abuse

### Test Steps

```bash
# Send 125 requests quickly (over 120 limit)
for i in {1..125}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3031/mcp \
    -H "X-API-Key: vr_your_key" \
    -d '{"tool": "list_runs"}' &
done
wait

# Some requests should return 429
# Check for Retry-After header
```

**Expected**:
- First 120 requests: 200 OK
- Requests 121+: 429 Too Many Requests
- Response includes `Retry-After` header

---

## Troubleshooting

### MCP Not Connecting

**Issue**: Claude Desktop can't connect to MCP server

**Fix**:
1. Verify API is running: `curl http://localhost:3031/health`
2. Check MCP endpoint exists: `curl http://localhost:3031/mcp`
3. Verify API key in config is correct
4. Check Claude Desktop logs for connection errors

### Authentication Errors

**Issue**: 401 errors despite valid API key

**Fix**:
1. Check key format starts with `vr_`
2. Verify key not expired: `SELECT expires_at FROM api_keys WHERE key_prefix = 'vr_abc'`
3. Check key hash matches in database
4. Try generating a new key

### Rate Limit Hit Unexpectedly

**Issue**: 429 errors with few requests

**Fix**:
1. Rate limit is per API key, not per user
2. Check if other clients using same key
3. Wait 60 seconds for window reset
4. Check `X-RateLimit-Remaining` header

### Response Truncated

**Issue**: Data appears incomplete

**Fix**:
1. Check `metadata.truncated` in response
2. Use pagination (`limit` parameter)
3. Apply filters to reduce result set
4. For GraphQL, simplify query to reduce response size

### Tool Not Found

**Issue**: "Unknown tool" error

**Fix**:
1. Check tool name spelling (case-sensitive)
2. Verify MCP server version supports tool
3. Check MCP configuration is loaded (restart Claude Desktop)

---

## Sample Test Data

To create test data for manual testing:

```bash
# Seed development database
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma db seed

# Or create specific test data
npm run create-test-run -- --scenarios 50 --models gpt-4,claude-3
```
