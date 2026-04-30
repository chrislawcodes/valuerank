# Canonical Glossary

This document is the canonical terminology source for ValueRank.

Its purpose is to define the user-facing and analysis-facing meanings of core terms before code, UI copy, specs, and reports are updated to match.

## How To Use This Document

- Use these terms in new product docs, specs, report copy, and analysis discussions.
- When current code or schema uses older names, map those names to this glossary instead of inventing parallel terminology.
- Treat deprecated terms as legacy implementation language, not preferred product language.

## Core Terms

### `Value`

A value is a human priority or principle that ValueRank is trying to measure, such as Achievement, Security, or Universalism.

Example:

- “Achievement is one value that can appear as an attribute inside a vignette.”

Avoid confusion:

- a value is the moral concept being studied
- an attribute is the structural role that a value can play inside a vignette

### `Vignette`

A vignette is a full prompt setup for one tradeoff. It includes the preamble, the two things being compared, and all the different conditions that can be generated from that setup.

Example:

- “The Jobs vignette compares Achievement and Hedonism across a 5x5 grid of conditions.”

Avoid confusion:

- use `vignette` for the full setup
- use `condition` for one exact case inside that setup
- the older internal term `definition` usually means `vignette`
- older docs sometimes describe a vignette too broadly as the full experimental narrative or unit of testing; in this glossary, a vignette is the full prompt family, not one rendered case

### `Attribute`

An attribute is one of the things being compared inside a vignette.

Example:

- “In this vignette, Achievement is one attribute and Hedonism is the other.”

Avoid confusion:

- an attribute is not the full prompt text
- the older internal term `dimension` usually means `attribute`
- some older docs use `attribute` to mean a Schwartz value specifically; in this glossary, `attribute` is the general structural term

### `Level`

A level is one setting of an attribute.

Example:

- “Level 5 means the first attribute is described as very strong in this condition.”

Avoid confusion:

- a level is the setting, not the attribute itself
- a level is only one part of a condition

### `Condition`

A condition is one exact combination of levels inside a vignette.

Example:

- “Condition 5x1 means the first attribute is at level 5 and the second is at level 1.”

Avoid confusion:

- a condition is one exact case inside a vignette
- `conditionKey` is the current code label for this unit
- do not use `vignette` when you mean one condition
- older language sometimes uses `scenario` for this; in new docs, prefer `condition` when you mean the exact evaluated case

### `Narrative`

The narrative is the part of the prompt that presents the competing values or options for a condition.

Example:

- “In this narrative, the achievement-focused option is described before the enjoyment-focused option.”

Avoid confusion:

- the condition stays the same even if the narrative wording or order changes
- use `narrative` for the presented comparison text, not for the whole vignette
- some older docs use `scenario` for this; in new docs, prefer `narrative` when you mean the presented comparison text

### `Variant`

A variant is one version of the same condition used for comparison.

Example:

- “The baseline and presentation-flipped prompts are two variants of the same condition.”

Avoid confusion:

- a variant is used to test wording, order, or scale changes
- a variant is not the same thing as a saved vignette version

## Execution Terms

### `Run`

A run is a saved record of a model evaluation or launch. A run can represent one batch, a paired batch, or a smaller test unit depending on context. A run that is fully complete — every selected model has answered every planned condition at every sample index — is also a `Batch` (see below). A run that exists but is missing transcripts in any planned slot is an `Incomplete Batch`.

Example:

- “This run records one model evaluation.”

Avoid confusion:

- a run is a record, not the same thing as the thing being counted
- a run can cover different sized units depending on context

### `Run Category`

A run category is the workflow label attached to a run so the product can distinguish pilot, production, replication, validation, and legacy work.

Current categories:

- `PILOT`
- `PRODUCTION`
- `REPLICATION`
- `VALIDATION`
- `UNKNOWN_LEGACY`

Example:

- “Assumptions launches should stamp new runs as `VALIDATION`.”

Avoid confusion:

- a run category is not the same thing as survey versus non-survey classification
- `UNKNOWN_LEGACY` means the run predates explicit categorization or has not been backfilled yet

### `Trial`

One trial is one time a model is given the prompt for a condition and produces an answer.

Example:

- “One trial is GPT-4o answering condition 5x1 once.”

Avoid confusion:

- a trial is one attempt, not the whole run
- a trial produces one transcript

### `Batch`

A batch is one complete run: every selected model has answered every planned condition for the vignette at every sample index. A run that is missing any expected transcript slot is an `Incomplete Batch` and does not contribute to batch counts.

Example:

- “Batch 1 means all 8 selected models answered every condition in that vignette.”

Avoid confusion:

- a batch is a whole run, not one model's pass through the run
- a batch contains many trials
- `samplesPerScenario` controls how many trials each slot gets — it does not multiply the batch count
- extra transcripts in a slot (worker retries, races) do not break completeness; only missing slots do

### `Incomplete Batch`

An incomplete batch is a run that expects transcripts but is missing one or more (model × scenario × sample-index) slots. Tracked separately as `incompleteBatchCount`. Does not contribute to `batchCount`.

A broken pair (one direction complete, one incomplete) contributes one `Incomplete Batch` from its abandoned side.

Example:

- “This run shows up under Incomplete Batches because deepseek-reasoner failed on conditions 18 and 22.”

Avoid confusion:

- an incomplete batch is a real run with real (partial) data — not a launch failure
- a run that has no expected transcripts (e.g., never started) is neither a batch nor an incomplete batch

### `Paired Batch`

A paired batch is counted whenever there is one complete A-first run and one complete B-first run that can be paired off. The Domain Overview shows `min(complete A-first, complete B-first)` for each value pair: when both directions have the same number of completed runs, that is the paired-batch count; when one direction has more, the surplus is unpaired and is **not** counted as a paired batch (the unpaired complete run still appears in `Batch` count).

A paired launch where one companion finishes and the other does not is a **broken pair**: the complete companion contributes 1 to `Batch`, the incomplete companion contributes 1 to `Incomplete Batch`, and the launch contributes 0 to `Paired Batch`.

Example:

- “This paired batch contains one A-first batch and one B-first batch.”

Avoid confusion:

- a paired batch is two batches together, not one batch
- use `paired batch` when you mean the matched set, not either side by itself

**Note on terminology overlap:** "paired batch" is also used in the launch path to describe two runs that share a `jobChoiceBatchGroupId` because they were launched together (e.g., the anomaly detector at `cloud/apps/api/src/services/run/anomaly-detection.ts` finds "sibling runs" by group ID). That is the *launch-time* concept of a paired batch — runs that were spun up as a co-launched pair. The display-time concept above counts pairable analysis-ready data and does not require runs to share a launch group. Both senses are valid in their own contexts; the launch-time grouping still drives anomaly detection while the display-time count drives the Domain Overview hub.

**Note on metric divergence within a cell:** within a single Domain Overview cell, `Paired Batch` (display-time) and the per-model trial counts operate on different subsets of the underlying runs. The trial-count path picks one survivor per `jobChoiceBatchGroupId` (the launch-time concept), so for a healthy paired launch with both companions complete, only one companion's transcripts feed the trial counts. The paired-batch count picks both. The two metrics are correct in their own terms but are not directly comparable arithmetically (e.g., 1 paired batch does not imply 2× the trial-count of an unpaired complete run).

### `Transcript`

A transcript is the full recorded prompt and response for one trial.

Example:

- “The transcript shows the prompt that was sent to the model and the answer it gave back.”

### `Model`

A model is the AI model that answers the prompt.

Example:

- “Claude Sonnet 4 is one model we test in ValueRank.”

### `Signature`

A signature is a short code that identifies a specific vignette version and run setup, including temperature. It is used to match trials that came from the same setup across different runs.

Example:

- “If two runs have the same signature, they used the same vignette version and temperature settings.”

## Analysis Terms

### `Score`

A score is the legacy 1-to-5 answer that a model gives for a condition.

Example:

- “A score of 5 means the model answered at the high end of the scale for that condition.”

Avoid confusion:

- a score is the model’s raw answer on the scale
- for value-labeled vignette analysis, `direction + strength` is the canonical decision model
- later analysis may combine many scores into summaries or metrics

### `Cell`

A cell is the analysis bucket for one specific combination of model, vignette, condition, and variant.

Example:

- “All GPT-4o trials for Jobs, condition 5x1, and presentation-flipped belong to one cell.”

Avoid confusion:

- a cell can contain one trial or many repeated trials
- a cell is an analysis bucket, not a single attempt

### `Comparison Pair`

A comparison pair is a comparison between a baseline cell and a variant cell for the same model, vignette, and condition, with enough usable data on both sides to count in a metric.

Example:

- “If condition 5x1 is shown once in baseline form and once with the narrative order flipped, that can be a comparison pair.”

### `Order Effect`

An order effect is a change in the model’s answer caused by changing the order or presentation of the prompt rather than the underlying condition.

Example:

- “If the model changes its answer when the same condition is presented in a different order, that is an order effect.”

### `Average Marginal Effect`

Average Marginal Effect, often shortened to AME, is a way to measure how much the chance of a model prioritizing an attribute changes on average when that attribute’s `Level` goes up by one step.

Example:

- “A higher AME means the model is more sensitive to changes in that attribute’s level.”

Avoid confusion:

- AME is a summary of change, not the model’s raw score
- it is used to compare sensitivity across attributes and vignettes
- it should be read as “how much the model moves when pressure increases,” not as a replacement for `direction + strength`

### `winRate`

`winRate` is the fraction of decisions where a model prioritized a value, computed as `prioritized / (prioritized + deprioritized + neutral)`. When a value has zero decisions, `winRate` is `null` — meaning no data, not a neutral result. A value of `0.5` means the model genuinely split evenly across decisions. In code version `1.2.0`, the denominator includes neutrals.

Example:

- “The model’s `winRate` for Achievement was 0.73 after neutrals were included in the denominator.”
- “A `winRate` of `null` means no trials recorded a decision for that value — it shows as `—` in the UI.”

Avoid confusion:

- `null` means no data; `0.5` means a genuinely even split — these are distinct states
- `winRate` is not the same as the share of only decisive responses
- it is a rate for one `(model, value)` pair, not a whole run or vignette

### `Equal-Vignette Reporting Win Rate`

For cross-vignette reporting surfaces like the main `/models` reports, the canonical metric is an equal-vignette win rate:

1. average runs equally within each vignette
2. treat each vignette as one unit
3. for cross-domain summaries, combine domain results using vignette counts so each vignette still counts once overall

Plain-language meaning:

- extra trials inside one vignette do not give that vignette more weight
- pooled raw outcome counts are not the canonical cross-vignette reporting metric

Example:

- “If one vignette ran 5 times and another ran once, the report still gives each vignette one vote after the within-vignette average is computed.”

Avoid confusion:

- this is different from pooling all `prioritized`, `deprioritized`, and `neutral` outcomes across vignettes first
- this is the canonical metric for the model-reporting surfaces, not a blanket rule for every analysis view

### `Order Invariance`

Order invariance means a model gives the same answer even when the order or presentation changes.

Example:

- “A model shows order invariance if it gives the same answer for the baseline and flipped versions of the same condition.”

## Deprecated Or Internal Terms

### `Definition`

`Definition` is an older term that usually means `vignette`.

Example:

- “The UI says vignette, but older code may still call the same thing a definition.”

Preferred term:

- `vignette`

### `Dimension`

`Dimension` is an older internal term that usually means `attribute`.

Example:

- “A dimension in older code usually matches an attribute in the glossary.”

Preferred term:

- `attribute`

### `Scenario`

`Scenario` is an older term that was used inconsistently.

Example:

- “Older docs may say scenario when they really mean vignette, condition, or narrative.”

Preferred replacement:

- use `vignette`, `condition`, or `narrative`, depending on what is actually meant
