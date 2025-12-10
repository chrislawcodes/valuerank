# Python Workers

> Part of [Cloud ValueRank Backend](./queue-system.md)
>
> See also: [preplanning/api-queue-system.md](../preplanning/api-queue-system.md) for architecture design

## Overview

Python workers handle computation-heavy tasks in Cloud ValueRank. They are **stateless scripts** spawned by the TypeScript orchestrator, communicating via **JSON over stdin/stdout**.

### Why Python?

| Reason | Description |
|--------|-------------|
| AI/ML ecosystem | NumPy, SciPy, tiktoken for accurate token counting |
| Multi-provider LLM support | Consistent adapter pattern across 6+ providers |
| Statistical analysis | Robust libraries for confidence intervals, correlation tests |
| Existing codebase | Reuses patterns from CLI pipeline |

## Worker Protocol

All workers follow a standard JSON protocol:

```
┌──────────────────┐          ┌──────────────────┐
│   TypeScript     │  stdin   │    Python        │
│   Orchestrator   │ ───────▶ │    Worker        │
│                  │  (JSON)  │                  │
│                  │ ◀─────── │                  │
│                  │  stdout  │                  │
│                  │  (JSON)  │                  │
└──────────────────┘          └──────────────────┘
                                    │
                                    │ stderr
                                    ▼
                              (structured logs)
```

### Input/Output Format

