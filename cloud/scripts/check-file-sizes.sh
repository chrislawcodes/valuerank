#!/usr/bin/env bash
# check-file-sizes.sh — Enforce the 400-line file size limit from CLAUDE.md.
#
# Usage:
#   ./scripts/check-file-sizes.sh              # Check files changed vs origin/main
#   ./scripts/check-file-sizes.sh --base HEAD~1 # Check files changed vs specific ref
#   ./scripts/check-file-sizes.sh --all         # Audit all files (non-blocking report)
#
# Exit codes:
#   0 — No violations (or --all mode, which always exits 0)
#   1 — At least one changed file exceeds the limit

set -euo pipefail

MAX_LINES=400
REPO_ROOT="$(git rev-parse --show-toplevel)"
CLOUD_DIR="$REPO_ROOT/cloud"
MODE="changed"
BASE_REF="origin/main"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)  MODE="all";  shift ;;
    --base) BASE_REF="$2"; shift 2 ;;
    *)      echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
should_check() {
  local file="$1"

  # Only check source files
  case "$file" in
    *.ts|*.tsx|*.py) ;;
    *) return 1 ;;
  esac

  # Skip test files — CLAUDE.md allows tests to exceed the limit
  case "$file" in
    *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) return 1 ;;
    */tests/*|*/__tests__/*|*/test/*) return 1 ;;
  esac

  # Skip generated files
  case "$file" in
    */generated/*|*/node_modules/*|*/dist/*|*/build/*) return 1 ;;
  esac

  # Skip legacy src/ — not the active product
  case "$file" in
    src/*) return 1 ;;
  esac

  return 0
}

count_lines() {
  wc -l < "$1"
}

# ---------------------------------------------------------------------------
# Collect files to check
# ---------------------------------------------------------------------------
declare -a FILES=()

if [[ "$MODE" == "all" ]]; then
  while IFS= read -r -d '' file; do
    rel="${file#"$REPO_ROOT/"}"
    if should_check "$rel"; then
      FILES+=("$rel")
    fi
  done < <(find "$CLOUD_DIR" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.py' \) -print0)
else
  MERGE_BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null || echo "HEAD~1")
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    [[ -f "$REPO_ROOT/$file" ]] || continue
    if should_check "$file"; then
      FILES+=("$file")
    fi
  done < <(git diff --name-only "$MERGE_BASE"...HEAD 2>/dev/null || git diff --name-only HEAD~1)
fi

# ---------------------------------------------------------------------------
# Check sizes
# ---------------------------------------------------------------------------
VIOLATIONS=0
VIOLATION_LIST=""

for file in "${FILES[@]}"; do
  full_path="$REPO_ROOT/$file"
  lines=$(count_lines "$full_path")
  if (( lines > MAX_LINES )); then
    VIOLATIONS=$((VIOLATIONS + 1))
    pct=$(( (lines - MAX_LINES) * 100 / MAX_LINES ))
    VIOLATION_LIST+="  ${lines} lines (+${pct}% over)  ${file}"$'\n'
  fi
done

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
if [[ "$MODE" == "all" ]]; then
  echo "=== File Size Audit (all files, limit: ${MAX_LINES} lines) ==="
  if (( VIOLATIONS > 0 )); then
    echo ""
    echo "${VIOLATIONS} file(s) exceed the ${MAX_LINES}-line limit:"
    echo ""
    echo "$VIOLATION_LIST" | sort -rn
  else
    echo "All files are within the ${MAX_LINES}-line limit."
  fi
  # Audit mode always exits 0
  exit 0
fi

# Changed-files mode
if (( VIOLATIONS > 0 )); then
  echo "❌ File size check FAILED — ${VIOLATIONS} changed file(s) exceed the ${MAX_LINES}-line limit:"
  echo ""
  echo "$VIOLATION_LIST" | sort -rn
  echo ""
  echo "Split oversized files before merging. See CLAUDE.md for guidance."
  exit 1
else
  if (( ${#FILES[@]} > 0 )); then
    echo "✅ File size check passed — ${#FILES[@]} changed file(s) checked, all within ${MAX_LINES} lines."
  else
    echo "✅ File size check passed — no checkable files changed."
  fi
  exit 0
fi
