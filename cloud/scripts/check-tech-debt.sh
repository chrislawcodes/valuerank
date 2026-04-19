#!/usr/bin/env bash
# check-tech-debt.sh — Print a reminder when a flagged file is edited.
#
# Designed to be run from a Claude Code PostToolUse hook, a pre-commit hook,
# or against a PR's changed-files list. Reads docs/tech-debt/file-structure.json
# and, if the edited file is part of a known cluster or grandfather list,
# prints a reminder message.
#
# Always exits 0 — this is informational, not blocking.
#
# Usage:
#   ./scripts/check-tech-debt.sh <file>              # Single file
#   ./scripts/check-tech-debt.sh --changed          # All changed files vs origin/main

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
MANIFEST="$REPO_ROOT/docs/tech-debt/file-structure.json"

if [[ ! -f "$MANIFEST" ]]; then
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  # node not available — silent exit, don't break anything
  exit 0
fi

report_file() {
  local file="$1"
  # Normalize absolute paths into repo-relative
  case "$file" in
    "$REPO_ROOT"/*) file="${file#"$REPO_ROOT/"}" ;;
  esac
  [[ -z "$file" ]] && return 0

  TECH_DEBT_FILE="$file" TECH_DEBT_MANIFEST="$MANIFEST" \
    node --input-type=module -e '
    import fs from "node:fs";
    const manifest = JSON.parse(fs.readFileSync(process.env.TECH_DEBT_MANIFEST, "utf8"));
    const file = process.env.TECH_DEBT_FILE;

    const cluster = (manifest.clusters || []).find(c => (c.files || []).includes(file));
    if (cluster) {
      console.error("[tech-debt] " + file + " is part of cluster \"" + cluster.name + "\".");
      console.error("  Action: " + cluster.action);
      console.error("  Sibling files: " + cluster.files.filter(f => f !== file).join(", "));
      console.error("  See docs/tech-debt/file-structure.md.");
    }

    const gf = (manifest.grandfatheredLargeFiles || []).find(g => g.file === file);
    if (gf) {
      console.error("[tech-debt] " + file + " is grandfathered at " + gf.lines + " lines.");
      console.error("  Action: " + gf.action);
    }
  ' 2>&1 || true
}

if [[ "${1:-}" == "--changed" ]]; then
  MERGE_BASE=$(git merge-base HEAD origin/main 2>/dev/null || echo "HEAD~1")
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    report_file "$file"
  done < <(git diff --name-only "$MERGE_BASE"...HEAD 2>/dev/null || true)
elif [[ -n "${1:-}" ]]; then
  report_file "$1"
fi

exit 0
