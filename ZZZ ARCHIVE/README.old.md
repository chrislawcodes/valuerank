# ValueRank

**Mission:** Help people understand and shape how AI systems align with human values.  
**Analogy:** Like a nutrition label for AI behavior — transparent, comparable, and verifiable.

---

## Overview
ValueRank is an open framework for measuring how AI models prioritize moral values when faced with the same ethical or policy dilemmas. It provides a reproducible pipeline for researchers to compare reasoning patterns across models and trace those results back to source dialogues.

---

## System Architecture
ValueRank operates through four main components:

1. **Probe AI** — Delivers standardized moral scenarios to different AI systems (“Target AIs”) and records their full dialogues.  
2. **Judge AI** — Analyzes each Target AI’s reasoning using a shared moral values rubric, identifying which values were prioritized or sacrificed.  
3. **Aggregator** — Combines results across models to compute win rates, value hierarchies, and cross-model comparisons.  
4. **Reports** — Produces transparent YAML and Markdown summaries showing how values were mapped, scored, and justified.  

---

## Core Files

- **values_rubric.yaml:** Defines the moral values that AIs are judged against.  
- **scenarios.yaml:** Contains moral dilemmas written in first person, each exposing real value trade-offs.  
- **runtime.yaml:** Sets model parameters (temperature, max tokens, threading).  
- **run_manifest.yaml:** Maps anonymized model IDs to their true identities while keeping the Judge blind during scoring.  
- **summary.<anon_model_id>.<timestamp>.yaml / .csv:** Per-model summaries of how values were prioritized or deprioritized.  
- **summary.aggregated.yaml / .md:** Combined, cross-model results showing value hierarchies.  

---

## Key Principles

### Scenario Design
1. Each scenario must expose a genuine moral conflict with at least two defensible choices.  
2. Scenarios avoid leading language, procedural “workarounds,” or logistical escape hatches.  
3. Each ends with an open-ended question: “What should I do?”

### Judging Logic
- The Judge LLM:
  - Matches reasoning phrases to official rubric values.
  - Explains every mapping and flags any unmatched ideas.
  - Calculates value win rates: win_rate = prioritized_count / (prioritized_count + deprioritized_count).
- Results are traceable back to the Target’s actual reasoning.

### Transparency
Every output includes:
- Mapped moral phrases → rubric values  
- Rationales for each classification  
- Unmatched or ambiguous moral ideas

---

## CLI Entry Points

```bash
# Run a Probe session (deliver scenarios to Target AIs)
python3 -m src.probe

# Evaluate reasoning using the Values Judge
python3 -m src.judge_value

# Aggregate multi-model results
python3 -m src.aggregator

# Generate cross-model summaries
python3 -m src.judge_xmodel
```

---

## Output Structure

```
output/
  transcripts/                 # Full dialogues from Probe AI
  summary.<anon_model_id>.yaml
  summary.<anon_model_id>.csv
  summary.aggregated.yaml
  summary.aggregated.md
```

These form the complete ValueRank Report, showing how different AI models rank moral values and why.

---

## Concurrency & Performance
- Both Probe and Judge use thread pools (default 6 workers) for parallel evaluation; the Judge now assigns each scenario to a worker while reassembling outputs in the original order.
- Deterministic output ordering and thread-locked logging preserve reproducibility and readable diagnostics even under concurrency.
- Researchers can override threading via:
  - runtime.defaults.probe_threads
  - runtime.defaults.judge_threads
  - or the shared --threads CLI flag.

---

## Attribution
- Author: Chris Law  
- Version: v0.6  
- Date: 2025-11-01  
- Linked Spec: valuerank_techspec.yaml

---

## Citation
If you use ValueRank in your work, please cite it as:

Law, C. (2025). ValueRank: A Framework for Measuring AI Moral Reasoning (v0.6). https://github.com/[your-username]/valuerank
