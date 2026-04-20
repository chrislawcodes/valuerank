# ValueRank — Research Questions (Working List)

Working doc for us (Chris + Claude) to look at together when deciding what to
build next. Not for agents. Not a PRD. The goal: see the full question space at
a glance, with honest notes about which questions the existing data actually
answers and which ones we're still figuring out.

Last updated: 2026-04-19.

---

## Target audiences (in priority order)

| Audience | What they want from this data |
|---|---|
| **AAPOR (survey methodologists)** | Measurement trustworthiness. Test-retest reliability, response-order effects, wording effects, instrument robustness. Treat LLMs as respondents and evaluate them like a panel. |
| **Alignment researchers** | How do models trade off values under pressure? Where do priorities come from — training or prompt? Do models prioritize consistently, or are they reshuffling post-hoc? |
| **Moral psychology researchers** | Whether LLM priorities look like any known human population (Schwartz profiles, WEIRD vs non-WEIRD, political subgroups). |
| **AI policy analysts** | Which models prioritize which values in policy-adjacent tradeoffs (e.g. Security vs Universalism). Narrative for regulators. |
| ~~ACM reviewers (benchmark framing)~~ | **Deprioritized.** Benchmark-for-benchmark's-sake isn't what we're doing — it frames models as passing/failing rather than as behavioral instruments. |

---

## Question inventory

Status key: ✅ shipped · 🟡 partial / data exists but no view · 🔴 blocked on data or method · ⬜ deferred · ❌ out of scope

Questions are split into two tiers:
- **Overall** — cross-model / cross-domain. The top-of-funnel view of what each model does.
- **Domain-level** — within a single domain (Job Choice, Neighborhood, etc.). The drill-down.

---

## Overall model understanding

*Questions that span all models and (usually) all domains. Ship these well and the page you'd land on first is answered.*

### A. What does each model prioritize?

| # | Question | Status | Notes |
|---|---|---|---|
| A1 | **Overall: what does each model prioritize?** | ✅ | **Models / Matrix page.** Cross-model × value grid. Top-of-funnel view for the whole question. |
| A2 | Do models agree on which values to prioritize? | ✅ | Read Models Matrix by column. |
| A3 | Do priorities transfer across domains (Job Choice vs Neighborhood, etc.)? | 🟡 | Matrix covers "All domains" view; no side-by-side per-domain comparison. |

### B. How much do we trust the priorities?

| # | Question | Status | Notes |
|---|---|---|---|
| B1 | Does the model give the same answer when asked twice? | ✅ | Repeatability leaderboard on Consistency report. Coverage-weighted DerSimonian-Laird pool. |
| B2 | Is there a systematic order effect? (A-then-B vs B-then-A) | ✅ | `OrderEffect` field on Consistency report. Same / flipped / noisy breakdown. |
| B3 | Which models are the noisiest / most reliable? | ✅ | Repeatability leaderboard. |
| B4 | Which models have priorities you can actually rely on end-to-end? | 🟡 | Partial. **Models / Matrix stability dots** already show cross-domain trust per cell. What's missing per cell: test-retest, order-effect, cross-signature, and CI width. The through-line question is "should the stability dots expand to cover all reliability dimensions, not just cross-domain?" |

### C. Do models respond to pressure? (overall picture)

| # | Question | Status | Notes |
|---|---|---|---|
| C1 | Overall, does the model track argument strength? | 🟡 | Pressure Sensitivity scalar exists (Spearman ρ) but is **misleading** — conflates "principled / strong commitment" with "noisy / no pattern." Under redesign. |
| C2 | At the model level, is a low pressure-sensitivity number a defect or a virtue? | 🔴 | Needs shape classification (principled vs stuck vs noisy) before the headline number makes sense. |

### D. Agreement with humans

| # | Question | Status | Notes |
|---|---|---|---|
| D1 | Do model priorities match any Schwartz survey population? | ⬜ | We have Schwartz's canonical 19-value structure; no human baseline data in the system yet. |
| D2 | Do models reflect political / cultural subgroups? | ⬜ | Needs external human reference data. |
| D3 | Can models be prompted into different populations ("respond as a conservative voter")? | ⬜ | Requires preamble variants; no experiment designed yet. |

