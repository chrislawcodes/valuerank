# Stage 6: Python Worker Integration

> Part of [High-Level Implementation Plan](../high-level.md)
>
> Must adhere to [Project Constitution](../../CLAUDE.md)
>
> Builds on: [Stage 5 Queue System](../003-stage-5-queue/spec.md) (complete)
>
> Design reference: [API & Queue System](../../docs/api-queue-system.md#worker-architecture-typescript-orchestrator--python)

**Goal:** Connect existing Python pipeline code to the TypeScript orchestrator, enabling `probe_scenario` jobs to execute real LLM calls and save transcripts to the database.

---

## Deliverables Summary

| Deliverable | Description |
|-------------|-------------|
| Python workers directory | `cloud/workers/` with structured Python scripts |
| `probe.py` worker | Scenario probing via JSON stdin/stdout, calls LLM providers |
| `analyze_basic.py` worker | Tier 1 analysis (stub, full implementation Stage 11) |
| Shared LLM adapters | Adapted from existing `src/llm_adapters.py` for cloud workers |
| Transcript storage | Save LLM responses to database after job completion |
| Error handling | Proper error classification, retry-awareness, failure reporting |
| Worker health check | Verify Python environment and dependencies on startup |
| LLM provider config | Environment-based configuration for API keys |

---

## User Scenarios & Testing

### User Story 1 - Execute Probe Job with Real LLM (Priority: P1)

As a user who starts a run, I need probe jobs to actually call LLM providers so that I get real AI responses in my transcripts.

**Why this priority**: This is the core purpose of Stage 6 - without real LLM execution, the system produces only mock data.

**Independent Test**: Start a run with a single scenario and model, verify transcript contains actual LLM response content (not mock placeholder).

**Acceptance Scenarios**:

1. **Given** a queued `probe_scenario` job with valid model ID, **When** job executes, **Then** Python worker calls the correct LLM provider and returns response
2. **Given** probe job with `modelId: "gpt-4"`, **When** job executes, **Then** OpenAI adapter is used via OPENAI_API_KEY
3. **Given** probe job with `modelId: "claude-3-sonnet"`, **When** job executes, **Then** Anthropic adapter is used via ANTHROPIC_API_KEY
4. **Given** probe job with `modelId: "gemini-1.5-pro"`, **When** job executes, **Then** Google adapter is used via GOOGLE_API_KEY
5. **Given** probe job with scenario prompt and followup turns, **When** job executes, **Then** multi-turn conversation is completed
6. **Given** successful LLM response, **When** Python returns, **Then** transcript content includes all conversation turns
7. **Given** LLM response with special characters or unicode, **When** serializing to JSON, **Then** content is preserved without corruption

---

### User Story 2 - Save Transcripts to Database (Priority: P1)

As a user, I need completed probe results saved to the database so that I can view and analyze them later.

**Why this priority**: Without persistence, all LLM responses are lost - the system would be useless.

**Independent Test**: Complete a probe job, query database for transcript, verify content matches LLM response.

**Acceptance Scenarios**:

1. **Given** probe job returns successfully, **When** orchestrator processes result, **Then** transcript record created in database
2. **Given** transcript creation, **When** record saved, **Then** includes: run_id, scenario_id, model_id, model_version, content
3. **Given** transcript creation, **When** record saved, **Then** includes definition_snapshot (copy of definition at run time)
4. **Given** multi-turn conversation, **When** transcript saved, **Then** all turns stored in structured format (JSONB)
5. **Given** successful transcript save, **When** checking run progress, **Then** completed count incremented
6. **Given** transcript with timing data, **When** saved, **Then** includes started_at, completed_at, duration_ms
7. **Given** concurrent job completions, **When** saving transcripts, **Then** no race conditions or duplicate records

---

### User Story 3 - Handle LLM Provider Errors (Priority: P1)

As a system operator, I need LLM errors handled gracefully so that transient failures retry and permanent failures are logged clearly.

**Why this priority**: LLM APIs have rate limits, timeouts, and occasional failures - robust error handling is essential.

**Independent Test**: Inject simulated rate limit error, verify job retries with backoff, then succeeds on retry.

**Acceptance Scenarios**:

1. **Given** LLM rate limit error (429), **When** job fails, **Then** error is marked retryable and job will retry
2. **Given** LLM timeout error, **When** job fails, **Then** error is marked retryable with exponential backoff
3. **Given** LLM server error (5xx), **When** job fails, **Then** error is marked retryable
4. **Given** authentication error (401/403), **When** job fails, **Then** error is NOT retryable (permanent failure)
5. **Given** invalid model ID, **When** job fails, **Then** error is NOT retryable (validation failure)
6. **Given** job exceeds max retries, **When** final failure, **Then** run.progress.failed incremented
7. **Given** any job failure, **When** error logged, **Then** includes job_id, run_id, model_id, error message
8. **Given** Python process crashes, **When** detected by orchestrator, **Then** job marked as failed with stderr captured

---

### User Story 4 - Verify Worker Health on Startup (Priority: P2)

As a system operator, I need worker health verified at startup so that misconfigured deployments fail fast with clear errors.

**Why this priority**: Important for operations but system can function without it - errors will surface when jobs run.

**Independent Test**: Start API server, check logs for worker health check results, verify Python environment validated.

**Acceptance Scenarios**:

1. **Given** API server starting, **When** workers initialized, **Then** Python interpreter availability verified
2. **Given** Python available, **When** health check runs, **Then** required packages verified (pyyaml, requests)
3. **Given** missing Python package, **When** health check fails, **Then** clear error message logged with fix instructions
4. **Given** no LLM API keys configured, **When** health check runs, **Then** warning logged (jobs will fail at runtime)
5. **Given** health check passes, **When** server starts, **Then** log message confirms workers ready
6. **Given** health check fails, **When** configurable to block startup, **Then** server exits with error code

---

### User Story 5 - Support Multiple LLM Providers (Priority: P1)

As a user, I need to run scenarios against various LLM providers so that I can compare model behavior across vendors.

**Why this priority**: Multi-provider support is core to ValueRank's value proposition.

**Independent Test**: Start run with models from 3 different providers, verify all complete with provider-appropriate responses.

**Acceptance Scenarios**:

1. **Given** job with OpenAI model, **When** executing, **Then** uses OpenAI Chat Completions API
2. **Given** job with Anthropic model, **When** executing, **Then** uses Anthropic Messages API
3. **Given** job with Google model, **When** executing, **Then** uses Gemini Generative Language API
4. **Given** job with xAI model, **When** executing, **Then** uses xAI Grok API
5. **Given** job with DeepSeek model, **When** executing, **Then** uses DeepSeek API
6. **Given** job with Mistral model, **When** executing, **Then** uses Mistral API
7. **Given** unknown model provider, **When** job executes, **Then** clear error indicating unsupported provider
8. **Given** API key missing for provider, **When** job executes, **Then** clear error indicating missing credential

---

### User Story 6 - Capture Model Version Information (Priority: P2)

As a researcher, I need model version captured with each transcript so that I can track behavior changes across model updates.

**Why this priority**: Important for research reproducibility but not blocking core functionality.

**Independent Test**: Complete probe job, verify transcript includes both model_id and model_version fields.

**Acceptance Scenarios**:

1. **Given** model ID like "gemini-1.5-pro", **When** transcript saved, **Then** model_id field populated
2. **Given** model version available from API response, **When** transcript saved, **Then** model_version field populated
3. **Given** model version not available, **When** transcript saved, **Then** model_version is null (not error)
4. **Given** future re-run of same scenario, **When** comparing transcripts, **Then** can filter by model_version

---

### User Story 7 - Analyze Basic Tier 1 Stats (Priority: P3)

As a user, I need basic analysis triggered after run completion so that I can see summary statistics immediately.

**Why this priority**: Full analysis is Stage 11 - this stage provides a stub that validates the job flow.

**Independent Test**: Complete a run, verify `analyze_basic` job queued, verify stub completes without error.

**Acceptance Scenarios**:

1. **Given** all probe jobs complete for a run, **When** run transitions to COMPLETED, **Then** `analyze_basic` job queued
2. **Given** `analyze_basic` job executes, **When** Python worker runs, **Then** stub returns success (placeholder)
3. **Given** `analyze_basic` stub completes, **When** checking analysis_results, **Then** record created with placeholder data
4. **Given** analyze job fails, **When** checking run status, **Then** run remains COMPLETED (analysis failure doesn't block)

---

## Edge Cases

- **Empty scenario prompt**: Should fail validation before LLM call (not billable)
- **Very long LLM response**: Must handle responses up to 100KB without truncation
- **Unicode/emoji in response**: JSON serialization must preserve all characters
- **Concurrent API calls**: Rate limit handling must work across parallel jobs
- **Python process timeout**: Jobs killed after 5 minutes should be marked failed
- **Orphaned Python processes**: Should be killed if orchestrator restarts
- **API key rotation**: Should pick up new keys without restart (read from env each call)
- **Network partition**: Partial failures should be retryable
- **Response with no content**: Should be treated as error (model refused to respond)
- **Malformed JSON from Python**: Orchestrator should log stderr and fail gracefully

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST execute Python workers via `spawnPython` utility from Stage 5
- **FR-002**: Workers MUST communicate via JSON on stdin (input) and stdout (output)
- **FR-003**: System MUST support LLM providers: OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral
- **FR-004**: System MUST read API keys from environment variables (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
- **FR-005**: System MUST save transcript to database after successful probe completion
- **FR-006**: Transcript MUST include: run_id, scenario_id, model_id, content, turns, timestamps
- **FR-007**: System MUST classify errors as retryable or permanent (per isRetryableError from Stage 5)
- **FR-008**: System MUST capture Python stderr on failure for debugging
- **FR-009**: System MUST queue `analyze_basic` job when run completes (stub implementation)
- **FR-010**: System MUST log all job executions with context (job_id, run_id, model_id)
- **FR-011**: Python workers MUST be stateless (no persistent state between calls)
- **FR-012**: System MUST handle multi-turn conversations (scenario prompt + followups)
- **FR-013**: System MUST timeout Python processes after configurable duration (default 5 minutes)
- **FR-014**: System SHOULD verify Python environment on startup (health check)
- **FR-015**: System SHOULD capture model_version when available from provider response
- **FR-016**: Workers SHOULD reuse existing adapter logic from `src/llm_adapters.py`

### Non-Functional Requirements

- **NFR-001**: Probe job execution MUST complete within 5 minutes per scenario
- **NFR-002**: Python worker startup MUST complete within 2 seconds
- **NFR-003**: JSON serialization/deserialization MUST handle payloads up to 1MB
- **NFR-004**: All worker code MUST have 80%+ test coverage (per CLAUDE.md)
- **NFR-005**: Worker files MUST be under 400 lines each (per CLAUDE.md)
- **NFR-006**: All logging MUST use structured JSON format via shared logger
- **NFR-007**: Error messages MUST be actionable (include what failed and how to fix)

---

## Success Criteria

- **SC-001**: Can start a run via GraphQL and receive actual LLM responses (not mock)
- **SC-002**: Transcripts saved to database with all required fields populated
- **SC-003**: All 6 LLM providers (OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral) functional
- **SC-004**: Rate limit errors retry automatically with exponential backoff
- **SC-005**: Authentication errors fail immediately without retry
- **SC-006**: Python worker crashes are handled gracefully with error logging
- **SC-007**: Worker health check verifies Python environment on startup
- **SC-008**: 80%+ test coverage on worker code and transcript storage
- **SC-009**: Run completes end-to-end: start → probe jobs → transcripts saved → status COMPLETED
- **SC-010**: Multi-provider run works (e.g., GPT-4 + Claude + Gemini in same run)

---

## Key Entities

### Python Worker Input (stdin)

```typescript
interface ProbeWorkerInput {
  runId: string;
  scenarioId: string;
  modelId: string;              // e.g., "gpt-4", "claude-3-sonnet"
  modelVersion?: string;        // e.g., "gpt-4-0125-preview"
  scenario: {
    preamble: string;           // System context
    prompt: string;             // Initial scenario prompt
    followups: Array<{          // Follow-up turns
      label: string;
      prompt: string;
    }>;
  };
  config: {
    temperature: number;
    maxTokens: number;
    maxTurns: number;
  };
}
```

### Python Worker Output (stdout)

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
    modelVersion?: string;      // Captured from API response if available
    startedAt: string;          // ISO timestamp
    completedAt: string;        // ISO timestamp
  };
} | {
  success: false;
  error: {
    message: string;
    code: string;               // e.g., "RATE_LIMIT", "AUTH_ERROR", "TIMEOUT"
    retryable: boolean;
    details?: string;           // Stack trace or additional context
  };
}
```

### Transcript Database Record

```typescript
interface TranscriptRecord {
  id: string;
  runId: string;
  scenarioId: string;
  modelId: string;
  modelVersion: string | null;
  definitionSnapshot: Json;     // Copy of definition at run time
  content: string;              // Markdown-formatted transcript
  turns: Json;                  // Structured turn data
  turnCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  createdAt: Date;
  lastAccessedAt: Date;
}
```

---

## File Structure

```
cloud/
├── apps/api/src/
│   └── queue/
│       └── handlers/
│           └── probe-scenario.ts  # Updated: calls spawnPython with real worker
│
└── workers/
    ├── __init__.py
    ├── probe.py                   # Main probe worker (stdin/stdout JSON)
    ├── analyze_basic.py           # Stub for Tier 1 analysis
    ├── common/
    │   ├── __init__.py
    │   ├── llm_adapters.py        # Adapted from src/llm_adapters.py
    │   ├── config.py              # Environment config loading
    │   ├── errors.py              # Error types with retryable classification
    │   └── logging.py             # Structured JSON logging
    ├── requirements.txt           # Python dependencies
    └── tests/
        ├── __init__.py
        ├── test_probe.py
        ├── test_llm_adapters.py
        └── test_errors.py
```

---

## Assumptions

1. **Python 3.10+** available in deployment environment
2. **API keys** provided via environment variables (not database)
3. **Multi-turn conversations** limited to 10 turns max per scenario
4. **Token counting** uses estimate, not exact (acceptable for cost tracking)
5. **Model version** may not be available from all providers (field is optional)
6. **Retry logic** handled by PgBoss (Python just classifies error as retryable)
7. **analyze_basic** is stub only - full implementation in Stage 11
8. **Existing `src/llm_adapters.py`** is reference, not direct import (adapted copy)

---

## Constitution Compliance

**Status**: PASS

Validated against [CLAUDE.md](../../CLAUDE.md):

| Requirement | Implementation |
|-------------|----------------|
| **File Size < 400 lines** | Split workers: probe.py, llm_adapters.py, config.py, errors.py |
| **No `any` Types** | TypeScript interfaces defined for all Python I/O contracts |
| **Test Coverage 80%** | Python tests for workers, TypeScript tests for orchestrator |
| **No console.log** | Python uses structured JSON logging via common/logging.py |
| **Structured Logging** | All logs include job_id, run_id, model_id context |
| **Custom Error Classes** | Python errors.py with WorkerError, LLMError, etc. |

---

## Dependencies

- **Stage 1** (complete): TypeScript environment, logging infrastructure
- **Stage 2** (complete): Database schema with transcripts table
- **Stage 3** (complete): GraphQL API foundation
- **Stage 5** (complete): PgBoss queue, `spawnPython` utility, job handlers

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full Tier 1 analysis | Stage 11 - analyze_basic is stub only |
| Tier 2/3 analysis | Stage 11 - not implemented |
| Cost tracking per job | Stage 10 - experiment framework |
| Python container/Docker | Stage 17 - deployment |
| Worker auto-scaling | Future - single worker initially |
| LLM response caching | Future optimization |
| Streaming responses | Not needed for evaluation use case |

---

## Next Steps

1. Review this spec for accuracy
2. When ready for technical planning, invoke the **feature-plan** skill
3. Or ask clarifying questions if requirements need refinement
