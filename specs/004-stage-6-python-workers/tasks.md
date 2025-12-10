# Tasks: Stage 6 - Python Worker Integration

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2, US3, etc.)
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize Python workers directory and dependencies

- [X] T001 Create `cloud/workers/` directory structure per plan.md
- [X] T002 Create `cloud/workers/requirements.txt` with Python dependencies
- [X] T003 [P] Create `cloud/workers/__init__.py` package init
- [X] T004 [P] Create `cloud/workers/common/__init__.py` package init

**Checkpoint**: Workers directory exists with basic structure

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core utilities that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

### Error Handling & Logging

- [X] T005 Create `cloud/workers/common/errors.py` with WorkerError, LLMError, RetryableError classes
- [X] T006 [P] Create `cloud/workers/common/logging.py` with structured JSON logger (outputs to stderr)
- [X] T007 [P] Create `cloud/workers/common/config.py` with environment variable loading

### LLM Adapters

- [X] T008 Create `cloud/workers/common/llm_adapters.py` base adapter class and registry
- [X] T009 [P] Add OpenAI adapter to `cloud/workers/common/llm_adapters.py` (adapted from src/llm_adapters.py)
- [X] T010 [P] Add Anthropic adapter to `cloud/workers/common/llm_adapters.py`
- [X] T011 [P] Add Google Gemini adapter to `cloud/workers/common/llm_adapters.py`
- [X] T012 [P] Add xAI adapter to `cloud/workers/common/llm_adapters.py`
- [X] T013 [P] Add DeepSeek adapter to `cloud/workers/common/llm_adapters.py`
- [X] T014 [P] Add Mistral adapter to `cloud/workers/common/llm_adapters.py`

### Adapter Tests

- [X] T015 Create `cloud/workers/tests/__init__.py` and `cloud/workers/tests/conftest.py` with mock fixtures
- [X] T016 [P] Create `cloud/workers/tests/test_errors.py` with error classification tests
- [X] T017 [P] Create `cloud/workers/tests/test_llm_adapters.py` with mocked HTTP tests for each provider

**Checkpoint**: Foundation ready - adapters working with mocked HTTP, error handling in place

---

## Phase 3: User Story 1 - Execute Probe Job with Real LLM (Priority: P1) 🎯 MVP

**Goal**: probe_scenario jobs call real LLM providers and return actual responses

**Independent Test**: Start a run with single scenario/model, verify transcript contains actual LLM response

### Python Probe Worker

- [X] T018 [US1] Create `cloud/workers/probe.py` with stdin JSON parsing and stdout JSON output
- [X] T019 [US1] Implement multi-turn conversation logic in `cloud/workers/probe.py`
- [X] T020 [US1] Add token counting (tiktoken for OpenAI, estimate for others) to probe.py
- [X] T021 [US1] Add timing capture (startedAt, completedAt) to probe.py output

### Probe Worker Tests

- [X] T022 [US1] Create `cloud/workers/tests/test_probe.py` with input parsing tests
- [X] T023 [P] [US1] Add multi-turn conversation tests to test_probe.py
- [X] T024 [P] [US1] Add token counting tests to test_probe.py
- [X] T025 [P] [US1] Add error handling tests (LLM failures) to test_probe.py

**Checkpoint**: User Story 1 Python side complete - probe.py works standalone via stdin/stdout

---

## Phase 4: User Story 2 - Save Transcripts to Database (Priority: P1) 🎯 MVP

**Goal**: Completed probe results saved to database with all required fields

**Independent Test**: Complete a probe job, query database for transcript, verify content matches

### TypeScript Handler Update

- [X] T026 [US2] Update `cloud/apps/api/src/queue/handlers/probe-scenario.ts` to fetch scenario from database
- [X] T027 [US2] Add scenario content building (preamble, prompt, followups) to probe-scenario.ts
- [X] T028 [US2] Replace mock transcript with `spawnPython('workers/probe.py', input)` call
- [X] T029 [US2] Add transcript creation logic after successful Python execution
- [X] T030 [US2] Add definition snapshot capture (copy definition.content to transcript)

