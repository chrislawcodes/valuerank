# Data Model

> PostgreSQL schema for ValueRank.

**Schema location:** `cloud/packages/db/prisma/schema.prisma`

This document reflects the schema as of 2026-04. Use `npx prisma studio` or open the schema file directly for the authoritative view.

---

## Entity Groups

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AUTHENTICATION                                                           │
│   User ──< ApiKey                                                        │
│   User ──< AuditLog                                                      │
│   OAuthClient ──< OAuthRefreshToken                                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ REUSABLE CONTENT (domain building blocks)                                │
│                                                                           │
│   Preamble ──< PreambleVersion                                            │
│   LevelPreset ──< LevelPresetVersion                                      │
│   Domain ──< DomainContext                                                │
│   Domain ──< ValueStatement ──< ValueStatementVersion                     │
│   Domain + PreambleVersion + LevelPresetVersion + DomainContext           │
│     + ValueStatementVersion[]  ─►  DomainConfigSnapshot (fingerprinted)  │
│                                                                           │
│   Domain.default{PreambleVersion, LevelPresetVersion, Context, ModelIds}  │
│     — used when launching a new Run for that domain                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ CORE DOMAIN                                                               │
│                                                                           │
│   Definition ──< Scenario                                                 │
│   Definition ──< Run                                                      │
│   Definition ── parent (self-ref, version tree)                           │
│   Definition → Domain, DomainContext, PreambleVersion, LevelPresetVersion │
│                                                                           │
│   Tag ──< DefinitionTag, RunTag                                           │
│                                                                           │
│   Run → DomainConfigSnapshot (captured at launch)                         │
│   Run ──< Transcript                                                      │
│   Run ──< ProbeResult (success/failure per probe)                         │
│   Run ──< RunScenarioSelection                                            │
│   Run ──< AnalysisResult                                                  │
│                                                                           │
│   Transcript → Scenario                                                   │
│                                                                           │
│   AssumptionVignetteSelection  — keyed by (assumptionKey, definitionId)  │
│   AssumptionScenarioPair       — source/variant scenario links           │
│   AssumptionAnalysisSnapshot   — cached paired analysis                  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ EVALUATION GROUPS                                                         │
│                                                                           │
│   DomainEvaluation ──< DomainEvaluationRun ──> Run                        │
│   Experiment ──< Run, RunComparison (legacy, lightly used)                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ ANALYSIS CACHE                                                            │
│                                                                           │
│   AnalysisResult               (per Run, versioned by code_version)       │
│   AssumptionAnalysisSnapshot   (per assumptionKey × config)               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ LLM CONFIGURATION & COST VISIBILITY                                       │
│                                                                           │
│   LlmProvider ──< LlmModel                                                │
│   LlmProvider ──< ProviderBalanceSyncLog                                  │
│   LlmModel ──< ModelTokenStatistics (per model, optionally per def)       │
│                                                                           │
│   Rubric, Cohort, SystemSetting                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Authentication

### `users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | PK |
| `email` | string | unique |
| `password_hash` | string | bcrypt |
| `name` | string? | |
| `last_login_at`, `password_changed_at` | datetime? | |
| `created_at`, `updated_at` | datetime | |

Users own many audit relations (`createdBy…`, `deletedBy…`) on Definition, Run, Tag, LlmModel, DomainEvaluation, ProviderBalanceSyncLog.

### `api_keys`
| `id` · `user_id` · `name` · `key_hash` (unique) · `key_prefix` (varchar 12) · `last_used` · `expires_at` · `created_at` |

### `oauth_clients` / `oauth_refresh_tokens`

OAuth 2.1 Dynamic Client Registration support for MCP. Clients store `client_id`, hashed `client_secret`, redirect URIs, and scopes (`mcp:read mcp:write`). Refresh tokens store hash, client, user, scope, resource, and expiration.

---

## Reusable Content (Domain Building Blocks)

### `domains`
| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | PK |
| `name`, `normalized_name` (unique) | string | |
| `default_preamble_version_id`, `default_level_preset_version_id`, `default_context_id` | fk? | defaults used when starting a run for this domain |
| `default_model_ids` | string[] | |
| `sentence_prefix`, `label_prefix` | string? | UI display |
| `created_at`, `updated_at` | datetime | |

### `domain_contexts`
Freeform context blocks attached to a domain (e.g. “U.S. public K-12 schools, 2024”). Versioned by bumping `version`.

