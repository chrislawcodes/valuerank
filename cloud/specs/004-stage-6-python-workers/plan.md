# Implementation Plan: Stage 6 - Python Worker Integration

**Branch**: `004-stage-6-python-workers` | **Date**: 2024-12-06 | **Spec**: [spec.md](./spec.md)

## Summary

Connect the existing Python LLM adapters from `src/llm_adapters.py` to the TypeScript orchestrator via the `spawnPython` utility built in Stage 5. This enables `probe_scenario` jobs to execute real LLM calls and save transcripts to the PostgreSQL database.

---

## Technical Context

| Aspect | Value |
|--------|-------|
| **Language/Version** | TypeScript 5.3+ (Node 20+), Python 3.10+ |
| **Primary Dependencies** | pg-boss 12.5+, express 4.x, prisma |
| **Storage** | PostgreSQL (Prisma ORM) - uses existing `transcripts` table |
| **Testing** | vitest (TypeScript), pytest (Python) |
| **Target Platform** | Docker containers (local dev + Railway production) |
| **Performance Goals** | Probe job < 5 minutes, Python startup < 2 seconds |
| **Constraints** | Stateless workers, JSON stdin/stdout, 80%+ test coverage |
| **Scale/Scope** | Single worker process initially, 6 LLM providers |

---

## Constitution Check

**Status**: PASS

Validated against [CLAUDE.md](../../CLAUDE.md):

| Constitution Requirement | Implementation |
|--------------------------|----------------|
| **File Size < 400 lines** | Split: probe.py (~200), llm_adapters.py (~300), errors.py (~80), config.py (~60) |
| **No `any` Types** | TypeScript interfaces defined; Python uses type hints |
| **Test Coverage 80%** | Python pytest suite + TypeScript vitest for handler |
| **Structured Logging** | Python `common/logging.py` outputs JSON to stderr |
| **Custom Error Classes** | Python `common/errors.py` with WorkerError hierarchy |
| **No console.log** | Python uses structured logger; TypeScript uses createLogger |

---

## Architecture Decisions

### Decision 1: Adapt vs Import Existing LLM Adapters

**Chosen**: Create adapted copy in `cloud/workers/common/llm_adapters.py`

**Rationale**:
- Existing `src/llm_adapters.py` is CLI-focused (stdout prints, returns strings)
- Cloud workers need structured JSON output with metadata (tokens, timing)
- Avoid coupling cloud workers to CLI code evolution
- Can share bug fixes via manual sync when needed

**Alternatives Considered**:
- Direct import from `src/`: Would require refactoring CLI code, risks breaking CLI
- Thin wrapper: Would double maintenance burden

**Tradeoffs**:
- Pros: Clean separation, can optimize for cloud use case
- Cons: Code duplication, need to sync provider updates

---

### Decision 2: Error Classification Strategy

**Chosen**: Python returns error metadata, TypeScript respects existing `isRetryableError`

**Rationale**:
- Stage 5 already has `isRetryableError()` function in probe handler
- Python knows provider-specific error patterns (rate limits, auth)
- Return `retryable: boolean` in Python output, use in TypeScript

**Implementation**:
```python
# Python returns:
{"success": false, "error": {"message": "...", "code": "RATE_LIMIT", "retryable": true}}
```
```typescript
// TypeScript uses retryable flag directly, fallback to isRetryableError for legacy
const isRetry = result.error.retryable ?? isRetryableError(new Error(result.error.message));
```

---

### Decision 3: Token Counting Approach

**Chosen**: Use tiktoken for OpenAI models, estimate for others

**Rationale**:
- tiktoken is accurate for OpenAI models
- Other providers don't have public tokenizers
- Estimation (4 chars/token) sufficient for cost tracking

**Implementation**:
- Install `tiktoken` as optional dependency
- Fallback to character-based estimate if not available

---

### Decision 4: Transcript Content Format

**Chosen**: Store structured JSON, not markdown

**Rationale**:
- Existing CLI stores markdown, but structured data is more queryable
- `content` field is JSONB in Prisma schema
- Can render to markdown for display

**Structure**:
```json
{
  "schemaVersion": 1,
  "turns": [
    {"role": "user", "content": "...", "label": "scenario_prompt"},
    {"role": "assistant", "content": "...", "inputTokens": 150, "outputTokens": 320}
  ]
}
```

---

### Decision 5: Health Check Implementation

**Chosen**: Lazy validation on first job, not startup blocking

