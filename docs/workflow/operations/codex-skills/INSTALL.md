# Installing Feature Factory in a new project

This is the step-by-step runbook for dropping the Feature Factory runner into a new repo via git subtree.

## Prerequisites

- Git 2.25+
- Python 3.11+
- `codex` CLI and `gemini` CLI available on `PATH`
- `gh` CLI authenticated to GitHub

## Steps

### 1. Add the subtree

Run this from your repo root. This pulls the entire `feature-factory` repo into `docs/workflow/operations/codex-skills/`:

```bash
git subtree add \
  --prefix=docs/workflow/operations/codex-skills \
  https://github.com/chrislawcodes/feature-factory.git \
  main \
  --squash
```

After this command you will have two new directories:

- `docs/workflow/operations/codex-skills/feature-factory/` — runner scripts and skill docs
- `docs/workflow/operations/codex-skills/review-lens/` — adversarial review scripts

### 2. Create `feature-factory.config.json`

At your repo root, create `feature-factory.config.json`. Copy from the example:

```bash
cp docs/workflow/operations/codex-skills/feature-factory.config.example.json feature-factory.config.json
```

Edit it with your values:

```json
{
  "repo": "OWNER/REPO",
  "protected_files": [
    "AGENTS.md",
    "MEMORY.md",
    "CLAUDE.md",
    ".gitignore"
  ],
  "do_not_modify_prompt_files": [
    "AGENTS.md",
    "MEMORY.md",
    "CLAUDE.md"
  ],
  "sync_script": null
}
```

| Field | What it does |
|---|---|
| `repo` | `OWNER/REPO` string used in `gh pr create --repo` |
| `protected_files` | Files the runner reverts after every Codex/Gemini subprocess |
| `do_not_modify_prompt_files` | Files listed in the Codex implementation prompt's "DO NOT MODIFY" line |
| `sync_script` | Relative path to a sync script (run with `--sync-if-needed`), or `null` to skip |

### 3. Commit the config

```bash
git add feature-factory.config.json
git commit -m "chore: add feature-factory.config.json"
```

### 4. Invoke the runner

All commands run from your repo root:

```bash
python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py --help
python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py audit
python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py status --slug <slug>
```

### 5. Run the tests

```bash
cd docs/workflow/operations/codex-skills/feature-factory/scripts
python3 -m pytest tests/ -q
```

All 307 tests should pass.

## Updating the runner

To pull in upstream changes:

```bash
git subtree pull \
  --prefix=docs/workflow/operations/codex-skills \
  https://github.com/chrislawcodes/feature-factory.git \
  main \
  --squash
```

## Environment variables

| Variable | Default | Effect |
|---|---|---|
| `FF_REPO_ROOT` | git root of current working directory | Override the repo root path |
| `FF_CONFIG_PATH` | `<REPO_ROOT>/feature-factory.config.json` | Override the config file location |
| `FF_FACTORY_RUNS_ROOT` | `<REPO_ROOT>/docs/workflow/feature-runs` | Override the feature-runs directory |