### Transcript Service (Optional extraction)

- [X] T031 [US2] Create `cloud/apps/api/src/services/transcript/create.ts` for transcript persistence
- [X] T032 [P] [US2] Add transcript validation (required fields, content structure) to create.ts

### Integration Tests

- [X] T033 [US2] Create `cloud/apps/api/tests/queue/probe-scenario.integration.test.ts`
- [X] T034 [P] [US2] Add test: probe job creates transcript with correct fields
- [X] T035 [P] [US2] Add test: progress.completed increments after transcript save
- [X] T036 [P] [US2] Add test: concurrent job completions don't cause race conditions

**Checkpoint**: User Story 2 complete - end-to-end probe jobs save transcripts to database

---

## Phase 5: User Story 3 - Handle LLM Provider Errors (Priority: P1)

**Goal**: Transient failures retry, permanent failures logged clearly

**Independent Test**: Inject simulated rate limit error, verify job retries with backoff

### Python Error Handling

- [X] T037 [US3] Add retry classification to `cloud/workers/common/errors.py` (RATE_LIMIT, AUTH_ERROR, TIMEOUT, etc.)
- [X] T038 [US3] Update probe.py error output to include `retryable: boolean` flag
- [X] T039 [US3] Add stderr capture for detailed error context in probe.py

### TypeScript Error Handling

- [X] T040 [US3] Update `cloud/apps/api/src/queue/handlers/probe-scenario.ts` to use Python `retryable` flag
- [X] T041 [US3] Add stderr logging when Python process fails in probe-scenario.ts
- [X] T042 [US3] Add test: rate limit errors (429) trigger retry
- [X] T043 [P] [US3] Add test: auth errors (401/403) fail immediately
- [X] T044 [P] [US3] Add test: Python crash captured and logged

**Checkpoint**: User Story 3 complete - robust error handling with retry classification

---

## Phase 6: User Story 4 - Verify Worker Health on Startup (Priority: P2)

**Goal**: Misconfigured deployments fail fast with clear errors

**Independent Test**: Start API server, check logs for worker health check results

- [X] T045 [US4] Create `cloud/workers/health_check.py` with Python version and package verification
- [X] T046 [US4] Add API key presence check (warning only) to health_check.py
- [X] T047 [US4] Add lazy health check call on first probe job in probe-scenario.ts
- [X] T048 [US4] Cache health check result to avoid repeated verification
- [X] T049 [US4] Create `cloud/workers/tests/test_health_check.py` with environment verification tests

**Checkpoint**: User Story 4 complete - health check verifies Python environment

---

## Phase 7: User Story 5 - Support Multiple LLM Providers (Priority: P1)

**Goal**: Run scenarios against various LLM providers for comparison

**Independent Test**: Start run with models from 3 different providers, verify all complete

- [X] T050 [US5] Add provider auto-detection to probe.py based on model ID
- [X] T051 [US5] Add end-to-end test with multiple providers (mocked) in test_probe.py
- [X] T052 [US5] Add clear error message for unsupported provider
- [X] T053 [US5] Add clear error message for missing API key
- [X] T054 [P] [US5] Add integration test: multi-provider run in probe-scenario.integration.test.ts

**Checkpoint**: User Story 5 complete - all 6 providers functional

---

## Phase 8: User Story 6 - Capture Model Version Information (Priority: P2)

**Goal**: Model version captured for research reproducibility

**Independent Test**: Complete probe job, verify transcript includes model_version field

- [X] T055 [US6] Extract model version from OpenAI API response in llm_adapters.py
- [X] T056 [P] [US6] Extract model version from Anthropic API response (if available)
- [X] T057 [P] [US6] Extract model version from Google API response (if available)
- [X] T058 [US6] Pass model_version through probe.py output to transcript record
- [X] T059 [US6] Add test: model_version captured when available, null when not