**Rationale**:
- Fast API startup (don't block on Python verification)
- Health check runs once when first probe job starts
- Cache result to avoid repeated checks

**Implementation**:
```typescript
let healthChecked = false;
async function ensureHealthy() {
  if (healthChecked) return;
  const result = await spawnPython('workers/health_check.py', {});
  if (!result.success) throw new Error('Worker health check failed');
  healthChecked = true;
}
```

---

## Project Structure

### Changes Summary

```
cloud/
├── apps/api/src/
│   └── queue/
│       └── handlers/
│           └── probe-scenario.ts  # MODIFY: Replace stub with real Python call
│
└── workers/                       # NEW: Python workers directory
    ├── __init__.py
    ├── probe.py                   # NEW: Main probe worker
    ├── analyze_basic.py           # NEW: Stub for Tier 1 analysis
    ├── health_check.py            # NEW: Environment verification
    ├── common/
    │   ├── __init__.py
    │   ├── llm_adapters.py        # NEW: Adapted from src/llm_adapters.py
    │   ├── config.py              # NEW: Environment config
    │   ├── errors.py              # NEW: Error types
    │   └── logging.py             # NEW: Structured JSON logging
    ├── requirements.txt           # NEW: Python dependencies
    └── tests/
        ├── __init__.py
        ├── conftest.py            # NEW: pytest fixtures
        ├── test_probe.py          # NEW: Probe worker tests
        ├── test_llm_adapters.py   # NEW: Adapter tests (mocked)
        └── test_errors.py         # NEW: Error handling tests
```

---

## Implementation Phases

### Phase 1: Python Workers Foundation (P1)

**Goal**: Create `cloud/workers/` directory with shared utilities

**Files to Create**:
1. `workers/requirements.txt` - Python dependencies
2. `workers/common/__init__.py` - Package init
3. `workers/common/config.py` - Environment config loading
4. `workers/common/errors.py` - Error classification
5. `workers/common/logging.py` - Structured JSON logging

**Dependencies** (requirements.txt):
```
requests>=2.31.0
pyyaml>=6.0
tiktoken>=0.5.0
python-dotenv>=1.0.0
pytest>=7.4.0
pytest-cov>=4.1.0
```

---

### Phase 2: LLM Adapters (P1)

**Goal**: Create adapted LLM adapters from existing code

**Files to Create**:
1. `workers/common/llm_adapters.py` - Adapted from `src/llm_adapters.py`

**Key Adaptations**:
- Return structured dict instead of string
- Include token counts in response
- Return `retryable` flag on errors
- Remove all print statements (use logger)
- Add model version extraction where available

**Providers to Support**:
| Provider | API Key Env Var | Models |
|----------|-----------------|--------|
| OpenAI | `OPENAI_API_KEY` | gpt-4, gpt-4-turbo, gpt-4o, gpt-3.5-turbo |
| Anthropic | `ANTHROPIC_API_KEY` | claude-3-opus, claude-3-sonnet, claude-3-haiku |
| Google | `GOOGLE_API_KEY` | gemini-1.5-pro, gemini-1.5-flash |
| xAI | `XAI_API_KEY` | grok-1, grok-2 |
| DeepSeek | `DEEPSEEK_API_KEY` | deepseek-chat, deepseek-coder |
| Mistral | `MISTRAL_API_KEY` | mistral-large, mistral-medium |

---

### Phase 3: Probe Worker (P1)

**Goal**: Implement main probe worker with multi-turn conversation

**Files to Create**:
1. `workers/probe.py` - Main probe worker

**Input Contract** (stdin):
```typescript
interface ProbeWorkerInput {
  runId: string;
  scenarioId: string;
  modelId: string;
  modelVersion?: string;
  scenario: {
    preamble: string;
    prompt: string;
    followups: Array<{ label: string; prompt: string; }>;
  };
  config: {
    temperature: number;
    maxTokens: number;
    maxTurns: number;
  };
}
```

**Output Contract** (stdout):
```typescript
interface ProbeWorkerOutput {
  success: true;
  transcript: {
    turns: Array<{
      turnNumber: number;
      promptLabel: string;
      probePrompt: string;
      targetResponse: string;
      inputTokens?: number;
      outputTokens?: number;
    }>;
    totalInputTokens: number;
    totalOutputTokens: number;
    modelVersion?: string;
    startedAt: string;
    completedAt: string;
  };
} | {
  success: false;
  error: {
    message: string;
    code: string;
    retryable: boolean;
    details?: string;
  };
}
```

---

### Phase 4: TypeScript Handler Update (P1)

**Goal**: Update probe handler to call Python worker and save transcript

**Files to Modify**:
1. `apps/api/src/queue/handlers/probe-scenario.ts`

**Changes**:
- Remove mock transcript generation
- Call `spawnPython('workers/probe.py', input)`
- Parse result and save to database
- Handle errors with retry classification

**New Service** (optional, can inline):
- `apps/api/src/services/transcript/create.ts` - Create transcript record

---

### Phase 5: Health Check & Analyze Stub (P2)

**Goal**: Add worker health verification and analyze stub

**Files to Create**:
1. `workers/health_check.py` - Verify Python environment
2. `workers/analyze_basic.py` - Stub for Tier 1 analysis

**Health Check Verifies**:
- Python version >= 3.10
- Required packages installed (requests, pyyaml)
- API keys present (warning only if missing)

---

### Phase 6: Python Tests (P2)

**Goal**: Achieve 80%+ coverage on Python workers

**Files to Create**:
1. `workers/tests/conftest.py` - Shared fixtures, mock adapters
2. `workers/tests/test_probe.py` - Probe worker tests
3. `workers/tests/test_llm_adapters.py` - Adapter tests (all mocked)
4. `workers/tests/test_errors.py` - Error classification tests

**Test Strategy**:
- Mock all HTTP calls (no real LLM calls in tests)
- Test each error type (rate limit, auth, timeout)
- Test multi-turn conversation flow
- Test JSON serialization edge cases

---

### Phase 7: Integration Testing (P2)

**Goal**: End-to-end test with mocked LLM

**Tests to Add**:
1. `apps/api/tests/queue/probe-scenario.integration.test.ts`

**Approach**:
- Create test definition and run
- Queue probe job
- Verify transcript created with correct fields
- Verify progress updated

---

## Job Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ GraphQL: startRun                                                            │
│ ↓                                                                            │
│ Creates Run (PENDING), queues probe_scenario jobs for each model-scenario    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PgBoss: probe_scenario job                                                   │
│ data: { runId, scenarioId, modelId, config }                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TypeScript Handler: probe-scenario.ts                                        │
│                                                                              │
│ 1. Check run status (skip if cancelled/completed)                           │
│ 2. Fetch scenario content from database                                     │
│ 3. Build ProbeWorkerInput with preamble + prompt + followups                │
│ 4. Call spawnPython('workers/probe.py', input)                              │
│ 5. Parse result                                                              │
│    └── Success: Create transcript, increment progress.completed             │
│    └── Failure: Log error, maybe increment progress.failed                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Python Worker: probe.py                                                      │
│                                                                              │
│ 1. Read JSON from stdin                                                     │
│ 2. Resolve LLM adapter for modelId                                          │
│ 3. Execute multi-turn conversation:                                         │
│    └── Turn 1: scenario prompt → response                                   │
│    └── Turn 2-N: followup prompts → responses                               │
│ 4. Return JSON to stdout:                                                   │
│    └── Success: { success: true, transcript: {...} }                        │
│    └── Error: { success: false, error: {...} }                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Database: transcripts table                                                  │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ id: cuid()                                                              ││
│ │ runId: <from job>                                                       ││
│ │ scenarioId: <from job>                                                  ││
│ │ modelId: "gpt-4"                                                        ││
│ │ modelVersion: "gpt-4-0125-preview" (if available)                       ││
│ │ content: { turns: [...], schemaVersion: 1 }                             ││
│ │ turnCount: 3                                                            ││
│ │ tokenCount: 1250                                                        ││
│ │ durationMs: 4523                                                        ││
│ │ definitionSnapshot: { ... } (copy of definition at run time)            ││
│ │ createdAt: now()                                                        ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | No* | OpenAI API key |
| `ANTHROPIC_API_KEY` | No* | Anthropic API key |
| `GOOGLE_API_KEY` | No* | Google Gemini API key |
| `XAI_API_KEY` | No* | xAI Grok API key |
| `DEEPSEEK_API_KEY` | No* | DeepSeek API key |
| `MISTRAL_API_KEY` | No* | Mistral API key |
| `PYTHON_WORKER_TIMEOUT` | No | Python process timeout (default: 300000ms) |
| `PYTHON_WORKER_DEBUG` | No | Enable debug logging in workers |

\* At least one API key required to run real LLM jobs

---

## Testing Strategy

### Unit Tests (Python)

| Test File | Coverage Target | Description |
|-----------|-----------------|-------------|
| `test_probe.py` | 90% | Input parsing, output formatting, turn logic |
| `test_llm_adapters.py` | 85% | Each provider adapter (mocked HTTP) |
| `test_errors.py` | 100% | Error classification logic |

### Integration Tests (TypeScript)

| Test File | Coverage Target | Description |
|-----------|-----------------|-------------|
| `probe-scenario.integration.test.ts` | 80% | End-to-end with mocked Python |

### Mock Strategy

```python
# conftest.py
@pytest.fixture
def mock_openai(monkeypatch):
    def mock_post(*args, **kwargs):
        return MockResponse({
            "choices": [{"message": {"content": "Mock response"}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 50}
        })
    monkeypatch.setattr(requests, "post", mock_post)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Python not available | Health check on first job, clear error message |
| API key missing | Continue with warning, fail job with clear error |
| LLM timeout | 5-minute timeout, retryable error |
| Large response | Handle up to 100KB, truncate with warning if larger |
| Provider API change | Version pin adapters, integration tests catch breaks |

---

## Dependencies

| Dependency | Stage | Status |
|------------|-------|--------|
| `spawnPython` utility | Stage 5 | Complete |
| PgBoss job handlers | Stage 5 | Complete |
| `isRetryableError` function | Stage 5 | Complete |
| Transcripts table | Stage 2 | Complete |
| Run progress tracking | Stage 5 | Complete |

---

## Out of Scope (Deferred)

| Feature | Deferred To |
|---------|-------------|
| Full Tier 1 analysis | Stage 11 |
| Docker containerization | Stage 17 |
| Worker auto-scaling | Future |
| Response streaming | Future |
| LLM response caching | Future |

---

## Next Steps

1. Review this plan for technical accuracy
2. When ready for task breakdown, invoke the **feature-tasks** skill
3. Or refine architecture decisions if needed
