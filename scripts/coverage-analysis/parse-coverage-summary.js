#!/usr/bin/env node
/**
 * Parse coverage-summary.json files and output consolidated data
 *
 * Usage:
 *   node scripts/coverage-analysis/parse-coverage-summary.js [options]
 *
 * Options:
 *   --service <name>    Filter by service (api, web, db, shared, workers)
 *   --format <type>     Output format: json (default), table
 *   --sort <field>      Sort by: uncovered, pct, path (default: uncovered)
 *   --limit <n>         Limit results (default: all)
 *   --threshold <n>     Coverage threshold percentage (default: 80)
 *   --below-threshold   Only show files below threshold
 *   --category <name>   Filter by category (components, hooks, utils, etc.)
 *
 * Output: JSON object with parsed coverage data
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Updated service definitions for the actual project structure
const SERVICES = {
  api: { path: 'cloud/apps/api', type: 'js' },
  web: { path: 'cloud/apps/web', type: 'js' },
  db: { path: 'cloud/packages/db', type: 'js' },
  shared: { path: 'cloud/packages/shared', type: 'js' },
  workers: { path: 'cloud/workers', type: 'python' },
};

const PROJECT_ROOT = path.resolve(__dirname, '../..');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    service: null,
    format: 'json',
    sort: 'uncovered',
    limit: null,
    threshold: 80,
    belowThreshold: false,
    category: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--service':
        options.service = args[++i];
        break;
      case '--format':
        options.format = args[++i];
        break;
      case '--sort':
        options.sort = args[++i];
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--threshold':
        options.threshold = parseFloat(args[++i]);
        break;
      case '--below-threshold':
        options.belowThreshold = true;
        break;
      case '--category':
        options.category = args[++i];
        break;
    }
  }

  return options;
}

function detectCategory(filePath) {
  if (filePath.includes('/components/')) return 'components';
  if (filePath.includes('/hooks/')) return 'hooks';
  if (filePath.includes('/utils/') || filePath.includes('/lib/')) return 'utils';
  if (filePath.includes('/pages/')) return 'pages';
  if (filePath.includes('/controllers/')) return 'controllers';
  if (filePath.includes('/services/') && !filePath.startsWith('services/')) return 'services';
  if (filePath.includes('/graphql/')) return 'graphql';
  if (filePath.includes('/middleware/')) return 'middleware';
  if (filePath.includes('/contexts/')) return 'contexts';
  if (filePath.includes('/queries/')) return 'queries';
  if (filePath.includes('/providers/')) return 'providers';
  if (filePath.includes('/common/')) return 'common';
  if (filePath.includes('/auth/')) return 'auth';
  if (filePath.includes('/api/')) return 'api';
  if (filePath.includes('/queue/')) return 'queue';
  return 'other';
}

function isTestFile(filePath) {
  return (
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('__tests__/') ||
    filePath.includes('__mocks__/') ||
    filePath.includes('/tests/') ||
    filePath.includes('test_') ||
    filePath.includes('conftest.py')
  );
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
    console.error(`Error reading coverage for ${servicePath}: ${e.message}`);
    return null;
  }
}

function readPythonCoverage(servicePath) {
  const coverageFile = path.join(PROJECT_ROOT, servicePath, '.coverage');

  if (!fs.existsSync(coverageFile)) {
    return null;
  }

  try {
    // Run coverage json to generate coverage.json, then read it
    const coverageJsonPath = path.join(PROJECT_ROOT, servicePath, 'coverage.json');

    // Generate JSON report from .coverage file
    execSync(`cd "${path.join(PROJECT_ROOT, servicePath)}" && coverage json -o coverage.json 2>/dev/null`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!fs.existsSync(coverageJsonPath)) {
      // Fallback: parse coverage report text output
      return parsePythonCoverageReport(servicePath);
    }

    const content = fs.readFileSync(coverageJsonPath, 'utf-8');
    const data = JSON.parse(content);

    // Convert Python coverage.json format to match JS coverage-summary.json format
    const result = { total: null };

    if (data.totals) {
      result.total = {
        lines: {
          total: data.totals.num_statements || 0,
          covered: data.totals.covered_lines || 0,
          skipped: 0,
          pct: data.totals.percent_covered || 0,
        },
        statements: {
          total: data.totals.num_statements || 0,
          covered: data.totals.covered_lines || 0,
          skipped: 0,
          pct: data.totals.percent_covered || 0,
        },
        functions: {
          total: 0,
          covered: 0,
          skipped: 0,
          pct: 0,
        },
        branches: {
          total: data.totals.num_branches || 0,
          covered: data.totals.covered_branches || 0,
          skipped: 0,
          pct: data.totals.num_branches > 0
            ? Math.round((data.totals.covered_branches / data.totals.num_branches) * 10000) / 100
            : 0,
        },
      };
    }

    // Add per-file data
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
          statements: {
            total: summary.num_statements || 0,
            covered: summary.covered_lines || 0,
            skipped: 0,
            pct: summary.percent_covered || 0,
          },
          functions: {
            total: 0,
            covered: 0,
            skipped: 0,
            pct: 0,
          },
          branches: {
            total: summary.num_branches || 0,
            covered: summary.covered_branches || 0,
            skipped: 0,
            pct: summary.num_branches > 0
              ? Math.round((summary.covered_branches / summary.num_branches) * 10000) / 100
              : 0,
          },
        };
      }
    }

    return result;
  } catch (e) {
    // Fallback to parsing text report
    return parsePythonCoverageReport(servicePath);
  }
}

function parsePythonCoverageReport(servicePath) {
  try {
    const output = execSync(`cd "${path.join(PROJECT_ROOT, servicePath)}" && coverage report 2>/dev/null`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.split('\n');
    const result = { total: null };

    let totalStmts = 0;
    let totalMiss = 0;

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

        totalStmts += total;
        totalMiss += missed;
      }

      // Match TOTAL line
      const totalMatch = line.match(/^TOTAL\s+(\d+)\s+(\d+)\s+(\d+)%/);
      if (totalMatch) {
        const [, stmts, miss, pct] = totalMatch;
        const total = parseInt(stmts, 10);
        const missed = parseInt(miss, 10);
        const covered = total - missed;
        const percentage = parseInt(pct, 10);

        result.total = {
          lines: { total, covered, skipped: 0, pct: percentage },
          statements: { total, covered, skipped: 0, pct: percentage },
          functions: { total: 0, covered: 0, skipped: 0, pct: 0 },
          branches: { total: 0, covered: 0, skipped: 0, pct: 0 },
        };
      }
    }

    // If no TOTAL found, calculate it
    if (!result.total && totalStmts > 0) {
      const covered = totalStmts - totalMiss;
      result.total = {
        lines: {
          total: totalStmts,
          covered,
          skipped: 0,
          pct: Math.round((covered / totalStmts) * 10000) / 100,
        },
        statements: {
          total: totalStmts,
          covered,
          skipped: 0,
          pct: Math.round((covered / totalStmts) * 10000) / 100,
        },
        functions: { total: 0, covered: 0, skipped: 0, pct: 0 },
        branches: { total: 0, covered: 0, skipped: 0, pct: 0 },
      };
    }

    return Object.keys(result).length > 1 ? result : null;
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

function processFiles(coverageData, serviceName) {
  const files = [];
  const serviceConfig = SERVICES[serviceName];

  for (const [absolutePath, metrics] of Object.entries(coverageData)) {
    if (absolutePath === 'total') continue;

    // Convert to relative path
    const relativePath = absolutePath.replace(PROJECT_ROOT + '/', '');

    if (isTestFile(relativePath)) continue;

    const category = detectCategory(relativePath);
    const uncoveredLines = metrics.lines.total - metrics.lines.covered;

    files.push({
      path: relativePath,
      service: serviceName,
      category,
      language: serviceConfig.type === 'python' ? 'python' : 'typescript',
      coverage: {
        lines: {
          pct: metrics.lines.pct,
          covered: metrics.lines.covered,
          total: metrics.lines.total,
          uncovered: uncoveredLines,
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
      },
    });
  }

  return files;
}

function main() {
  const options = parseArgs();
  const servicesToProcess = options.service ? [options.service] : Object.keys(SERVICES);

  let allFiles = [];
  const serviceSummaries = {};
  const categorySummaries = {};
  let overallTotal = {
    lines: 0,
    covered: 0,
    branches: 0,
    branchesCovered: 0,
    functions: 0,
    functionsCovered: 0,
  };

  for (const serviceName of servicesToProcess) {
    if (!SERVICES[serviceName]) {
      serviceSummaries[serviceName] = { error: `Unknown service: ${serviceName}` };
      continue;
    }

    const coverageData = readCoverageSummary(serviceName);

    if (!coverageData) {
      serviceSummaries[serviceName] = { error: 'No coverage data found' };
      continue;
    }

    const files = processFiles(coverageData, serviceName);
    allFiles = allFiles.concat(files);

    // Calculate service summary from total
    if (coverageData.total) {
      serviceSummaries[serviceName] = {
        lines: coverageData.total.lines.pct,
        branches: coverageData.total.branches.pct,
        functions: coverageData.total.functions.pct,
        statements: coverageData.total.statements.pct,
        fileCount: files.length,
        language: SERVICES[serviceName].type === 'python' ? 'python' : 'typescript',
      };

      overallTotal.lines += coverageData.total.lines.total;
      overallTotal.covered += coverageData.total.lines.covered;
      overallTotal.branches += coverageData.total.branches.total;
      overallTotal.branchesCovered += coverageData.total.branches.covered;
      overallTotal.functions += coverageData.total.functions.total;
      overallTotal.functionsCovered += coverageData.total.functions.covered;
    }
  }

  // Apply filters
  if (options.category) {
    allFiles = allFiles.filter(f => f.category === options.category);
  }

  if (options.belowThreshold) {
    allFiles = allFiles.filter(f => f.coverage.lines.pct < options.threshold);
  }

  // Sort files
  switch (options.sort) {
    case 'uncovered':
      allFiles.sort((a, b) => b.coverage.lines.uncovered - a.coverage.lines.uncovered);
      break;
    case 'pct':
      allFiles.sort((a, b) => a.coverage.lines.pct - b.coverage.lines.pct);
      break;
    case 'path':
      allFiles.sort((a, b) => a.path.localeCompare(b.path));
      break;
  }

  // Apply limit
  if (options.limit) {
    allFiles = allFiles.slice(0, options.limit);
  }

  // Calculate category summaries
  for (const file of allFiles) {
    if (!categorySummaries[file.category]) {
      categorySummaries[file.category] = { totalLines: 0, coveredLines: 0, fileCount: 0 };
    }
    categorySummaries[file.category].totalLines += file.coverage.lines.total;
    categorySummaries[file.category].coveredLines += file.coverage.lines.covered;
    categorySummaries[file.category].fileCount++;
  }

  // Convert category summaries to percentages
  for (const [cat, summary] of Object.entries(categorySummaries)) {
    summary.pct = summary.totalLines > 0
      ? Math.round((summary.coveredLines / summary.totalLines) * 10000) / 100
      : 0;
  }

  const result = {
    timestamp: new Date().toISOString(),
    options: {
      service: options.service,
      threshold: options.threshold,
      sort: options.sort,
      limit: options.limit,
      belowThreshold: options.belowThreshold,
      category: options.category,
    },
    overall: {
      lines: {
        pct: overallTotal.lines > 0 ? Math.round((overallTotal.covered / overallTotal.lines) * 10000) / 100 : 0,
        covered: overallTotal.covered,
        total: overallTotal.lines,
      },
      branches: {
        pct: overallTotal.branches > 0 ? Math.round((overallTotal.branchesCovered / overallTotal.branches) * 10000) / 100 : 0,
        covered: overallTotal.branchesCovered,
        total: overallTotal.branches,
      },
      functions: {
        pct: overallTotal.functions > 0 ? Math.round((overallTotal.functionsCovered / overallTotal.functions) * 10000) / 100 : 0,
        covered: overallTotal.functionsCovered,
        total: overallTotal.functions,
      },
    },
    byService: serviceSummaries,
    byCategory: categorySummaries,
    totalFiles: allFiles.length,
    files: allFiles,
  };

  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.format === 'table') {
    console.log('\n=== Coverage Summary ===\n');
    console.log(`Overall: ${result.overall.lines.pct}% lines covered`);
    console.log(`\nBy Service:`);
    for (const [svc, summary] of Object.entries(serviceSummaries)) {
      if (summary.error) {
        console.log(`  ${svc}: ${summary.error}`);
      } else {
        const lang = summary.language === 'python' ? '(Python)' : '(TS/JS)';
        console.log(`  ${svc} ${lang}: ${summary.lines}% (${summary.fileCount} files)`);
      }
    }
    console.log(`\nTop ${allFiles.length} files by uncovered lines:`);
    allFiles.slice(0, 20).forEach((f, i) => {
      const status = f.coverage.lines.pct >= options.threshold ? '✓' : '✗';
      console.log(`  ${i + 1}. ${status} ${f.path}`);
      console.log(`     ${f.coverage.lines.pct}% (${f.coverage.lines.uncovered} uncovered)`);
    });
  }
}

main();