### E. Robustness (at the model level)

| # | Question | Status | Notes |
|---|---|---|---|
| E1 | Does model version change priorities? | 🟡 | Signature dropdown captures this per-domain; no longitudinal roll-up. |
| E2 | Does temperature change priorities? | 🟡 | Signature covers it per-domain; no "temperature sweep" view. |

---

## Domain-level deep dive

*Questions about what happens inside a specific domain. These are the drill-downs from the overall view.*

### F. Priorities within a domain

| # | Question | Status | Notes |
|---|---|---|---|
| F1 | Which values does each model prioritize in this domain? | ✅ | `ValuePrioritiesSection` on Domain Analysis. Per-value win rate + Bradley-Terry. |
| F2 | Are priorities transitive within this domain, or are there cycles (A>B, B>C, C>A)? | ✅ | `DominanceSection` on Domain Analysis. |
| F3 | On which pairs does a model hold the strongest / weakest commitment? | 🟡 | Implicit in the 5×5 condition grid per pair; not surfaced directly. |

### G. Reliability within a domain

| # | Question | Status | Notes |
|---|---|---|---|
| G1 | How sharp is each priority estimate — tight CI or wide? | 🟡 | Computable from win-rate + n per cell; not visualized yet. **Active open design question** (see below). |
| G2 | Is the domain answer stable across signature (preamble + model version + temperature)? | ✅ | Signature dropdown on Consistency report; each signature yields its own curve. |

### H. Pressure response — per pair

| # | Question | Status | Notes |
|---|---|---|---|
| H1 | What does a flat curve mean on a specific pair — principled or stuck? | 🟡 | Data shows principled (strong commitment, holds under pressure). Current metric calls it a defect. Needs shape classification. |
| H2 | On which specific pairs is a model movable vs. locked in? | 🔴 | Requires per-pair curve shape analysis (baseline + slope + fit). Not emitted. |
| H3 | Is there a response threshold (flat until net pressure exceeds X, then flips)? | 🔴 | Real in the data (e.g. Claude on Achievement vs Self_Direction). Not detected. |

### I. Robustness within a domain

| # | Question | Status | Notes |
|---|---|---|---|
| I1 | Does rephrasing the vignette change the answer? | 🟡 | Partial — different vignettes exist within each domain, but no controlled-paraphrase experiment. |

---

## Currently under design (as of 2026-04-19)

**The open question:** what is the Consistency report *for*, given that Domain
Analysis already shows priorities and cycles?

**Current leaning:** Consistency becomes a **meta-trust layer** on top of Domain
Analysis. It answers "how much should you trust the priorities you see on the
Domain Analysis page?" — via Repeatability + Order Effect + (some form of)
priority-confidence indicator — and delegates the priorities themselves back
to Domain Analysis via link-through.

**Open sub-question:** is the priority-confidence indicator actually useful on
real data? Early check (see session transcript 2026-04-19) suggests CI widths
are mostly uniform at ~5–8 pp because n is similar across cells. A better
coloring may be "is this preference distinguishable from coin flip?" —
flag the gray-zone cells rather than grade the green ones.

---

## Deliberately out of scope

- **Benchmark-style "which model is best" ranking.** Models prioritize values
  differently; a single leaderboard implies a ground truth we don't have.
- **Human-in-the-loop evaluation.** We measure what models do, not what they
  should do.
- **Fine-tuning or intervention experiments.** We're observational, not
  prescriptive.

---

## How to use this doc

1. When we're debating what to build next, open this and scroll. Anything 🟡 or
   🔴 is a potential next unit of work.
2. When something ships, move it to ✅ with a one-line note about which view
   covers it.
3. If we catch ourselves rebuilding something that's already ✅, stop and
   reroute.
4. Audience column at the top is a sanity check: if a proposed build doesn't
   obviously serve one of those audiences, ask whether it's actually interesting
   or just tidying.