### `value_statements` / `value_statement_versions`
Per-domain canonical value definitions (one row per token), each with an append-only version history.

### `domain_config_snapshots`
Fingerprinted combination of (`preamble_version_id`, `level_preset_version_id`, `context_id`, `value_statement_version_ids[]`) for a domain. Unique on `(domain_id, fingerprint)`. A `Run` references the snapshot it launched under so analysis remains reproducible.

### `preambles` / `preamble_versions`
Shared system-prompt blocks. `PreambleVersion.version` is a user-facing label (e.g. a timestamp). Referenced by `Definition`, `Domain.default`, and `DomainConfigSnapshot`.

### `level_presets` / `level_preset_versions`
Canonical L1–L5 severity labels. Each version holds `l1..l5` strings. Referenced by `Definition`, `Domain.default`, and `DomainConfigSnapshot`.

---

## Core Domain

### `definitions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | PK |
| `parent_id` | fk → definitions? | version tree |
| `domain_id`, `domain_context_id` | fk? | domain linkage |
| `preamble_version_id`, `level_preset_version_id` | fk? | currently selected building blocks |
| `name` | string | |
| `content` | jsonb | see JSONB section |
| `expansion_progress`, `expansion_debug` | jsonb? | scenario-expansion state |
| `version` | int | internal revision counter |
| `created_by_user_id`, `deleted_by_user_id` | fk? | audit |
| `created_at`, `updated_at`, `last_accessed_at`, `deleted_at` | datetime | soft delete |

### `scenarios`
| `id` · `definition_id` · `name` · `content` jsonb · `orientation_flipped` bool · `created_at` · `deleted_at`? |

Scenarios are concrete variants generated from a definition. `orientation_flipped` marks order-reversed pairs used for order-effect analysis.

### `tags`, `definition_tags`, `run_tags`
Shared tag vocabulary; both definitions and runs can be tagged. `definition_tags` is soft-deletable; `run_tags` is hard-deletable.

### `runs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | PK |
| `name` | string? | human label |
| `definition_id` | fk | |
| `experiment_id` | fk? | legacy |
| `domain_config_snapshot_id` | fk? | captured at launch |
| `status` | `RunStatus` | PENDING, RUNNING, PAUSED, SUMMARIZING, COMPLETED, FAILED, CANCELLED |
| `run_category` | `RunCategory` | PILOT, PRODUCTION, REPLICATION, VALIDATION, UNKNOWN_LEGACY |
| `config` | jsonb | models, sample count, temperature, maxTurns, etc. |
| `progress`, `summarize_progress` | jsonb? | orchestrator tracking |
| `stalled_models` | string[] | pre-computed for UI alerts |
| `retention_days`, `archive_permanently` | int? / bool | retention policy |
| `created_by_user_id`, `deleted_by_user_id` | fk? | audit |
| `started_at`, `completed_at`, `created_at`, `updated_at`, `last_accessed_at`, `deleted_at` | datetime | |

**Run lifecycle:**
```
PENDING → RUNNING → SUMMARIZING → COMPLETED
                 ↘ PAUSED → RUNNING
                 ↘ FAILED
                 ↘ CANCELLED
```

### `transcripts`
| Column | Type | Notes |
|--------|------|-------|
| `id` | cuid | PK |
| `run_id`, `scenario_id` | fk | |
| `model_id`, `model_version` | string | |
| `sample_index` | int | 0..N-1 for multi-sample runs |
| `definition_snapshot` | jsonb? | definition as of run time |
| `content` | jsonb | messages + finishReason |
| `turn_count`, `token_count`, `duration_ms` | int | |
| `estimated_cost` | float? | USD |
| `decision_code` | string? | 1–5 rating or "other" |
| `decision_code_source` | string? | `deterministic` / `llm` / `manual` / `error` |
| `decision_text` | string? | LLM-generated summary |
| `decision_metadata` | jsonb? | structured extraction output (e.g. canonical meaning, compatibility) |
| `summarized_at` | datetime? | |
| `content_expires_at` | datetime? | content pruning |
| `created_at`, `last_accessed_at`, `deleted_at` | datetime | soft delete |

### `probe_results`
Per-probe success/failure record, separate from the transcript it produced. Used for dead-letter tracking and cost reporting.

