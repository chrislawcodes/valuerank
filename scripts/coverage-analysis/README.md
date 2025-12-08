# Coverage Analysis Scripts

Scripts for analyzing test coverage data. Used by the `coverage-analyzer` agent.

Supports both TypeScript/JavaScript (via vitest/istanbul) and Python (via coverage.py).

## Project Structure

| Service | Path | Language | Coverage Location |
|---------|------|----------|-------------------|
| api | `cloud/apps/api` | TypeScript | `coverage/coverage-summary.json` |
| web | `cloud/apps/web` | TypeScript | `coverage/coverage-summary.json` |
| db | `cloud/packages/db` | TypeScript | `coverage/coverage-summary.json` |
| shared | `cloud/packages/shared` | TypeScript | `coverage/coverage-summary.json` |
| workers | `cloud/workers` | Python | `.coverage` (SQLite) or `coverage.json` |

## Scripts

### `parse-coverage-summary.js`

Parse coverage-summary.json files (TypeScript) and Python coverage data, outputting consolidated data.

```bash
# Get all coverage data as JSON (includes both TS and Python)
node scripts/coverage-analysis/parse-coverage-summary.js

# Filter by service
node scripts/coverage-analysis/parse-coverage-summary.js --service web
node scripts/coverage-analysis/parse-coverage-summary.js --service workers  # Python only

# Show only files below 80% threshold
node scripts/coverage-analysis/parse-coverage-summary.js --below-threshold --threshold 80

# Sort by coverage percentage (lowest first)
node scripts/coverage-analysis/parse-coverage-summary.js --sort pct --limit 20

# Filter by category
node scripts/coverage-analysis/parse-coverage-summary.js --category hooks
node scripts/coverage-analysis/parse-coverage-summary.js --category common  # Python common modules

# Human-readable table format
node scripts/coverage-analysis/parse-coverage-summary.js --format table
```

### `find-low-coverage.js`

Find files with lowest coverage, prioritized by impact. Supports both TypeScript and Python files.

```bash
# Get top 15 priority files (both TS and Python)
node scripts/coverage-analysis/find-low-coverage.js

# Get top 30 for web only
node scripts/coverage-analysis/find-low-coverage.js --limit 30 --service web

# Get Python files only
node scripts/coverage-analysis/find-low-coverage.js --service workers

# Exclude small files (< 20 lines)
node scripts/coverage-analysis/find-low-coverage.js --min-lines 20
```

### `check-changed-files.js`

Check coverage for files changed in current branch vs main. Supports both TypeScript and Python files.

```bash
# Check against origin/main
node scripts/coverage-analysis/check-changed-files.js

# Check against different base
node scripts/coverage-analysis/check-changed-files.js --base develop

# Use different threshold
node scripts/coverage-analysis/check-changed-files.js --threshold 70

# Human-readable summary
node scripts/coverage-analysis/check-changed-files.js --format summary
```

### `parse-test-output.js`

Parse test output to extract failures in structured format.

```bash
# Pipe test output
npm run test:coverage 2>&1 | node scripts/coverage-analysis/parse-test-output.js

# From a file
node scripts/coverage-analysis/parse-test-output.js < test-output.log
```

## Running Coverage Tests

### TypeScript/JavaScript

```bash
# Run all workspaces
cd cloud && npm run test:coverage --workspaces

# Run specific service
cd cloud && npm run test:coverage -w @valuerank/api
cd cloud && npm run test:coverage -w @valuerank/web
```

### Python

```bash
# Run Python tests with coverage
cd cloud/workers && PYTHONPATH=. pytest --cov=. --cov-report=term

# Generate JSON report for script consumption
cd cloud/workers && coverage json -o coverage.json
```

## Usage by coverage-analyzer Agent

The coverage-analyzer agent uses these scripts to efficiently process large coverage logs:

1. **Run tests with coverage**:
   ```bash
   # TypeScript
   cd cloud && npm run test:coverage --workspaces 2>&1 | tee /tmp/test-output.log

   # Python
   cd cloud/workers && PYTHONPATH=. pytest --cov=. --cov-report=term 2>&1 | tee /tmp/python-test-output.log
   ```

2. **Parse test results**: `node scripts/coverage-analysis/parse-test-output.js < /tmp/test-output.log`

3. **Analyze coverage**: Use appropriate script based on mode:
   - `debt` mode: `find-low-coverage.js`
   - `pr-check` mode: `check-changed-files.js`
   - `summary` mode: `parse-coverage-summary.js`

## Output Format

All scripts output JSON with a `language` field indicating whether files are `typescript` or `python`:

```json
{
  "files": [
    {
      "path": "cloud/apps/web/src/pages/Login.tsx",
      "service": "web",
      "language": "typescript",
      "coverage": { ... }
    },
    {
      "path": "cloud/workers/probe.py",
      "service": "workers",
      "language": "python",
      "coverage": { ... }
    }
  ]
}
```

## Extending Scripts

The coverage-analyzer agent may update these scripts as needed to improve efficiency. When modifying:

1. Maintain backward-compatible JSON output schemas
2. Add new options rather than changing existing behavior
3. Update this README with new usage examples
4. Test with actual coverage output before committing
