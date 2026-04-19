#!/usr/bin/env bash
# check-filenames.sh — Reject placeholder-named helper files.
#
# Banned suffixes (see cloud/CLAUDE.md):
#   -helper.ts, -helpers.ts, -util.ts, -utils.ts, -misc.ts, -types-detail.ts
#
# These names usually mean "stuff I carved off a parent file to stay under the
# line limit" rather than a module with a clear responsibility. Give it a
# domain-meaningful name or don't split.
#
# Grandfather list: cloud/scripts/filename-allowlist.txt
#
# Usage:
#   ./scripts/check-filenames.sh              # Check files changed vs origin/main
#   ./scripts/check-filenames.sh --all         # Audit all files
#
# Exit codes:
#   0 — No new banned-name files
#   1 — At least one new changed file has a banned name

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CLOUD_DIR="$REPO_ROOT/cloud"
ALLOWLIST="$CLOUD_DIR/scripts/filename-allowlist.txt"
MODE="changed"
BASE_REF="origin/main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)  MODE="all";  shift ;;
    --base) BASE_REF="$2"; shift 2 ;;
    *)      echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

is_banned_name() {
  local file="$1"
  case "$file" in
    *-helper.ts|*-helpers.ts) return 0 ;;
    *-util.ts|*-utils.ts) return 0 ;;
    *-misc.ts) return 0 ;;
    *-types-detail.ts) return 0 ;;
  esac
  return 1
}

should_check() {
  local file="$1"
  case "$file" in
    *.ts) ;;
    *) return 1 ;;
  esac
  case "$file" in
    */node_modules/*|*/dist/*|*/generated/*|*/build/*) return 1 ;;
    *.test.ts|*.spec.ts) return 1 ;;
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

declare -a FILES=()
if [[ "$MODE" == "all" ]]; then
  while IFS= read -r -d '' file; do
    rel="${file#"$REPO_ROOT/"}"
    should_check "$rel" && FILES+=("$rel")
  done < <(find "$CLOUD_DIR" -type f -name '*.ts' -print0)
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
  if is_banned_name "$file"; then
    if is_allowlisted "$file"; then
      continue
    fi
    VIOLATIONS=$((VIOLATIONS + 1))
    VIOLATION_LIST+="  ${file}"$'\n'
  fi
done

if [[ "$MODE" == "all" ]]; then
  echo "=== Filename Audit (all files) ==="
  if (( VIOLATIONS > 0 )); then
    echo "${VIOLATIONS} file(s) with banned placeholder names (not in allowlist):"
    echo "$VIOLATION_LIST"
  else
    echo "No unlisted banned-name files."
  fi
  exit 0
fi

if (( VIOLATIONS > 0 )); then
  echo "❌ Filename check FAILED — ${VIOLATIONS} new file(s) use banned placeholder names:"
  echo "$VIOLATION_LIST"
  echo "Banned suffixes: -helper(s).ts, -util(s).ts, -misc.ts, -types-detail.ts"
  echo "Rename with a domain-meaningful name, or inline the logic back into its single caller."
  echo "If you must keep the name, add to cloud/scripts/filename-allowlist.txt with justification."
  exit 1
fi

echo "✅ Filename check passed."
exit 0