| `id` · `run_id` · `scenario_id` · `model_id` · `sample_index` · `status` (`SUCCESS`/`FAILED`) · `transcript_id?` · `duration_ms?` · `input_tokens?` · `output_tokens?` · `error_code?` · `error_message?` · `retry_count` · `created_at` · `completed_at?` · `deleted_at?` |

Unique on `(run_id, scenario_id, model_id, sample_index)`.

### `run_scenario_selections`
Join table recording which scenarios were sampled into a run. Unique on `(run_id, scenario_id)`.

### Assumption / paired-vignette tables

- `assumption_vignette_selections` — `(assumption_key, definition_id)` pairs selected for a given assumption study.
- `assumption_scenario_pairs` — source ↔ variant scenario pairs for paired comparisons, with optional equivalence-review fields (`status`, `reviewed_by`, `reviewed_at`, `notes`).
- `assumption_analysis_snapshots` — cached analysis outputs per `(assumptionKey, analysisType, inputHash, configSignature)`, status `CURRENT` / `SUPERSEDED`.

---

## Evaluation Groups

### `domain_evaluations`
A coordinated batch of runs launched together for a domain, with one `config_snapshot` captured at launch and a `scope_category` (`PILOT`, `PRODUCTION`, `REPLICATION`, `VALIDATION`). Status follows `PENDING → RUNNING → COMPLETED | FAILED | CANCELLED`.

### `domain_evaluation_runs`
Join table `DomainEvaluation` ↔ `Run` (unique on `run_id`), freezing `definition_id`, `definition_name`, and `domain_id` as they were at launch time.

### `experiments`, `run_comparisons`
Scaffolded for future use. `experiments` groups runs for systematic comparison; `run_comparisons` stores delta analyses. Present in schema but lightly used in product today.

---

## Analysis Cache

### `analysis_results`
| `id` · `run_id` · `analysis_type` · `input_hash` · `code_version` · `output` jsonb · `status` (`CURRENT`/`SUPERSEDED`) · `created_at` · `deleted_at?` |

Caching pattern: compute `input_hash` over transcripts + config, look up by `(analysis_type, input_hash, code_version, status=CURRENT)`; compute on miss and mark the old row `SUPERSEDED`.

### `assumption_analysis_snapshots`
Same shape for paired-vignette analysis, keyed by `assumption_key` instead of `run_id`.

---

## LLM Configuration & Cost Visibility

### `llm_providers`
`id`, unique `name` (`openai`, `anthropic`, …), `display_name`, `max_parallel_requests`, `requests_per_minute`, `is_enabled`, `balance` (Decimal(10,4)), timestamps.

### `provider_balance_sync_logs`
Audit trail of manual balance entries: `system_balance_at_sync`, `entered_balance`, `delta`, `synced_at`, `created_by_user_id`.

### `llm_models`
| `id` · `provider_id` · `model_id` (API id) · `display_name` · `cost_input_per_million` · `cost_output_per_million` · `status` (`ACTIVE`/`DEPRECATED`) · `is_default` · `api_config` jsonb · `created_by_user_id` · timestamps |

Unique on `(provider_id, model_id)`.

### `model_token_statistics`
Rolling average input/output tokens per `(model_id, definition_id?)` for cost prediction. Populated by the `compute_token_stats` queue job.

### `rubrics`, `cohorts`, `system_settings`
- `rubrics` — values rubric versions (jsonb content, unique `version` int).
- `cohorts` — segment definitions (name + jsonb criteria). Currently scaffolded.
- `system_settings` — jsonb key/value store for runtime toggles.

---

## Audit Logging

### `audit_logs`
Append-only record of domain-object actions. `action` is a free string (`CREATE` / `UPDATE` / `DELETE` / `ACTION`), plus `entity_type`, `entity_id`, optional `user_id`, and jsonb `metadata`.

---

## JSONB Schema Patterns

### Definition content
```json
{
  "preamble": "You are being asked to reason about a moral dilemma...",
  "template": "A café owner faces [situation] where [severity]...",
  "dimensions": [
    {
      "name": "situation",
      "levels": [
        {"score": 1, "label": "minor",  "options": ["small spill", "loose tile"]},
        {"score": 5, "label": "severe", "options": ["gas leak", "structural damage"]}
      ]
    }
  ],
  "matchingRules": { "type": "cartesian" },
  "valueConflict": { "value1": "Physical_Safety", "value2": "Economics" }
}
```

