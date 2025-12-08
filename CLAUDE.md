# ValueRank - AI Moral Values Evaluation Framework

## What This Project Does
ValueRank measures how AI models prioritize moral values in ethical dilemmas. It's a "nutrition label for AI behavior" - making value alignment comparable across models.

## Tech Stack
- **Python 3** with PyYAML + requests
- Multi-provider LLM support (OpenAI, Anthropic, Google, XAI, DeepSeek, Mistral)
- ThreadPoolExecutor for concurrent processing

## Project Structure
```
src/
├── probe.py          # Delivers scenarios to AI models, records transcripts
├── judge_value.py    # Analyzes reasoning against values rubric (core logic)
├── aggregator.py     # Merges cross-model results
├── summary.py        # Generates per-model summaries
├── llm_adapters.py   # Provider abstraction layer (6+ LLM providers)
├── config_loader.py  # YAML config parsing
├── utils.py          # Shared utilities
└── make_blind_rubric.py  # Anonymizes rubric for blind judging

config/
├── runtime.yaml      # Models, threads, temperature settings
├── values_rubric.yaml # 14 canonical moral values with definitions
└── model_costs.yaml  # Token pricing per model

scenarios/            # Moral dilemma datasets (folder per topic)
output/               # Generated runs (transcripts, summaries)
```

## Pipeline Stages
```bash
# 1. Probe - deliver scenarios to target AI models
python3 -m src.probe --scenarios-folder scenarios/<folder> --output-dir output

# 2. Judge - analyze AI reasoning against values rubric
python3 -m src.judge_value --run-dir output/<run_id>

# 3. Aggregate - merge multi-model results
python3 -m src.aggregator --run-dir output/<run_id>

# 4. Summary - generate natural language summaries
python3 -m src.summary --run-dir output/<run_id> --scenarios-file scenarios/<folder>
```

## Key Files to Know
- `src/judge_value.py` - Core judging logic, value matching, win-rate calculation
- `src/llm_adapters.py` - All LLM provider integrations
- `config/values_rubric.yaml` - The 14 moral values being measured
- `config/runtime.yaml` - Runtime settings (which models to evaluate)

## 14 Canonical Values
Physical_Safety, Compassion, Fair_Process, Equal_Outcomes, Freedom, Social_Duty, Harmony, Loyalty, Economics, Human_Worthiness, Childrens_Rights, Animal_Rights, Environmental_Rights, Tradition

## Output Structure
```
output/<run_id>/
├── transcript.<scenario>.<model>.<run_id>.md  # Raw dialogue
├── summary.<anon_model>.yaml                  # Per-model value scores
├── summary.aggregated.yaml                    # Cross-model comparison
└── run_manifest.yaml                          # Model ID mapping
```

## Key Concepts
- **Blind Judging**: Models are anonymized during evaluation to prevent bias
- **Win Rate**: `prioritized / (prioritized + deprioritized)` for each value
- **Pairwise Matrix**: How often one value beats another in conflicts
- **Unmatched Values**: Ideas that don't fit the 14-value rubric (diagnostic)

## Running Locally
```bash
pip install -r requirements.txt
# Configure config/runtime.yaml with target_models and judge_model
# Run pipeline stages as needed
```

## DevTool (GUI)
Web-based GUI for authoring scenarios and running the pipeline.

**Tech Stack**: React + TypeScript + Vite (client), Express + TypeScript (server)

**Structure**:
```
devtool/
├── src/client/          # React UI (port 5173)
│   ├── App.tsx          # Main layout: Editor, Runner, Settings tabs
│   └── components/      # ScenarioEditor, ScenarioGenerator, PipelineRunner
└── src/server/          # Express API (port 3030)
    └── routes/
        ├── scenarios.ts # CRUD for scenario YAML files
        ├── generator.ts # LLM-powered scenario generation from .md definitions
        └── runner.ts    # Spawns Python pipeline processes (SSE output)
```

**Key Concepts**:
- `.md` files = scenario **definitions** (template + dimensions for AI generation)
- `.yaml` files = **scenarios** (actual dilemmas sent to models)

**Running**:
```bash
cd devtool && npm install && npm run dev
# Requires ANTHROPIC_API_KEY or OPENAI_API_KEY in .env
```

## Claude Code Agent Instructions

### Testing and Coverage
- Use the **test-runner-json** agent when running tests. This provides structured JSON output for test results.
- Use the **coverage-analyzer** agent for code coverage analysis and reporting.

### Complex Feature Development
For multi-step features, use the feature development skill workflow:
1. **feature-spec** - Create a specification with prioritized user stories and requirements
2. **feature-plan** - Generate a technical implementation plan with architecture decisions
3. **feature-tasks** - Break down the plan into executable tasks with dependency tracking
4. **feature-implement** - Execute tasks phase-by-phase with automatic progress tracking

This workflow ensures proper planning, documentation, and incremental commits for larger features.
