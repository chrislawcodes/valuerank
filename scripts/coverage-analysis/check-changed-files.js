#!/usr/bin/env node
/**
 * Check coverage for files changed in current branch vs main
 *
 * Usage:
 *   node scripts/coverage-analysis/check-changed-files.js [options]
 *
 * Options:
 *   --base <ref>        Base reference to compare (default: origin/main)
 *   --threshold <n>     Required coverage percentage (default: 80)
 *   --format <type>     Output format: json (default), summary
 *
 * Output: JSON with pass/fail status and file details
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Updated service definitions for the actual project structure
const SERVICES = {
  api: { path: 'cloud/apps/api', type: 'js' },
  web: { path: 'cloud/apps/web', type: 'js' },
  db: { path: 'cloud/packages/db', type: 'js' },
  shared: { path: 'cloud/packages/shared', type: 'js' },
  workers: { path: 'cloud/workers', type: 'python' },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    base: 'origin/main',
    threshold: 80,
    format: 'json',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--base':
        options.base = args[++i];
        break;
      case '--threshold':
        options.threshold = parseFloat(args[++i]);
        break;
      case '--format':
        options.format = args[++i];
        break;
    }
  }

  return options;
}

function getChangedFiles(base) {
  try {
    const output = execSync(`git diff --name-only ${base}...HEAD`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    });

    return output
      .split('\n')
      .filter(f => f.trim())
      .filter(f => f.match(/\.(ts|tsx|js|jsx|py)$/))  // Include Python files
      .filter(f => !f.includes('.test.'))
      .filter(f => !f.includes('.spec.'))
      .filter(f => !f.includes('__tests__'))
      .filter(f => !f.includes('__mocks__'))
      .filter(f => !f.includes('/tests/'))
      .filter(f => !f.includes('test_'))
      .filter(f => !f.includes('conftest.py'))
      .filter(f => f.startsWith('cloud/'));  // Changed from services/ to cloud/
  } catch (e) {
    // Only return empty for expected errors (no commits, not a git repo)
    const msg = e.message || '';
    if (msg.includes('unknown revision') || msg.includes('not a git repository') || msg.includes('does not have any commits')) {
      return [];
    }
    // Re-throw unexpected errors
    throw e;
  }
}

function detectService(filePath) {
  // Match cloud/apps/<service> or cloud/packages/<service> or cloud/workers
  const appsMatch = filePath.match(/^cloud\/apps\/([^/]+)\//);
  if (appsMatch) {
    return appsMatch[1];
  }

  const packagesMatch = filePath.match(/^cloud\/packages\/([^/]+)\//);
  if (packagesMatch) {
    return packagesMatch[1];
  }

  if (filePath.startsWith('cloud/workers/')) {
    return 'workers';
  }

  return null;
}

function readJsCoverageSummary(servicePath) {
  const summaryPath = path.join(PROJECT_ROOT, servicePath, 'coverage', 'coverage-summary.json');

  if (!fs.existsSync(summaryPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(summaryPath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

function readPythonCoverage(servicePath) {
  const coverageFile = path.join(PROJECT_ROOT, servicePath, '.coverage');

  if (!fs.existsSync(coverageFile)) {
    return null;
  }

  try {
    // Try to run coverage json first
    const coverageJsonPath = path.join(PROJECT_ROOT, servicePath, 'coverage.json');

    try {
      execSync(`cd "${path.join(PROJECT_ROOT, servicePath)}" && coverage json -o coverage.json 2>/dev/null`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (fs.existsSync(coverageJsonPath)) {
        const content = fs.readFileSync(coverageJsonPath, 'utf-8');
        const data = JSON.parse(content);

        // Convert to our format
        const result = {};

        if (data.files) {
          for (const [filePath, fileData] of Object.entries(data.files)) {
            const summary = fileData.summary || {};
            result[filePath] = {
              lines: {
                total: summary.num_statements || 0,
                covered: summary.covered_lines || 0,
                skipped: 0,
                pct: summary.percent_covered || 0,
              },
              branches: {
                total: summary.num_branches || 0,
                covered: summary.covered_branches || 0,
                skipped: 0,
                pct: summary.num_branches > 0
                  ? Math.round((summary.covered_branches / summary.num_branches) * 10000) / 100
                  : 0,
              },
              functions: { total: 0, covered: 0, skipped: 0, pct: 0 },
              statements: {
                total: summary.num_statements || 0,
                covered: summary.covered_lines || 0,
                skipped: 0,
                pct: summary.percent_covered || 0,
              },
            };
          }
        }

        return result;
      }
    } catch (e) {
      // Fall through to text parsing
    }

    // Fallback: parse coverage report text output
    const output = execSync(`cd "${path.join(PROJECT_ROOT, servicePath)}" && coverage report 2>/dev/null`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.split('\n');
    const result = {};

    for (const line of lines) {
      // Match lines like: common/errors.py    82      1    99%
      const match = line.match(/^(\S+\.py)\s+(\d+)\s+(\d+)\s+(\d+)%/);
      if (match) {
        const [, filePath, stmts, miss, pct] = match;
        const total = parseInt(stmts, 10);
        const missed = parseInt(miss, 10);
        const covered = total - missed;
        const percentage = parseInt(pct, 10);

        const fullPath = path.join(PROJECT_ROOT, servicePath, filePath);

        result[fullPath] = {
          lines: { total, covered, skipped: 0, pct: percentage },
          statements: { total, covered, skipped: 0, pct: percentage },
          functions: { total: 0, covered: 0, skipped: 0, pct: 0 },
          branches: { total: 0, covered: 0, skipped: 0, pct: 0 },
        };
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (e) {
    return null;
  }
}

function readCoverageSummary(serviceName) {
  const serviceConfig = SERVICES[serviceName];
  if (!serviceConfig) {
    return null;
  }

  if (serviceConfig.type === 'python') {
    return readPythonCoverage(serviceConfig.path);
  } else {
    return readJsCoverageSummary(serviceConfig.path);
  }
}

function findFileCoverage(coverageData, relativePath) {
  // Try to find the file in coverage data
  // Coverage keys are absolute paths, so we need to search
  for (const [absPath, metrics] of Object.entries(coverageData)) {
    if (absPath === 'total') continue;
    if (absPath.endsWith(relativePath) || absPath.includes(relativePath)) {
      return metrics;
    }
  }

  // Also try with just the filename portion for partial matches
  const filename = path.basename(relativePath);
  for (const [absPath, metrics] of Object.entries(coverageData)) {
    if (absPath === 'total') continue;
    if (absPath.endsWith(filename)) {
      // Verify it's in the right service directory
      if (absPath.includes(relativePath.split('/').slice(0, 3).join('/'))) {
        return metrics;
      }
    }
  }

  return null;
}

function main() {
  const options = parseArgs();

  const changedFiles = getChangedFiles(options.base);

  if (changedFiles.length === 0) {
    const result = {
      success: true,
      base: options.base,
      threshold: options.threshold,
      message: 'No source files changed',
      summary: {
        totalFilesChanged: 0,
        filesMeetingThreshold: 0,
        filesBelowThreshold: 0,
        filesNotFound: 0,
        newFiles: 0,
        averageCoverage: null,
      },
      files: [],
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Load coverage data by service
  const coverageByService = {};
  const services = [...new Set(changedFiles.map(detectService).filter(Boolean))];

  for (const service of services) {
    coverageByService[service] = readCoverageSummary(service);
  }

  // Check each changed file
  const fileResults = [];
  let totalCoverage = 0;
  let coverageCount = 0;

  for (const filePath of changedFiles) {
    const service = detectService(filePath);
    if (!service) continue;

    const coverageData = coverageByService[service];
    const serviceConfig = SERVICES[service];
    const isPython = serviceConfig && serviceConfig.type === 'python';

    const fileResult = {
      path: filePath,
      service,
      language: isPython ? 'python' : 'typescript',
      coverage: null,
      meetsThreshold: false,
      status: 'not-found',
    };

    if (!coverageData) {
      fileResult.status = 'no-coverage-data';
      fileResults.push(fileResult);
      continue;
    }

    const metrics = findFileCoverage(coverageData, filePath);

    if (!metrics) {
      // Check if file exists - if new, mark appropriately
      const fullPath = path.join(PROJECT_ROOT, filePath);
      if (fs.existsSync(fullPath)) {
        fileResult.status = 'new';
      } else {
        fileResult.status = 'not-found';
      }
      fileResults.push(fileResult);
      continue;
    }

    fileResult.coverage = {
      lines: {
        pct: metrics.lines.pct,
        covered: metrics.lines.covered,
        total: metrics.lines.total,
      },
      branches: {
        pct: metrics.branches.pct,
        covered: metrics.branches.covered,
        total: metrics.branches.total,
      },
      functions: {
        pct: metrics.functions.pct,
        covered: metrics.functions.covered,
        total: metrics.functions.total,
      },
      statements: {
        pct: metrics.statements.pct,
        covered: metrics.statements.covered,
        total: metrics.statements.total,
      },
    };

    fileResult.meetsThreshold = metrics.lines.pct >= options.threshold;
    fileResult.status = fileResult.meetsThreshold ? 'pass' : 'fail';

    totalCoverage += metrics.lines.pct;
    coverageCount++;

    fileResults.push(fileResult);
  }

  // Calculate summary
  const passing = fileResults.filter(f => f.status === 'pass').length;
  const failing = fileResults.filter(f => f.status === 'fail').length;
  const notFound = fileResults.filter(f => f.status === 'not-found' || f.status === 'no-coverage-data').length;
  const newFiles = fileResults.filter(f => f.status === 'new').length;

  const result = {
    success: failing === 0,
    base: options.base,
    threshold: options.threshold,
    summary: {
      totalFilesChanged: fileResults.length,
      filesMeetingThreshold: passing,
      filesBelowThreshold: failing,
      filesNotFound: notFound,
      newFiles,
      averageCoverage: coverageCount > 0 ? Math.round((totalCoverage / coverageCount) * 100) / 100 : null,
    },
    files: fileResults,
    recommendation: failing > 0
      ? `${failing} file(s) below ${options.threshold}% threshold. Add tests before committing.`
      : newFiles > 0
        ? `${newFiles} new file(s) without coverage data. Run tests to generate coverage.`
        : 'All changed files meet coverage threshold.',
  };

  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n=== Coverage Check: ${result.success ? 'PASS' : 'FAIL'} ===\n`);
    console.log(`Threshold: ${options.threshold}%`);
    console.log(`Files changed: ${result.summary.totalFilesChanged}`);
    console.log(`Passing: ${passing}, Failing: ${failing}, Not found: ${notFound}, New: ${newFiles}`);
    if (result.summary.averageCoverage !== null) {
      console.log(`Average coverage: ${result.summary.averageCoverage}%`);
    }
    console.log(`\n${result.recommendation}`);

    if (failing > 0) {
      console.log('\nFiles below threshold:');
      fileResults
        .filter(f => f.status === 'fail')
        .forEach(f => {
          console.log(`  ✗ ${f.path}: ${f.coverage.lines.pct}%`);
        });
    }
  }
}

main();
