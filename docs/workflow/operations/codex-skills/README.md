# Feature Factory

Feature Factory is an adversarial-review workflow runner that takes a feature from spec through implementation, adversarial review, and closeout. It orchestrates Codex and Gemini agents at each checkpoint, keeping a structured state file so the workflow can pause and resume across sessions.

Imported from [chrislawcodes/valuerank](https://github.com/chrislawcodes/valuerank) at commit `b6ac4448f5389f96c846b77aed4047295e2ff199`.

See [INSTALL.md](INSTALL.md) for setup instructions.

## Repository layout

```
feature-factory/          Runner scripts, SKILL.md, CODEX-ORCHESTRATOR.md
  scripts/                Python runner modules
  scripts/tests/          Unit tests (307 tests, run with pytest)
  tests/                  Integration-level repair tests
review-lens/              Adversarial-review scripts (Codex + Gemini launchers,
                          reconciliation helpers, diff writers)
feature-factory.config.example.json   Sample project config
```
