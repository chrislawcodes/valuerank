# Coverage Analysis Scripts

Scripts for analyzing test coverage data. Used by the `coverage-analyzer` agent.

## Scripts

### `parse-coverage-summary.js`

Parse coverage-summary.json files and output consolidated data.

```bash
# Get all coverage data as JSON
node scripts/coverage-analysis/parse-coverage-summary.js

# Filter by service
node scripts/coverage-analysis/parse-coverage-summary.js --service frontend

# Show only files below 80% threshold
node scripts/coverage-analysis/parse-coverage-summary.js --below-threshold --threshold 80

# Sort by coverage percentage (lowest first)
node scripts/coverage-analysis/parse-coverage-summary.js --sort pct --limit 20

# Filter by category
node scripts/coverage-analysis/parse-coverage-summary.js --category hooks

# Human-readable table format
node scripts/coverage-analysis/parse-coverage-summary.js --format table
```

### `find-low-coverage.js`

Find files with lowest coverage, prioritized by impact.

```bash
# Get top 15 priority files
node scripts/coverage-analysis/find-low-coverage.js

# Get top 30 for frontend only
node scripts/coverage-analysis/find-low-coverage.js --limit 30 --service frontend

# Exclude small files (< 20 lines)
node scripts/coverage-analysis/find-low-coverage.js --min-lines 20
```

### `check-changed-files.js`

Check coverage for files changed in current branch vs main.

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

## Usage by coverage-analyzer Agent

The coverage-analyzer agent uses these scripts to efficiently process large coverage logs:

1. **Run tests with coverage**: `npm run test:coverage --workspaces 2>&1 | tee /tmp/test-output.log`
2. **Parse test results**: `node scripts/coverage-analysis/parse-test-output.js < /tmp/test-output.log`
3. **Analyze coverage**: Use appropriate script based on mode:
   - `debt` mode: `find-low-coverage.js`
   - `pr-check` mode: `check-changed-files.js`
   - `summary` mode: `parse-coverage-summary.js`

## Extending Scripts

The coverage-analyzer agent may update these scripts as needed to improve efficiency. When modifying:

1. Maintain backward-compatible JSON output schemas
2. Add new options rather than changing existing behavior
3. Update this README with new usage examples
4. Test with actual coverage output before committing
