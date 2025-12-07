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
      .filter(f => f.match(/\.(ts|tsx|js|jsx)$/))
      .filter(f => !f.includes('.test.'))
      .filter(f => !f.includes('.spec.'))
      .filter(f => !f.includes('__tests__'))
      .filter(f => !f.includes('__mocks__'))
      .filter(f => f.startsWith('services/'));
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
  const match = filePath.match(/^services\/([^/]+)\//);
  return match ? match[1] : null;
}

function readCoverageSummary(service) {
  const summaryPath = path.join(PROJECT_ROOT, 'services', service, 'coverage', 'coverage-summary.json');

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
      if (absPath.includes(relativePath.split('/').slice(0, 2).join('/'))) {
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

    const fileResult = {
      path: filePath,
      service,
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
