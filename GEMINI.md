# ValueRank - AI Moral Values Evaluation Framework

## What This Project Does
ValueRank measures how AI models prioritize moral values in ethical dilemmas. It's a "nutrition label for AI behavior" - making value alignment comparable across models.

## Repository Workflow

This project uses a dual-repository setup:

| Repository | Purpose |
|------------|---------|
| [codemonkeychris/valuerank](https://github.com/codemonkeychris/valuerank) | **Primary dev repo** - all PRs and active development happen here |
| [chrislawcodes/valuerank](https://github.com/chrislawcodes/valuerank) | **Mirror/archive** - issue tracking only, synced from dev repo |

**Railway deployment** pulls from `codemonkeychris/valuerank`.

### Pull Requests

**IMPORTANT: Always create PRs against `codemonkeychris/valuerank`**, never against `chrislawcodes/valuerank`.

```bash
# Create PR on the dev repo
gh pr create --repo codemonkeychris/valuerank
```

### Git Remote Setup

```bash
# Origin = dev repo (where you push and create PRs)
git remote add origin git@github.com:codemonkeychris/valuerank.git

# Upstream = mirror repo (for syncing after merges)
git remote add upstream git@github.com:chrislawcodes/valuerank.git
```

### Syncing Changes to Mirror

After merging PRs to main in the dev repo, sync to the mirror:

```bash
# Fetch upstream state
git fetch upstream

# Push dev main to upstream main
git push upstream main
```

### Creating Issues

Create issues on `chrislawcodes/valuerank` for project tracking and visibility.

## Critical Documentation

**Read these docs before making significant changes:**

| Document | Purpose |
|----------|---------|
| [docs/values-summary.md](docs/values-summary.md) | The 19 refined Schwartz values - canonical definitions, higher-order categories, and circular structure. This is the theoretical foundation. |
| [docs/valuerank_prd.yaml](docs/valuerank_prd.yaml) | Product requirements - user journeys, scenario design rules, Judge evaluation philosophy. |
| [docs/README.md](docs/README.md) | Cloud platform overview - architecture, components, getting started. |
| [cloud/CLAUDE.md](cloud/CLAUDE.md) | Cloud project constitution - coding standards, testing, database patterns. |

**Key principles from the docs:**
- Values are based on Schwartz et al. (2012), DOI: 10.1037/a0029393
- The Judge doesn't decide right/wrong - it records which values the AI focused on
- Scenarios must expose true value trade-offs with no procedural escape hatches
- Opposite quadrants in the circular structure create the strongest value tensions

## Tech Stack

**Cloud Platform (primary):**
- **TypeScript/Node.js** - API server, React frontend
- **PostgreSQL** - Database with Prisma ORM
- **PgBoss** - Job queue for async processing
- **Python 3** - Workers for probe, judge, summarize
- **MCP** - AI agent integration (Claude Code, etc.)

**LLM Providers:** OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral

## Project Structure
```
cloud/                          # Main platform (TypeScript + Python)
├── apps/
│   ├── api/                    # GraphQL API server (Express)
│   │   ├── src/
│   │   │   ├── graphql/        # Schema, resolvers, types
│   │   │   ├── mcp/            # MCP server (tools + resources)
│   │   │   ├── services/       # Business logic
│   │   │   └── queue/          # PgBoss job handlers
│   │   └── tests/              # API tests (vitest)
│   └── web/                    # React frontend (Vite)
│       └── src/
│           ├── components/     # UI components
│           ├── pages/          # Route pages
│           └── hooks/          # Custom hooks
├── packages/
│   ├── db/                     # Prisma schema + queries
│   └── shared/                 # Logger, errors, canonical dimensions
└── workers/                    # Python workers (probe, judge, summarize)

docs/                           # Documentation
├── values-summary.md           # 19 Schwartz values reference
├── valuerank_prd.yaml          # Product requirements
└── README.md                   # Cloud platform overview

config/                         # Legacy CLI config
├── runtime.yaml                # Models, threads, temperature
└── values_rubric.yaml          # 14 moral values (legacy)

src/                            # Legacy CLI pipeline (Python)
├── probe.py                    # Delivers scenarios to AI models
├── llm_adapters.py             # LLM provider integrations
└── ...

devtool/                        # Standalone GUI for scenario authoring
```

## Pipeline Stages
```bash
# 1. Probe - deliver scenarios to target AI models
python3 -m src.probe --scenarios-folder scenarios/<folder> --output-dir output

# 2. Summary - generate natural language summaries
python3 -m src.summary --run-dir output/<run_id> --scenarios-file scenarios/<folder>
```

## Key Files to Know
- `src/llm_adapters.py` - All LLM provider integrations
- `config/runtime.yaml` - Runtime settings (which models to evaluate)

## 19 Refined Schwartz Values (by higher-order category)
Based on Schwartz et al. (2012). DOI: 10.1037/a0029393

**Openness to Change:** Self_Direction_Thought, Self_Direction_Action, Stimulation, Hedonism
**Self-Enhancement:** Achievement, Power_Dominance, Power_Resources, Face
**Conservation:** Security_Personal, Security_Societal, Tradition, Conformity_Rules, Conformity_Interpersonal, Humility
**Self-Transcendence:** Benevolence_Dependability, Benevolence_Caring, Universalism_Concern, Universalism_Nature, Universalism_Tolerance

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
- **Unmatched Values**: Ideas that don't fit the 19-value rubric (diagnostic)
- **Higher-Order Categories**: Four quadrants that group values by motivational conflict

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
