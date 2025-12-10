# Feature #015: Cost Visibility

**Feature branch**: `feat/cost-visibility`
**Created**: 2024-12-10
**Status**: Draft
**GitHub Issue**: #31 - Predict cost of run in the UX

## Input Description

Improve cost visibility for users by:
1. Showing predicted cost per model when starting a run (not just $/token)
2. Using historical token statistics per model to predict tokens per scenario
3. Computing statistics after run completion to update model token averages
4. Showing total expected cost for the entire run before starting
5. Showing actual estimated cost in run results (aggregated from real tokens)

---

## User Scenarios & Testing

### User Story 1 - View Predicted Cost Per Model Before Starting Run (Priority: P1)

As a user starting a run, I need to see the predicted cost for each model I've selected so that I can make informed decisions about which models to include based on my budget.

**Why this priority**: This is the core value proposition addressing Issue #31. Without per-model cost predictions, users cannot budget effectively or compare model costs meaningfully.

**Independent Test**: Start a run with multiple models and verify each model shows its predicted cost based on scenario count and historical token usage.

**Acceptance Scenarios**:

1. **Given** I am on the start run form with 3 models selected and a definition with 50 scenarios, **When** I view the cost breakdown, **Then** I see each model's predicted cost calculated as `(scenarios × predicted_input_tokens × cost_input_per_million / 1,000,000) + (scenarios × predicted_output_tokens × cost_output_per_million / 1,000,000)`

2. **Given** a model has no historical token data (new model), **When** I view the cost breakdown, **Then** the system uses fallback estimates (provider average or system default) and indicates the estimate is based on limited data

3. **Given** I change the sample percentage from 100% to 25%, **When** I view the cost breakdown, **Then** the predicted costs update to reflect the reduced scenario count

---

### User Story 2 - View Total Run Cost Estimate Before Starting (Priority: P1)

As a user about to start a run, I need to see the total predicted cost across all models so that I can confirm the run fits my budget before committing.

**Why this priority**: Users need a single number to evaluate against their budget. Without this, they must manually sum per-model costs.

**Independent Test**: Start a run with multiple models and verify the total cost shown equals the sum of all individual model costs.

**Acceptance Scenarios**:

1. **Given** I have selected 3 models with predicted costs of $1.20, $0.80, and $2.50, **When** I view the run summary, **Then** I see a total predicted cost of $4.50

2. **Given** I am using the MCP tool to start a run, **When** the run is queued, **Then** the response includes `estimated_cost` with total and per-model breakdown

3. **Given** I change the models selected, **When** I add or remove a model, **Then** the total cost updates immediately

---

### User Story 3 - View Actual Cost After Run Completion (Priority: P1)

As a user reviewing run results, I need to see the actual cost incurred based on real token usage so that I can track spending and compare against predictions.

**Why this priority**: Users need to verify their actual spend and understand how predictions compared to reality. This closes the feedback loop.

**Independent Test**: Complete a run and verify the results page shows total actual cost calculated from transcript token counts and model pricing.

**Acceptance Scenarios**:

1. **Given** a run has completed with 100 transcripts, **When** I view the run results, **Then** I see "Estimated Cost: $X.XX" calculated from actual input/output tokens × model cost rates

2. **Given** I am viewing run results, **When** I look at the cost breakdown, **Then** I see per-model actual costs alongside token counts

3. **Given** transcript token data includes both input and output tokens, **When** calculating cost, **Then** the system uses the correct cost rate for each (input vs output tokens)

---

### User Story 4 - Automatic Token Statistics Collection (Priority: P2)

As the system, I need to compute and store average token usage per model after each run completes so that future cost predictions are accurate based on real data.

**Why this priority**: This enables progressively better cost predictions. Without historical data, predictions are just guesses. This is a background process that improves P1 stories over time.

**Independent Test**: Complete a run, trigger statistics computation, and verify the model's token averages are updated in the database.

**Acceptance Scenarios**:

1. **Given** a run completes with 50 probes for model X averaging 800 input tokens and 1200 output tokens, **When** statistics job runs, **Then** model X's token statistics table is updated with new averages

2. **Given** model X has existing statistics from 500 previous probes, **When** a new run adds 50 more probes, **Then** the statistics are weighted to incorporate new data (exponential moving average or rolling window)

3. **Given** a run completes, **When** the final job finishes, **Then** a `compute_model_statistics` job is automatically queued

---

### User Story 5 - Token Statistics Per Definition Type (Priority: P3)

As the system, I need to track token statistics per model AND definition combination so that predictions account for how different scenario types affect token usage.

**Why this priority**: Nice-to-have refinement. Some definitions may generate longer responses than others. This improves prediction accuracy but isn't critical for MVP.

