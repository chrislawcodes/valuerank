---
description: Open PR, fix conflicts and CI failures, then squash merge into main
argument-hint: [pr-number or branch — omit to create a new PR]
allowed-tools: Bash(gh:*), Bash(git:*), Bash(codex:*), Bash(cat:*), Bash(npm:*), Read, Edit, Write
---

Ship the current branch: open or locate a PR, fix any merge conflicts, fix any CI failures, then squash merge into main.

Current branch: !`git branch --show-current`
Repo root: !`git rev-parse --show-toplevel`

---

## Step 1 — Open or locate the PR

If $1 is a PR number, use it. Skip creating a new one.

If $1 is blank, check for an existing PR first:
```bash
gh pr view --json number,url,state 2>/dev/null
```

If no PR exists, create one against `chrislawcodes/valuerank`:
```bash
gh pr create --repo chrislawcodes/valuerank \
  --title "<branch name in plain English>" \
  --body "$(cat <<'EOF'
## Summary
- <bullet 1>
- <bullet 2>

## Test plan
- [ ] Preflight passed (lint + tests + build)
- [ ] Manual smoke test done

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Record the PR number and URL. Report it to the user.

---

## Step 2 — Fix merge conflicts (if any)

Check for conflicts with main:
```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD || echo "BEHIND MAIN"
git diff --name-only --diff-filter=U 2>/dev/null || echo "No conflict markers found"
```

If the branch has conflicts with main, rebase:
```bash
git rebase origin/main
```

If rebase hits conflicts:
1. Read each conflicting file.
2. Resolve by keeping the intent of the feature branch changes while incorporating main's changes.
3. Stage the resolved files: `git add <file>`
4. Continue: `git rebase --continue`

After a clean rebase, force-push the branch:
```bash
git push --force-with-lease origin $(git branch --show-current)
```

---

## Step 3 — Run the Preflight Gate

Run from the repo root (`cloud/` directory) before any PR merge:

```bash
cd $(git rev-parse --show-toplevel)/cloud
npm run lint --workspace @valuerank/shared && \
npm run lint --workspace @valuerank/db && \
npm run lint --workspace @valuerank/api && \
npm run build --workspace @valuerank/api && \
npm run lint --workspace @valuerank/web && \
npm run build --workspace @valuerank/web
```

If any step fails:
- Read the error output carefully.
- Fix the root cause (no @ts-ignore, no eslint-disable, no `any` suppressions).
- Commit the fix and re-run from the top of Step 3.

Tests require a live DB — skip if not available locally, but note this in the report.

---

## Step 4 — Wait for CI and fix failures

Check CI status on the PR:
```bash
gh pr checks <pr-number> --repo chrislawcodes/valuerank --watch
```

If checks are still running, wait (use `--watch` to block until complete).

If any check fails:
1. Extract the run ID from the failing check URL.
2. Pull the error log:
   ```bash
   ~/.claude/scripts/parse-ci-errors.sh <run-id> 2>/dev/null
   ```
3. Write a Codex fix spec to `/tmp/codex-ci-fix-spec.txt`:
   ```
   $(cat ~/.claude/templates/codex-impl-preamble.txt)

   TASK: Fix these CI failures. Quote every error exactly.
   For each error: identify the file and line, describe the fix.

   [paste errors here]

   SCOPE: Only fix what's failing. Do not touch unrelated files.
   Run npm run build from the repo root. Fix all type errors properly.
   Do NOT use @ts-ignore, eslint-disable, or cast to `any`.
   ```
4. Dispatch Codex:
   ```bash
   cd $(git rev-parse --show-toplevel) && codex exec -s workspace-write "$(cat /tmp/codex-ci-fix-spec.txt)"
   ```
5. Review the diff (`git diff HEAD~1..HEAD --stat`), then push:
   ```bash
   git push origin $(git branch --show-current)
   ```
6. Return to the top of Step 4 and wait again.

Repeat until all checks pass.

---

## Step 5 — Squash merge

Once all CI checks are green, squash merge via GitHub:
```bash
gh pr merge <pr-number> --repo chrislawcodes/valuerank --squash --delete-branch
```

The squash commit message defaults to the PR title. If you want a custom message, add `--subject "your message"`.

After merge, confirm:
```bash
gh pr view <pr-number> --repo chrislawcodes/valuerank --json state,mergedAt
```

---

## Step 6 — Report to the user

Tell the user:
- PR URL and number
- Whether conflicts were found and how they were resolved
- Whether CI required fixes and what was changed
- The final squash commit SHA on main (run `git log origin/main --oneline -1`)