**Success Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "retryable": true,
    "details": "Optional additional context"
  }
}
```

## Worker Scripts

### probe.py

**Purpose:** Execute multi-turn LLM conversations for scenario evaluation.

**Location:** `workers/probe.py`

**Input:**
```json
{
  "runId": "uuid",
  "scenarioId": "uuid",
  "modelId": "claude-3-5-sonnet-20241022",
  "scenario": {
    "preamble": "System instructions...",
    "prompt": "The ethical dilemma scenario...",
    "followups": [
      { "label": "clarification_1", "prompt": "Follow-up question..." }
    ]
  },
  "config": {
    "temperature": 0.7,
    "maxTokens": 1024,
    "maxTurns": 10
  },
  "modelCost": {
    "costInputPerMillion": 3.0,
    "costOutputPerMillion": 15.0
  }
}
```

**Output (success):**
```json
{
  "success": true,
  "transcript": {
    "turns": [
      {
        "turnNumber": 1,
        "promptLabel": "scenario_prompt",
        "probePrompt": "The ethical dilemma...",
        "targetResponse": "After careful consideration...",
        "inputTokens": 245,
        "outputTokens": 512
      }
    ],
    "totalInputTokens": 1024,
    "totalOutputTokens": 1536,
    "modelVersion": "claude-3-5-sonnet-20241022",
    "startedAt": "2024-12-09T10:30:00Z",
    "completedAt": "2024-12-09T10:30:05Z",
    "costSnapshot": {
      "costInputPerMillion": 3.0,
      "costOutputPerMillion": 15.0,
      "inputTokens": 1024,
      "outputTokens": 1536,
      "estimatedCost": 0.026
    }
  }
}
```

**Key Features:**
- Multi-turn conversation support (initial prompt + followups)
- Token counting per turn and total
- Cost estimation when model pricing provided
- Model version tracking for reproducibility

### summarize.py

**Purpose:** Extract structured decision code from probe transcripts.

**Location:** `workers/summarize.py`

**Input:**
```json
{
  "transcriptId": "uuid",
  "modelId": "anthropic:claude-sonnet-4-20250514",
  "transcriptContent": {
    "turns": [
      {
        "probePrompt": "...",
        "targetResponse": "..."
      }
    ]
  }
}
```

**Output (success):**
```json
{
  "success": true,
  "summary": {
    "decisionCode": "4",
    "decisionText": "The AI prioritized human safety over economic concerns, citing the irreversible nature of potential harm..."
  }
}
```

**Decision Codes:**
| Code | Meaning |
|------|---------|
| `1` | Strong preference for option A |
| `2` | Mild preference for option A |
| `3` | Neutral/balanced |
| `4` | Mild preference for option B |
| `5` | Strong preference for option B |
| `other` | No clear numeric decision |

**Process:**
1. Extract numeric rating (1-5) from transcript using regex
2. Call LLM (Claude Sonnet) to generate 50-word explanation
3. Return structured decision code and text

### analyze_basic.py

**Purpose:** Compute Tier 1 statistical analysis (win rates, model agreement, dimension impact).

**Location:** `workers/analyze_basic.py`

**Input:**
```json
{
  "runId": "uuid",
  "transcripts": [
    {
      "id": "transcript-uuid",
      "modelId": "gpt-4",
      "scenarioId": "scenario-uuid",
      "summary": { "score": 4 },
      "scenario": {
        "name": "Hospital Resource Allocation",
        "dimensions": {
          "severity": 5,
          "reversibility": 2,
          "stakeholder_count": 100
        }
      }
    }
  ]
}
```

**Output (success):**
```json
{
  "success": true,
  "analysis": {
    "perModel": {
      "gpt-4": {
        "sampleSize": 50,
        "mean": 3.2,
        "stdDev": 0.8,
        "values": {}
      }
    },
    "modelAgreement": {
      "overallKappa": 0.65,
      "pairwise": { "gpt-4_vs_claude-3": 0.72 }
    },
    "dimensionAnalysis": {
      "severity": {
        "correlation": 0.45,
        "pValue": 0.02,
        "significant": true
      }
    },
    "mostContestedScenarios": [
      {
        "scenarioId": "uuid",
        "scenarioName": "Hospital Resource Allocation",
        "variance": 2.5,
        "modelScores": { "gpt-4": 4, "claude-3": 2 }
      }
    ],
    "visualizationData": {
      "decisionDistribution": {},
      "modelScenarioMatrix": []
    },
    "methodsUsed": {
      "winRateCI": "wilson_score",
      "modelComparison": "spearman_rho",
      "pValueCorrection": "holm_bonferroni",
      "effectSize": "cohens_d",
      "dimensionTest": "kruskal_wallis",
      "alpha": 0.05,
      "codeVersion": "1.0.0"
    },
    "warnings": [],
    "computedAt": "2024-12-09T10:35:00Z",
    "durationMs": 450
  }
}
```

**Analysis Components:**
- **perModel**: Mean, stdDev, sample size per model
- **modelAgreement**: Cohen's Kappa, Spearman correlation
- **dimensionAnalysis**: Which scenario dimensions correlate with decisions
- **mostContestedScenarios**: Highest variance across models
- **visualizationData**: Pre-computed data for frontend charts

### health_check.py

**Purpose:** Verify Python environment and dependencies before processing.

**Location:** `workers/health_check.py`

**Input:** Empty JSON object `{}`

**Output (success):**
```json
{
  "success": true,
  "health": {
    "pythonVersion": "3.11.5",
    "packages": {
      "requests": "2.31.0",
      "pyyaml": "6.0.1",
      "numpy": "1.24.3",
      "tiktoken": "0.5.1"
    },
    "apiKeys": {
      "openai": true,
      "anthropic": true,
      "google": false,
      "xai": false,
      "deepseek": false,
      "mistral": false
    },
    "warnings": []
  }
}
```

**Checks:**
- Python version >= 3.10
- Required packages installed (requests, pyyaml)
- Optional packages available (tiktoken, numpy)
- API keys configured per provider

## Common Modules

### common/llm_adapters.py

Provider abstraction layer supporting 6 LLM providers:

| Provider | Adapter Class | API Style |
|----------|--------------|-----------|
| OpenAI | `OpenAIAdapter` | OpenAI Chat Completions |
| Anthropic | `AnthropicAdapter` | Anthropic Messages |
| Google | `GeminiAdapter` | Gemini generateContent |
| xAI | `XAIAdapter` | OpenAI-compatible |
| DeepSeek | `DeepSeekAdapter` | OpenAI-compatible |
| Mistral | `MistralAdapter` | OpenAI-compatible |

**Usage:**
```python
from common.llm_adapters import generate

response = generate(
    model="claude-3-5-sonnet-20241022",
    messages=[
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Hello!"},
    ],
    temperature=0.7,
    max_tokens=1024,
)

print(response.content)        # "Hello! How can I help?"
print(response.input_tokens)   # 25
print(response.output_tokens)  # 12
print(response.model_version)  # "claude-3-5-sonnet-20241022"
```

**Provider Detection:**
- Explicit prefix: `anthropic:claude-3-sonnet` → Anthropic
- Pattern matching: `gpt-4` → OpenAI, `gemini` → Google

**Rate Limit Handling:**
- 429 responses trigger exponential backoff
- Retries: 30s, 60s, 90s, 120s delays
- Max 4 rate limit retries per request

### common/errors.py

Structured error types with retry classification:

```python
class ErrorCode(Enum):
    # Retryable
    RATE_LIMIT = "RATE_LIMIT"
    TIMEOUT = "TIMEOUT"
    NETWORK_ERROR = "NETWORK_ERROR"
    SERVER_ERROR = "SERVER_ERROR"

    # Non-retryable
    AUTH_ERROR = "AUTH_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    UNSUPPORTED_PROVIDER = "UNSUPPORTED_PROVIDER"
    MISSING_API_KEY = "MISSING_API_KEY"
    INVALID_RESPONSE = "INVALID_RESPONSE"

    # Unknown (retryable by default)
    UNKNOWN = "UNKNOWN"
