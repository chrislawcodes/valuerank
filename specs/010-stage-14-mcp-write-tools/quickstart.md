# Quickstart: Stage 14 - MCP Write Tools

## Prerequisites

- [ ] Docker running (`docker ps` shows valuerank-postgres)
- [ ] Development database seeded (`npm run db:seed`)
- [ ] API server running (`npm run dev` in cloud/)
- [ ] API key created (via web UI or directly in database)
- [ ] Claude Desktop (or other MCP client) available for testing

## Environment Setup

```bash
# Start database
cd cloud
docker-compose up -d postgres

# Install dependencies and run dev server
npm install
npm run dev

# In another terminal - verify API is running
curl http://localhost:3000/health
```

## MCP Client Configuration

Configure Claude Desktop with ValueRank MCP server:

```json
// ~/.config/claude/mcp.json (or equivalent for your OS)
{
  "mcpServers": {
    "valuerank": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "X-API-Key": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

---

## Testing User Story 1: Create Definition via MCP

**Goal**: Verify AI agents can create new scenario definitions.

**Steps**:
1. Open Claude Desktop with MCP configured
2. Ask Claude: "Create a new ValueRank scenario definition about a medical triage situation where a doctor must prioritize patients"
3. Claude should use the `create_definition` tool

**Expected**:
- Definition created with valid structure (preamble, template, dimensions)
- Response includes `definition_id`
- Definition visible in web UI at http://localhost:5173/definitions

**Verification**:
```bash
# Check definition was created via GraphQL
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"query": "{ definitions { id name createdAt } }"}'
```

---

## Testing User Story 2: Fork Definition via MCP

**Goal**: Verify AI agents can fork existing definitions with modifications.

**Steps**:
1. Note an existing definition ID from the web UI
2. Ask Claude: "Fork definition [ID] and change the severity dimension to have more extreme values"
3. Claude should use the `fork_definition` tool

**Expected**:
- New definition created with `parentId` set to original
- Changes applied to forked definition
- Response includes `definition_id` and `diff_summary`
- Version tree shows parent-child relationship in web UI

**Verification**:
```bash
# Check fork relationship
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"query": "{ definition(id: \"NEW_DEFINITION_ID\") { id name parentId parent { id name } } }"}'
```

---

## Testing User Story 3: Validate Definition Before Saving

**Goal**: Verify AI agents can validate content before committing.

**Steps**:
1. Ask Claude: "Validate a scenario definition with 15 dimensions" (exceeds limit)
2. Claude should use the `validate_definition` tool
3. Should receive validation errors

**Expected**:
- `valid: false` in response
- Error message: "Maximum 10 dimensions allowed"
- No definition created in database

**Verification**:
```bash
# Validate a definition with errors
# This should return validation errors, not create anything
```

---

## Testing User Story 4: Start Run via MCP

**Goal**: Verify AI agents can start evaluation runs.

**Steps**:
1. Note an existing definition ID with scenarios generated
2. Ask Claude: "Start a run for definition [ID] using GPT-4 and Claude models"
3. Claude should use the `start_run` tool

**Expected**:
- Run created with status "PENDING" or "RUNNING"
- Response includes `run_id`, `queued_task_count`, `estimated_cost`
- Run visible in web UI at http://localhost:5173/runs
- Jobs queued in PgBoss

**Verification**:
```bash
# Check run was created
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"query": "{ runs(limit: 5) { id status progress { total completed } } }"}'

# Check jobs queued (requires DB access)
docker exec -it valuerank-postgres psql -U valuerank -d valuerank -c \
  "SELECT name, state, COUNT(*) FROM pgboss.job GROUP BY name, state;"
```

---

## Testing User Story 5: Preview Generated Scenarios

**Goal**: Verify AI agents can preview scenarios before running.

**Steps**:
1. Note an existing definition ID
2. Ask Claude: "Preview what scenarios would be generated for definition [ID]"
3. Claude should use the `generate_scenarios_preview` tool

**Expected**:
- Response includes `scenario_count`
- Response includes sample of 5 scenarios with dimension values
- Response includes `sample_body` with full text of first scenario
- No new scenarios saved to database

**Verification**:
- Check that scenario count matches expected combinations
- Verify sample_body contains properly substituted placeholders

---

## Testing User Story 6: Access Authoring Resources

**Goal**: Verify AI agents can access authoring guidance.

**Steps**:
1. Ask Claude: "How should I structure a ValueRank scenario?"
2. Claude should request resource `valuerank://authoring/guide`

**Expected**:
- Claude receives authoring guide content
- Response includes structure guidance, best practices, dimension design tips

**Also Test**:
- Ask for examples: "Show me example ValueRank definitions"
- Ask about values: "What value tensions make good scenarios?"
- Ask for templates: "What preamble patterns work well?"

---

## Testing User Story 7: Audit Trail

**Goal**: Verify write operations are logged.

**Steps**:
1. Perform any write operation (create, fork, start_run)
2. Check API server logs

**Expected**:
- Structured log entry with:
  - `action`: create_definition, fork_definition, or start_run
  - `userId`: User ID from API key
  - `entityId`: ID of created entity
  - `requestId`: Correlation ID

**Verification**:
```bash
# Check API logs for audit entries
# (in terminal running npm run dev)
# Look for: mcp:audit INFO ... "MCP write: create_definition"
```

---

## Testing User Story 8: Input Validation

**Goal**: Verify malformed content is rejected with clear errors.

**Test Cases**:

1. **Template too long** (> 10000 chars):
   ```
   Ask Claude to create a definition with a very long template
   → Should receive: "Template must be 10000 characters or less"
   ```

2. **Too many dimensions** (> 10):
   ```
   Ask Claude to create a definition with 12 dimensions
   → Should receive: "Maximum 10 dimensions allowed"
   ```

3. **Too many levels** (> 10 per dimension):
   ```
   Ask Claude to create a dimension with 15 levels
   → Should receive: "Maximum 10 levels per dimension"
   ```

4. **Invalid model name**:
   ```
   Ask Claude to start a run with model "fake-model-xyz"
   → Should receive error listing valid model options
   ```

5. **Non-existent definition**:
   ```
   Ask Claude to fork definition "nonexistent-id"
   → Should receive: "Parent definition not found"
   ```

---

## Troubleshooting

### Issue: MCP tools not appearing in Claude Desktop
**Fix**:
- Verify MCP configuration file path is correct
- Restart Claude Desktop after configuration changes
- Check API server is running and accessible

### Issue: Authentication errors
**Fix**:
- Verify API key is valid and not revoked
- Check X-API-Key header is set correctly in MCP config
- Test API key works: `curl -H "X-API-Key: YOUR_KEY" http://localhost:3000/mcp`

### Issue: Definition creation fails silently
**Fix**:
- Check API server logs for errors
- Verify content has required fields (preamble, template, dimensions)
- Use `validate_definition` first to check content

### Issue: Run doesn't start
**Fix**:
- Verify definition has scenarios generated (check web UI)
- Check PgBoss queue is running (jobs should be created)
- Verify specified models are valid (use supported model list)

### Issue: Rate limit hit
**Fix**:
- Wait 1 minute for rate limit window to reset
- Rate limit is 120 requests per minute per API key
- Check X-RateLimit-Remaining header in responses

---

## Quick Test Commands

```bash
# Health check
curl http://localhost:3000/health

# List definitions via GraphQL
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"query": "{ definitions(limit: 5) { id name } }"}'

# List runs via GraphQL
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"query": "{ runs(limit: 5) { id status definitionId } }"}'

# Get supported models
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"query": "{ providers { id models { id name } } }"}'
```