**Independent Test**: Run the same model against two different definitions and verify separate statistics are maintained for each combination.

**Acceptance Scenarios**:

1. **Given** model X has run against definition A (averaging 500 output tokens) and definition B (averaging 2000 output tokens), **When** I start a new run with definition A, **Then** the cost prediction uses definition A's statistics

2. **Given** a model has no statistics for a specific definition, **When** predicting cost, **Then** the system falls back to the model's global average

3. **Given** a definition is a fork of another definition, **When** no statistics exist for the fork, **Then** the system may use parent definition statistics as fallback

---

## Edge Cases

### Cost Prediction Edge Cases

- **New model with no history**: Use average of all other models' statistics; if no statistics exist in DB, use system fallback (100 input / 900 output tokens)
- **Model cost not set**: Show "Cost unavailable" rather than $0.00
- **Zero scenarios in run**: Show $0.00 with explanation
- **Sample percentage results in 0 scenarios**: Prevent run start, show validation error

### Statistics Computation Edge Cases

- **Run cancelled mid-execution**: Only include completed probes in statistics
- **Probes with missing token data**: Skip these probes, don't corrupt averages
- **Very short/long outlier responses**: Consider using median or trimmed mean
- **Model renamed or deprecated**: Statistics linked by model ID, survive renames

### Cost Display Edge Cases

- **Very small costs**: Display at least 4 decimal places for sub-cent amounts
- **Very large costs**: Add thousands separator for readability
- **Mixed currency display**: All costs in USD (current system assumption)

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST display predicted cost per model in the start run UI, calculated from `(scenario_count × avg_input_tokens × cost_input_per_million / 1,000,000) + (scenario_count × avg_output_tokens × cost_output_per_million / 1,000,000)`

- **FR-002**: System MUST display total predicted cost (sum of all model costs) before run confirmation

- **FR-003**: System MUST return cost estimate in MCP `start_run` tool response with per-model breakdown

- **FR-004**: System MUST display actual estimated cost in run results, calculated from real transcript tokens

- **FR-005**: System MUST compute and store token statistics per model after each run completes via background job

- **FR-006**: System SHOULD store token statistics at model granularity (P2: optionally per model+definition)

- **FR-007**: System MUST use fallback token estimates when no historical data exists for a model: first try average of all other models' statistics, then fall back to system default (100 input / 900 output tokens) if DB is empty

- **FR-008**: System MUST format costs with appropriate precision (minimum 4 decimal places for sub-cent amounts)

- **FR-009**: GraphQL `startRun` mutation SHOULD return estimated cost data in response payload

- **FR-010**: System MUST track both input and output tokens separately for accurate cost calculation

---

## Success Criteria

- **SC-001**: Users can see predicted total cost before starting any run
- **SC-002**: Predicted costs are within 50% of actual costs for models with 100+ historical probes
- **SC-003**: Cost predictions update within 1 second when changing models or sample percentage
- **SC-004**: Run results display actual cost within 5 seconds of page load
- **SC-005**: Token statistics are computed within 60 seconds of run completion

---

## Key Entities

### New: ModelTokenStatistics

Stores historical token usage averages per model for cost prediction.

| Field | Type | Description |
|-------|------|-------------|
| id | CUID | Primary key |
| modelId | FK | Reference to LlmModel |
| definitionId | FK (nullable) | Optional: definition-specific stats (P3) |
| avgInputTokens | Decimal | Average input tokens per probe |
| avgOutputTokens | Decimal | Average output tokens per probe |
| sampleCount | Int | Number of probes used to compute average |
| lastUpdatedAt | DateTime | When stats were last recomputed |

### Modified: Run

Add cost-related fields to run config/progress.

| Field | Type | Description |
|-------|------|-------------|
| config.estimatedCosts | JSON | `{ total: number, perModel: { [modelId]: { input: number, output: number, total: number } } }` |

### Modified: RunSummary (Analysis)

Add actual cost to analysis output.

| Field | Type | Description |
|-------|------|-------------|
| actualCost | JSON | `{ total: number, perModel: { [modelId]: number } }` |

---

## Assumptions

1. **USD only**: All costs are displayed in USD; no currency conversion needed
2. **Token counts available**: LLM adapters reliably return input/output token counts
3. **Cost rates stable**: Model costs don't change frequently enough to require historical cost snapshots beyond what's already captured
4. **Statistics job timing**: A short delay after run completion before statistics job runs is acceptable
5. **Fallback values**: System default of 100 input / 900 output tokens when DB has no statistics; otherwise average all models
6. **Sample size**: 100 probes is sufficient for reliable statistics per model
