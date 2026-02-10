# Agent Rules For This Repo

## Editing Files
- Use the dedicated `apply_patch` tool to modify files.
- Do not attempt to run `apply_patch` via `shell_command` (or any other command runner).

## Git Hygiene
- Before committing, check `git status --porcelain` and stage only the files related to your change.
- Avoid committing local debug scripts/data (for example `debug_input*.json`).

