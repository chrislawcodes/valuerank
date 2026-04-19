#!/usr/bin/env bash
# check-barrels.sh — Reject trivial re-export-only index.ts files.
#
# A barrel file that exists only to re-export its siblings adds an import
# indirection without encapsulation, and is a telltale sign of over-splitting.
# If an index.ts has fewer than 15 non-blank non-comment lines AND every line
# is an `export` statement, this script rejects it.
#
# Grandfather list: cloud/scripts/barrel-allowlist.txt
#
# Usage:
#   ./scripts/check-barrels.sh              # Check files changed vs origin/main
#   ./scripts/check-barrels.sh --all         # Audit all index.ts files
#
# Exit codes:
#   0 — No new trivial barrels
#   1 — At least one new trivial barrel file

set -euo pipefail

MAX_TRIVIAL_LINES=15
REPO_ROOT="$(git rev-parse --show-toplevel)"
CLOUD_DIR="$REPO_ROOT/cloud"
ALLOWLIST="$CLOUD_DIR/scripts/barrel-allowlist.txt"
MODE="changed"
BASE_REF="origin/main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)  MODE="all";  shift ;;
    --base) BASE_REF="$2"; shift 2 ;;
    *)      echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

should_check() {
  local file="$1"
  [[ "$(basename "$file")" == "index.ts" ]] || return 1
  case "$file" in
    */node_modules/*|*/dist/*|*/generated/*|*/build/*) return 1 ;;
    */tests/*|*/__tests__/*|*/test/*) return 1 ;;
    src/*) return 1 ;;
  esac
  return 0
}

is_allowlisted() {
  local file="$1"
  [[ -f "$ALLOWLIST" ]] || return 1
  grep -qxF "$file" "$ALLOWLIST"
}

# Returns 0 if the file is a trivial barrel (re-exports only, under limit).
is_trivial_barrel() {
  local file="$1"
  # Strip blank lines and // comments, then check:
  # - line count under threshold
  # - every remaining line starts with "export"
  local content
  content=$(grep -v '^\s*$' "$file" | grep -v '^\s*//')
  local total
  total=$(echo "$content" | wc -l | tr -d ' ')
  [[ "$total" -lt "$MAX_TRIVIAL_LINES" ]] || return 1
  local non_export
  non_export=$(echo "$content" | grep -cv '^\s*export\b' || true)
  [[ "$non_export" -eq 0 ]]
}

declare -a FILES=()
if [[ "$MODE" == "all" ]]; then
  while IFS= read -r -d '' file; do
    rel="${file#"$REPO_ROOT/"}"
    should_check "$rel" && FILES+=("$rel")
  done < <(find "$CLOUD_DIR" -type f -name 'index.ts' -print0)
else
  MERGE_BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null || echo "HEAD~1")
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    [[ -f "$REPO_ROOT/$file" ]] || continue
    should_check "$file" && FILES+=("$file")
  done < <(git diff --name-only --diff-filter=A "$MERGE_BASE"...HEAD 2>/dev/null || git diff --name-only --diff-filter=A HEAD~1)
fi

VIOLATIONS=0
VIOLATION_LIST=""

for file in "${FILES[@]}"; do
  full_path="$REPO_ROOT/$file"
  [[ -f "$full_path" ]] || continue
  if is_trivial_barrel "$full_path"; then
    if is_allowlisted "$file"; then
      continue
    fi
    VIOLATIONS=$((VIOLATIONS + 1))
    VIOLATION_LIST+="  ${file}"$'\n'
  fi
done

if [[ "$MODE" == "all" ]]; then
  echo "=== Barrel Audit (all index.ts files) ==="
  if (( VIOLATIONS > 0 )); then
    echo "${VIOLATIONS} trivial re-export barrel(s) (not in allowlist):"
    echo "$VIOLATION_LIST"
  else
    echo "No unlisted trivial barrels."
  fi
  exit 0
fi

if (( VIOLATIONS > 0 )); then
  echo "❌ Barrel check FAILED — ${VIOLATIONS} new file(s) are trivial re-export barrels:"
  echo "$VIOLATION_LIST"
  echo "Trivial barrels (< ${MAX_TRIVIAL_LINES} lines, export-only) add import indirection"
  echo "without encapsulation. Import directly from the source file instead, or add"
  echo "real behavior to the index.ts. If you must keep it, add to cloud/scripts/barrel-allowlist.txt."
  exit 1
fi

echo "✅ Barrel check passed."
exit 0
