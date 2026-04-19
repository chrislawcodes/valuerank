#!/usr/bin/env bash
# check-file-sizes.sh — Enforce tiered file size limits.
#
# Thresholds (see cloud/CLAUDE.md):
#   Production source: warn at 400, error at 700
#   Test files:        warn at 800, error at 1200
#   Generated, dist, legacy src/, prisma: skipped
#
# Grandfather list: cloud/scripts/file-size-allowlist.txt
#   Files listed there are exempt from the hard error (still get a warning).
#
# Usage:
#   ./scripts/check-file-sizes.sh              # Check files changed vs origin/main
#   ./scripts/check-file-sizes.sh --base HEAD~1 # Check files changed vs specific ref
#   ./scripts/check-file-sizes.sh --all         # Audit all files (non-blocking report)
#
# Exit codes:
#   0 — No hard-error violations (warnings still printed)
#   1 — At least one changed file exceeds the hard error limit

set -euo pipefail

WARN_PROD=400
ERROR_PROD=700
WARN_TEST=800
ERROR_TEST=1200

REPO_ROOT="$(git rev-parse --show-toplevel)"
CLOUD_DIR="$REPO_ROOT/cloud"
ALLOWLIST="$CLOUD_DIR/scripts/file-size-allowlist.txt"
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
is_test_file() {
  local file="$1"
  case "$file" in
    *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) return 0 ;;
    */tests/*|*/__tests__/*|*/test/*) return 0 ;;
  esac
  return 1
}

should_check() {
  local file="$1"

  # Only check TS/TSX/Python source files
  case "$file" in
    *.ts|*.tsx|*.py) ;;
    *) return 1 ;;
  esac

  # Skip generated, vendor, build output
  case "$file" in
    */generated/*|*/node_modules/*|*/dist/*|*/build/*) return 1 ;;
    */prisma/migrations/*) return 1 ;;
  esac

  # Skip legacy src/ — not the active product
  case "$file" in
    src/*) return 1 ;;
  esac

  # Skip Feature Factory / review-lens workflow tooling.
  # These are orchestration scripts under docs/workflow/, not cloud/*
  # application code. They legitimately grow larger because they're glue
  # between subprocesses (codex/gemini/claude CLIs, gh, git) where each
  # code path has its own I/O contract. Splitting them into many small
  # modules makes the spec-time reasoning harder, not easier.
  # Scoped narrowly so real application drift can't hide here.
  case "$file" in
    docs/workflow/operations/codex-skills/*) return 1 ;;
  esac

  return 0
}

is_allowlisted() {
  local file="$1"
  [[ -f "$ALLOWLIST" ]] || return 1
  grep -qxF "$file" "$ALLOWLIST"
}

count_lines() {
  wc -l < "$1" | tr -d ' '
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
ERRORS=0
WARNINGS=0
ERROR_LIST=""
WARN_LIST=""

# Empty array under `set -u` would error on "${FILES[@]}" dereference.
if (( ${#FILES[@]} == 0 )); then
  FILES=()
fi

for file in "${FILES[@]+"${FILES[@]}"}"; do
  full_path="$REPO_ROOT/$file"
  lines=$(count_lines "$full_path")

  if is_test_file "$file"; then
    warn=$WARN_TEST; err=$ERROR_TEST; tier="test"
  else
    warn=$WARN_PROD; err=$ERROR_PROD; tier="prod"
  fi

  if (( lines > err )); then
    if is_allowlisted "$file"; then
      WARNINGS=$((WARNINGS + 1))
      WARN_LIST+="  ${lines} lines [${tier}, grandfathered]  ${file}"$'\n'
    else
      ERRORS=$((ERRORS + 1))
      ERROR_LIST+="  ${lines} lines [${tier}, limit ${err}]  ${file}"$'\n'
    fi
  elif (( lines > warn )); then
    WARNINGS=$((WARNINGS + 1))
    WARN_LIST+="  ${lines} lines [${tier}, over warn ${warn}]  ${file}"$'\n'
  fi
done

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
if [[ "$MODE" == "all" ]]; then
  echo "=== File Size Audit (all files) ==="
  echo "Thresholds: prod ${WARN_PROD}/${ERROR_PROD}, test ${WARN_TEST}/${ERROR_TEST}"
  echo ""
  if (( ERRORS > 0 )); then
    echo "${ERRORS} file(s) exceed hard error limit:"
    echo "$ERROR_LIST" | sort -rn
    echo ""
  fi
  if (( WARNINGS > 0 )); then
    echo "${WARNINGS} file(s) over warn threshold:"
    echo "$WARN_LIST" | sort -rn
  fi
  if (( ERRORS == 0 && WARNINGS == 0 )); then
    echo "All files within thresholds."
  fi
  # Audit mode always exits 0
  exit 0
fi

# Changed-files mode
if (( WARNINGS > 0 )); then
  echo "⚠️  File size warnings — ${WARNINGS} file(s) over warn threshold:"
  echo "$WARN_LIST" | sort -rn
  echo ""
fi

if (( ERRORS > 0 )); then
  echo "❌ File size check FAILED — ${ERRORS} changed file(s) exceed hard error limit:"
  echo "$ERROR_LIST" | sort -rn
  echo ""
  echo "Split the file by responsibility, or add to cloud/scripts/file-size-allowlist.txt"
  echo "with a justification. See docs/tech-debt/file-structure.md."
  exit 1
fi

if (( ${#FILES[@]} > 0 )); then
  echo "✅ File size check passed — ${#FILES[@]} changed file(s) checked."
else
  echo "✅ File size check passed — no checkable files changed."
fi
exit 0