```

**Error Classes:**
- `WorkerError` - Base error with `retryable` property
- `LLMError` - API errors with HTTP status code classification
- `ValidationError` - Input validation failures (non-retryable)
- `RetryableError` - Explicit network/timeout errors

### common/config.py

Environment configuration loading:

```python
from common.config import get_config

config = get_config()
if config.has_api_key("anthropic"):
    print(f"Anthropic key: {config.anthropic_api_key[:8]}...")
```

**Environment Variables:**
| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GOOGLE_API_KEY` | Google AI API key |
| `XAI_API_KEY` | xAI (Grok) API key |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `MISTRAL_API_KEY` | Mistral API key |

### common/logging.py

Structured JSON logging to stderr:

```python
from common.logging import get_logger

log = get_logger("probe")
log.info("Starting probe", runId=run_id, modelId=model_id)
log.error("Probe failed", err=error)
```

Output (to stderr):
```json
{"level": "info", "msg": "Starting probe", "runId": "abc", "modelId": "gpt-4", "ts": "..."}
```

### common/cost.py

Cost estimation utilities:

```python
from common.cost import create_cost_snapshot

snapshot = create_cost_snapshot(
    input_tokens=1024,
    output_tokens=512,
    cost_input_per_million=3.0,
    cost_output_per_million=15.0,
)
print(snapshot.estimated_cost)  # 0.0107
```

## Stats Module

Statistical analysis utilities in `workers/stats/`:

| Module | Purpose |
|--------|---------|
| `basic_stats.py` | Win rates, means, per-model aggregation |
| `confidence.py` | Wilson score confidence intervals |
| `model_comparison.py` | Cohen's Kappa, Spearman correlation |
| `dimension_impact.py` | Kruskal-Wallis tests for dimension effects |

**Statistical Methods:**

| Metric | Method | When Used |
|--------|--------|-----------|
| Win rate CI | Wilson score | Proportion confidence intervals |
| Model agreement | Spearman's rho | Ordinal correlation between models |
| Effect size | Cohen's d | Magnitude of differences |
| Dimension impact | Kruskal-Wallis | Non-parametric ANOVA |
| p-value correction | Holm-Bonferroni | Multiple comparison correction |

## Testing Workers

```bash
# From cloud/ directory
cd workers

# Run all tests
PYTHONPATH=. pytest tests/ -v

# Run specific test file
PYTHONPATH=. pytest tests/test_probe.py -v

# With coverage
PYTHONPATH=. pytest tests/ --cov=. --cov-report=term-missing
```

**Test Structure:**
```
workers/
├── tests/
│   ├── test_probe.py
│   ├── test_summarize.py
│   ├── test_analyze_basic.py
│   └── test_health_check.py
├── common/
│   └── tests/
│       ├── test_llm_adapters.py
│       └── test_errors.py
└── stats/
    └── tests/
        └── test_basic_stats.py
```

## Debugging Workers

### Running Workers Manually

```bash
# From cloud/ directory
echo '{"runId": "test", "scenarioId": "test", "modelId": "gpt-4", ...}' | \
  python3 workers/probe.py
```

### Viewing Worker Logs

Worker logs go to stderr as structured JSON:

```bash
# Run worker and capture logs
python3 workers/probe.py 2>worker.log < input.json
cat worker.log | jq '.'
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `MISSING_API_KEY` | API key not set | Export `ANTHROPIC_API_KEY`, etc. |
| `RATE_LIMIT` | Too many requests | Wait for backoff, check parallelism limits |
| `TIMEOUT` | Slow model response | Increase timeout in spawn options |
| `VALIDATION_ERROR` | Invalid input JSON | Check input structure matches schema |

## Source Files

| File | Purpose |
|------|---------|
| `workers/probe.py` | Multi-turn LLM conversation |
| `workers/summarize.py` | Decision extraction |
| `workers/analyze_basic.py` | Tier 1 statistical analysis |
| `workers/health_check.py` | Environment verification |
| `workers/common/llm_adapters.py` | Provider abstraction |
| `workers/common/errors.py` | Error types with retry classification |
| `workers/common/config.py` | Environment configuration |
| `workers/common/logging.py` | Structured JSON logging |
| `workers/common/cost.py` | Cost estimation |
| `workers/stats/basic_stats.py` | Win rates, aggregation |
| `workers/stats/confidence.py` | Confidence intervals |
| `workers/stats/model_comparison.py` | Model agreement metrics |
| `workers/stats/dimension_impact.py` | Dimension correlation analysis |
