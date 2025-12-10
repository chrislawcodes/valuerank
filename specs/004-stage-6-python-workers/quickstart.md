# Quickstart: Stage 6 - Python Worker Integration

## Prerequisites

- [ ] Development environment running (`npm run dev` from cloud/)
- [ ] PostgreSQL running (`docker-compose up -d`)
- [ ] Python 3.10+ installed (`python3 --version`)
- [ ] At least one LLM API key configured in `.env`:
  - `OPENAI_API_KEY` (recommended for testing)
  - or `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, etc.
- [ ] Test user created (`npm run create-user` in apps/api)
- [ ] Test definition with scenarios exists in database

---

## Setup

### 1. Install Python Dependencies

```bash
cd cloud/workers
pip3 install -r requirements.txt
```

### 2. Verify Python Environment

```bash
# Test worker health check
echo '{}' | python3 workers/health_check.py
# Should output: {"success": true, "python_version": "3.x.x", ...}
```

### 3. Configure Environment

Ensure `.env` file in `cloud/` contains:
```
DATABASE_URL=postgresql://valuerank:valuerank@localhost:5432/valuerank
OPENAI_API_KEY=sk-...  # Or other provider key
JWT_SECRET=your-dev-secret
```

---

## Testing User Story 1: Execute Probe Job with Real LLM

**Goal**: Verify probe jobs call real LLM providers and return actual responses

### Test via GraphQL Playground

1. Open http://localhost:4000/graphql

2. Login to get JWT token:
```graphql
mutation {
  login(email: "test@example.com", password: "your-password") {
    token
  }
}
```

3. Add Authorization header:
```
{"Authorization": "Bearer <token>"}
```

4. Find a definition with scenarios:
```graphql
query {
  definitions(first: 1) {
    edges {
      node {
        id
        name
        scenarios(first: 3) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  }
}
```

5. Start a run with a single model:
```graphql
mutation {
  startRun(input: {
    definitionId: "<definition-id>",
    models: ["gpt-4"],
    samplePercentage: 10  # Run on ~10% of scenarios
  }) {
    id
    status
    progress {
      total
      completed
      failed
    }
  }
}
```

6. Poll for progress (every 5 seconds):
```graphql
query {
  run(id: "<run-id>") {
    status
    progress {
      total
      completed
      failed
    }
  }
}
```

### Expected Results

- Run status transitions: PENDING → RUNNING → COMPLETED
- `progress.completed` increases as jobs finish
- No `progress.failed` unless there are configuration issues

### Verify Transcript Created

```graphql
query {
  run(id: "<run-id>") {
    transcripts(first: 1) {
      edges {
        node {
          id
          modelId
          turnCount
          tokenCount
          durationMs
        }
      }
    }
  }
}
```

### Verification Checklist

- [ ] Transcript `content` contains actual LLM response (not "Mock" or placeholder)
- [ ] `turnCount` matches expected turns (1 prompt + N followups)
- [ ] `tokenCount` > 0
- [ ] `durationMs` > 0 (typically 1000-10000ms for real calls)

---

## Testing User Story 2: Save Transcripts to Database

**Goal**: Verify transcripts are persisted with all required fields

### Direct Database Check

```bash
# Connect to database
docker exec -it valuerank-postgres psql -U valuerank -d valuerank

# Query transcripts
SELECT id, run_id, model_id, turn_count, token_count, duration_ms, created_at
FROM transcripts
WHERE run_id = '<run-id>'
ORDER BY created_at DESC
LIMIT 5;

# Check content structure
SELECT id, content->'turns' as turns
FROM transcripts
WHERE run_id = '<run-id>'
LIMIT 1;
```

### Expected Content Structure

```json
{
  "schemaVersion": 1,
  "turns": [
    {
      "turnNumber": 1,
      "promptLabel": "scenario_prompt",
      "probePrompt": "You are faced with...",
      "targetResponse": "I would consider...",
      "inputTokens": 150,
      "outputTokens": 320
    },
    {
      "turnNumber": 2,
      "promptLabel": "followup_1",
      "probePrompt": "What if...",
      "targetResponse": "In that case...",
      "inputTokens": 180,
      "outputTokens": 280
    }
  ]
}
```

### Verification Checklist

- [ ] `run_id` matches expected run
- [ ] `scenario_id` links to valid scenario
- [ ] `model_id` matches requested model (e.g., "gpt-4")
- [ ] `content` is valid JSON with `turns` array
- [ ] `definition_snapshot` is populated (copy of definition at run time)

---

## Testing User Story 3: Handle LLM Provider Errors

**Goal**: Verify error handling for rate limits, auth failures, timeouts

### Test Rate Limit (Simulated)

1. Set environment variable to force test failure:
```bash
export FAIL_MODEL_ID="rate-limit-test"
```

2. Start run with fake model:
```graphql
mutation {
  startRun(input: {
    definitionId: "<definition-id>",
    models: ["rate-limit-test"]
  }) {
    id
  }
}
```

3. Observe in API logs: job retries with exponential backoff

### Test Missing API Key

1. Temporarily unset API key:
```bash
unset OPENAI_API_KEY
```

2. Start run with OpenAI model - should fail with auth error

3. Check logs for clear error message:
```
[ERROR] Probe job failed: OPENAI_API_KEY is not set
```

### Test Invalid Model

```graphql
mutation {
  startRun(input: {
    definitionId: "<definition-id>",
    models: ["invalid-model-xyz"]
  }) {
    id
  }
}
```

Should fail with non-retryable error (no retry attempts).

### Verification Checklist

- [ ] Rate limit errors (429) trigger retry
- [ ] Auth errors (401/403) fail immediately without retry
- [ ] Invalid model errors fail immediately
- [ ] Error messages include actionable information
- [ ] Failed jobs increment `progress.failed`

---

## Testing User Story 4: Worker Health Check

**Goal**: Verify Python environment is validated

### Test Health Check Directly

```bash
echo '{}' | python3 cloud/workers/health_check.py
```

Expected output:
```json
{
  "success": true,
  "python_version": "3.11.5",
  "packages": {
    "requests": "2.31.0",
    "pyyaml": "6.0.1"
  },
  "api_keys": {
    "openai": true,
    "anthropic": false,
    "google": true
  }
}
```

### Test Missing Package

```bash
# Create virtual env without requests
python3 -m venv /tmp/test-env
source /tmp/test-env/bin/activate
echo '{}' | python3 cloud/workers/health_check.py
```

Should report missing package with install instructions.

---

## Testing User Story 5: Multiple LLM Providers

**Goal**: Verify all 6 providers work correctly

### Multi-Provider Run

```graphql
mutation {
  startRun(input: {
    definitionId: "<definition-id>",
    models: ["gpt-4", "claude-3-sonnet", "gemini-1.5-pro"],
    samplePercentage: 5
  }) {
    id
  }
}
```

### Verify Each Provider

After run completes:

```graphql
query {
  run(id: "<run-id>") {
    transcripts(first: 10) {
      edges {
        node {
          modelId
          turnCount
        }
      }
    }
  }
}
```

### Provider-Specific Checks

| Provider | Model ID | Expected Behavior |
|----------|----------|-------------------|
| OpenAI | `gpt-4` | Uses `OPENAI_API_KEY` |
| Anthropic | `claude-3-sonnet` | Uses `ANTHROPIC_API_KEY` |
| Google | `gemini-1.5-pro` | Uses `GOOGLE_API_KEY` |
| xAI | `grok-2` | Uses `XAI_API_KEY` |
| DeepSeek | `deepseek-chat` | Uses `DEEPSEEK_API_KEY` |
| Mistral | `mistral-large` | Uses `MISTRAL_API_KEY` |

---

## Troubleshooting

### Issue: "Python process exited with code 1"

**Cause**: Python worker crashed

**Fix**:
1. Check API server logs for stderr output
2. Run worker manually: `echo '{"runId":"test",...}' | python3 workers/probe.py`
3. Check for missing environment variables

### Issue: "Failed to parse output"

**Cause**: Python printed non-JSON to stdout

**Fix**:
1. Ensure all Python logging goes to stderr
2. Check for debug print statements in Python code

### Issue: "OPENAI_API_KEY is not set"

**Cause**: Environment variable not loaded

**Fix**:
1. Check `.env` file in `cloud/`
2. Restart API server to reload environment
3. Verify: `echo $OPENAI_API_KEY`

### Issue: Slow Job Execution

**Cause**: LLM rate limiting or slow response

**Fix**:
1. Check provider dashboard for rate limit status
2. Reduce `samplePercentage` in run config
3. Use faster model (e.g., `gpt-3.5-turbo`)

### Issue: Transcripts Missing Model Version

**Cause**: Provider doesn't expose model version

**Fix**: This is expected for some providers. `model_version` is optional.

---

## Clean Up Test Data

```sql
-- Delete test run and cascaded transcripts
DELETE FROM runs WHERE id = '<run-id>';

-- Or delete all test runs
DELETE FROM runs WHERE created_at > NOW() - INTERVAL '1 hour';
```
