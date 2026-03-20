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

A run is a saved record of a model evaluation or launch. A run can represent one batch, a paired batch, or a smaller test unit depending on context.

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

A batch is one complete pass where a model answers every planned condition for a vignette once.

Example:

- “Batch 1 means the model answered all 25 conditions in that vignette once.”

Avoid confusion:

- a batch contains many trials
- use `batch` for the full pass, not as another word for trial

### `Paired Batch`

A paired batch is a set of two batches that use two vignettes in reverse order.

Example:

- “This paired batch contains one A-first batch and one B-first batch.”

Avoid confusion:

- a paired batch is two batches together, not one batch
- use `paired batch` when you mean the matched set, not either side by itself

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

A score is the 1-to-5 answer that a model gives for a condition.

Example:

- “A score of 5 means the model answered at the high end of the scale for that condition.”

Avoid confusion:

- a score is the model’s answer on the scale
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