**Checkpoint**: User Story 6 complete - model version tracking functional

---

## Phase 9: User Story 7 - Analyze Basic Tier 1 Stats (Priority: P3)

**Goal**: Basic analysis triggered after run completion (stub)

**Independent Test**: Complete a run, verify analyze_basic job queued and stub completes

- [X] T060 [US7] Create `cloud/workers/analyze_basic.py` stub (returns placeholder success)
- [X] T061 [US7] Update analyze-basic handler to call spawnPython in `cloud/apps/api/src/queue/handlers/analyze-basic.ts`
- [X] T062 [US7] Add test: analyze_basic job queued when run completes
- [X] T063 [US7] Add test: stub returns success, analysis_results record created with placeholder

**Checkpoint**: User Story 7 complete - analysis stub in place for Stage 11

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Validation, documentation, coverage checks

### Test Coverage

- [X] T064 Run pytest with coverage report on `cloud/workers/` - verify 80%+ coverage (86%)
- [X] T065 Run vitest with coverage on probe-scenario handler - verify 80%+ coverage (93.2%)

### Validation

- [ ] T066 Run manual validation per quickstart.md with real LLM API key (requires API keys)
- [ ] T067 Verify all 6 LLM providers work with actual API calls (requires API keys)
- [X] T068 Review logs for structured JSON output compliance (verified via test output)

### Documentation

- [X] T069 Update `cloud/CLAUDE.md` if any new patterns established (no changes needed)
- [X] T070 Add inline code comments for complex adapter logic (complete - adapters well documented)

**Checkpoint**: Stage 6 complete - ready for Stage 7 (Frontend Foundation)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    └── Phase 2 (Foundation) ← BLOCKS all user stories
            │
            ├── Phase 3 (US1: Execute Probe) ← MVP
            │       └── Phase 4 (US2: Save Transcripts) ← MVP
            │               └── Phase 5 (US3: Error Handling)
            │
            ├── Phase 6 (US4: Health Check) ← can run parallel to US1-3
            │
            ├── Phase 7 (US5: Multi-Provider) ← depends on US1
            │
            ├── Phase 8 (US6: Model Version) ← can run parallel
            │
            └── Phase 9 (US7: Analyze Stub) ← can run after US2
                    │
                    └── Phase 10 (Polish) ← depends on all user stories
```

### Critical Path (MVP)

The minimum viable implementation:
1. Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

After critical path, other phases can proceed in parallel.

### Parallel Opportunities

- **Within phases**: Tasks marked [P] can run in parallel
- **Across phases**:
  - US4 (Health Check) can run parallel to US1-3
  - US6 (Model Version) can run parallel to other stories
  - US7 (Analyze Stub) can start after US2 completes

### User Story Independence

| Story | Depends On | Can Run Parallel With |
|-------|------------|----------------------|
| US1 (Probe) | Foundation | - |
| US2 (Save) | US1 | - |
| US3 (Errors) | US2 | - |
| US4 (Health) | Foundation | US1, US2, US3 |
| US5 (Multi-Provider) | US1 | US4, US6 |
| US6 (Model Version) | Foundation | US1-5 |
| US7 (Analyze) | US2 | US4-6 |

---

## Task Statistics

| Metric | Count |
|--------|-------|
| **Total Tasks** | 70 |
| **Setup** | 4 |
| **Foundation** | 13 |
| **User Story 1 (MVP)** | 8 |
| **User Story 2 (MVP)** | 11 |
| **User Story 3** | 8 |
| **User Story 4** | 5 |
| **User Story 5** | 5 |
| **User Story 6** | 5 |
| **User Story 7** | 4 |
| **Polish** | 7 |
| **Parallel Opportunities** | 28 tasks marked [P] |
