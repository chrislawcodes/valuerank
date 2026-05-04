# Coverage Investigation: Achievement vs Conformity (Job Choice Domain)

**Date:** 2026-05-03
**Domain:** Job Choice (`cmmqi1urq0000e4y3ot8sfm06`)
**Pair:** Achievement × Conformity Interpersonal

---

## The Two Values

**Achievement** — *"Success according to social standards"* (Schwartz et al., 2012)
Valuing success and competence by social standards. Desire to demonstrate ability and effectiveness. Emphasis on performance, excellence, and results.

**Conformity – Interpersonal** — *"Avoidance of upsetting or harming other people"* (Schwartz et al., 2012)
Valuing harmony and avoiding upsetting others. Restraint of behavior to keep peace in relationships. Preference for smooth social interactions.

These sit on opposite sides of the Schwartz circle: Achievement is Self-Enhancement; Conformity is Conservation. They are a genuine motivational tension.

---

## The Two Vignettes

| ID | Name | Definition |
|---|---|---|
| `cmmz0u6s6000aeuiq0x073o29` | Achievement → Conformity Interpersonal (A→C) | Job candidate A embodies Achievement; candidate B embodies Conformity |
| `cmmz0u6t1000ceuiqu334qxhk` | Conformity Interpersonal → Achievement (C→A) | Job candidate A embodies Conformity; candidate B embodies Achievement |

Each vignette has **25 conditions** (a 5×5 grid of two attribute dimensions: negligible / minimal / moderate / substantial / full).

---

## Trial Counts Per Condition (Default Model Filter, All Signatures)

Default model filter = 8 models: Claude Sonnet 4.5, DeepSeek Chat, DeepSeek Reasoner, Gemini 2.5 Flash, GPT-5.1, Grok 4.1 Fast Reasoning, Mistral Large (Dec 2025), Mistral Small.

Only non-aggregate runs whose `config.models` includes all 8 defaults are counted.

### A→C Vignette — Achievement-first direction

3 qualifying source runs. All 25 conditions, all 8 models: **7 trials each** (uniform).

| Condition | Trials/model |
|---|---|
| negligible × negligible | 7 |
| negligible × minimal | 7 |
| negligible × moderate | 7 |
| negligible × substantial | 7 |
| negligible × full | 7 |
| minimal × negligible | 7 |
| minimal × minimal | 7 |
| minimal × moderate | 7 |
| minimal × substantial | 7 |
| minimal × full | 7 |
| moderate × negligible | 7 |
| moderate × minimal | 7 |
| moderate × moderate | 7 |
| moderate × substantial | 7 |
| moderate × full | 7 |
| substantial × negligible | 7 |
| substantial × minimal | 7 |
| substantial × moderate | 7 |
| substantial × substantial | 7 |
| substantial × full | 7 |
| full × negligible | 7 |
| full × minimal | 7 |
| full × moderate | 7 |
| full × substantial | 7 |
| full × full | 7 |

**Conformity-first direction: 0 qualifying runs.**

### C→A Vignette — by direction

3 qualifying source runs, but split across two directions:

| Run | `jobChoiceValueFirst` | Trials/model/condition |
|---|---|---|
| `cmmzan1xf03a` | `achievement` | 5 |
| `cmmz0ur0o004` | `achievement` | 1 |
| `cmnfng34k00t` | `conformity_interpersonal` | 1 |

**Achievement-first direction** (2 runs): all 25 conditions, all 8 models: **6 trials each** (uniform).

**Conformity-first direction** (1 run): all 25 conditions, all 8 models: **1 trial each** (uniform).

---

## Coverage Matrix Calculation

The coverage cell value = `min(Achievement-first batch equivalents, Conformity-first batch equivalents)`.

Batch equivalents are computed across all definitions in the pair, merging their scenario sets:

| Direction | Source | Conditions | Trials/model | Batch equivalent |
|---|---|---|---|---|
| Achievement-first | A→C (25 conditions) | 25 | 7 | — |
| Achievement-first | C→A (25 conditions) | 25 | 6 | — |
| Achievement-first | **combined min** | 50 | min = 6 | **6** |
| Conformity-first | C→A (25 conditions) | 25 | 1 | **1** |

**Cell value = min(6, 1) = 1.**

---

## Root Cause

The 2 oldest qualifying runs on the C→A definition (`cmmzan1xf03a`, `cmmz0ur0o004`) were launched with Achievement presented first (`jobChoiceValueFirst = 'achievement'`, derived from `jobChoicePresentationOrder = 'B_first'`). They were created as paired companions to A→C runs — both directions of the pair running Achievement first for presentation-order control. This adds trials to the Achievement direction but contributes nothing to the Conformity-first direction.

The A→C definition has no Conformity-first runs at all — all 3 qualifying source runs ran Achievement first.

The only Conformity-first qualifying run is `cmnfng34k00t` on the C→A definition (1 trial/model/condition).

---

## What's Needed

To reach **6 Conformity-first batch equivalents** (matching Achievement-first), 5 more Conformity-first batches are needed. Each batch should use the 8 default models.

Options:
- Launch on C→A definition with Conformity-first direction (`jobChoiceValueFirst = 'conformity_interpersonal'`)
- Launch on A→C definition with B-first direction (`jobChoiceValueFirst = 'conformity_interpersonal'`)

The "Match Pair Counts" button in the coverage matrix popover for this cell will pre-fill the correct parameters.