### Run config
```json
{
  "models": ["gpt-4o", "claude-3-5-sonnet-latest"],
  "samplePercentage": 100,
  "samplesPerScenario": 1,
  "temperature": 0.7,
  "maxTurns": 1
}
```

### Run progress
```json
{
  "total": 20,
  "completed": 15,
  "failed": 1,
  "byModel": {
    "gpt-4o": {"completed": 8, "total": 10},
    "claude-3-5-sonnet-latest": {"completed": 7, "total": 10}
  }
}
```

### Transcript content
```json
{
  "messages": [
    {"role": "user", "content": "A café owner discovers..."},
    {"role": "assistant", "content": "I would prioritize..."}
  ],
  "model": "gpt-4o",
  "finishReason": "stop"
}
```

### Transcript `decision_metadata`
```json
{
  "canonicalMeaning": "prioritize safety",
  "compatibility": { "Physical_Safety": 0.9, "Economics": -0.3 },
  "keyReasoning": "Acted to prevent physical harm ..."
}
```

---

## Enums

| Enum | Values |
|------|--------|
| `RunStatus` | PENDING, RUNNING, PAUSED, SUMMARIZING, COMPLETED, FAILED, CANCELLED |
| `RunCategory` | PILOT, PRODUCTION, REPLICATION, VALIDATION, UNKNOWN_LEGACY |
| `DomainEvaluationStatus` | PENDING, RUNNING, COMPLETED, FAILED, CANCELLED |
| `DomainEvaluationScopeCategory` | PILOT, PRODUCTION, REPLICATION, VALIDATION |
| `ProbeResultStatus` | SUCCESS, FAILED |
| `AnalysisStatus` | CURRENT, SUPERSEDED |
| `AssumptionAnalysisStatus` | CURRENT, SUPERSEDED |
| `LlmModelStatus` | ACTIVE, DEPRECATED |

---

## Soft Delete Pattern

Tables with a `deleted_at` column:

- `definitions`, `definition_tags`, `scenarios`
- `transcripts`, `probe_results`, `analysis_results`, `assumption_analysis_snapshots`
- `runs`, `domain_evaluations`, `domain_evaluation_runs`

**Rules:**

1. Never physically delete — set `deleted_at` instead.
2. All queries must filter `WHERE deleted_at IS NULL` (resolvers enforce this automatically).
3. `deleted_at` is not exposed in the GraphQL schema.
4. Cascade via application logic: soft-deleting a parent soft-deletes related rows.

---

## Access Tracking

Major entities (`definitions`, `runs`, `transcripts`) include `last_accessed_at` updated on read. Used to identify cold data for future pruning; combined with `retention_days` / `archive_permanently` on runs.

---

## Key Indexes

| Table | Indexes | Purpose |
|-------|---------|---------|
| definitions | `parent_id`, `domain_id`, `domain_context_id`, `preamble_version_id`, `level_preset_version_id` | version tree + domain filters |
| runs | `definition_id`, `experiment_id`, `status`, `run_category`, `domain_config_snapshot_id` | dashboards |
| transcripts | `run_id`, `scenario_id`, `model_id`, `sample_index`, `deleted_at` | probe lookups, soft-delete |
| probe_results | `run_id`, `scenario_id`, `model_id`, `status`, `sample_index` | job retry + cost |
| scenarios | `definition_id` | expansion listing |
| analysis_results | `run_id`, `analysis_type`, `status`, `deleted_at` | cache lookup |
| domain_config_snapshots | unique `(domain_id, fingerprint)`, `(domain_id, created_at DESC)` | reproducibility |
| domain_evaluations | `domain_id`, `scope_category`, `status`, `created_by_user_id` | filters |
| assumption_analysis_snapshots | `(assumption_key, analysis_type, input_hash, status)` | cache |
| audit_logs | `(entity_type, entity_id)`, `user_id`, `created_at`, `action` | audit search |
| api_keys | `key_prefix`, `user_id` | auth lookups |

---

## Related Documentation

- [Architecture Overview](./overview.md) — components and flows
- [Tech Stack](./tech-stack.md) — technology choices
- [Canonical Glossary](../canonical-glossary.md) — Definition↔Vignette, Dimension↔Attribute terminology
- [Original Database Design](../preplanning/database-design.md) — historical rationale (superseded where it conflicts with this doc)
