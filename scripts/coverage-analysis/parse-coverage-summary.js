#!/usr/bin/env node
/**
 * Parse coverage-summary.json files and output consolidated data
 *
 * Usage:
 *   node scripts/coverage-analysis/parse-coverage-summary.js [options]
 *
 * Options:
 *   --service <name>    Filter by service (api, frontend, database, storage)
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

const SERVICES = ['api', 'frontend', 'database', 'storage'];
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
  return 'other';
}

function isTestFile(filePath) {
  return (
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('__tests__/') ||
    filePath.includes('__mocks__/')
  );
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
    console.error(`Error reading coverage for ${service}: ${e.message}`);
    return null;
  }
}

function processFiles(coverageData, service) {
  const files = [];

  for (const [absolutePath, metrics] of Object.entries(coverageData)) {
    if (absolutePath === 'total') continue;

    // Convert to relative path
    const relativePath = absolutePath.replace(PROJECT_ROOT + '/', '');

    if (isTestFile(relativePath)) continue;

    const category = detectCategory(relativePath);
    const uncoveredLines = metrics.lines.total - metrics.lines.covered;

    files.push({
      path: relativePath,
      service,
      category,
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
  const servicesToProcess = options.service ? [options.service] : SERVICES;

  let allFiles = [];
  const serviceSummaries = {};
  const categorySummaries = {};
  let overallTotal = { lines: 0, covered: 0, branches: 0, branchesCovered: 0, functions: 0, functionsCovered: 0 };

  for (const service of servicesToProcess) {
    const coverageData = readCoverageSummary(service);

    if (!coverageData) {
      serviceSummaries[service] = { error: 'No coverage data found' };
      continue;
    }

    const files = processFiles(coverageData, service);
    allFiles = allFiles.concat(files);

    // Calculate service summary from total
    if (coverageData.total) {
      serviceSummaries[service] = {
        lines: coverageData.total.lines.pct,
        branches: coverageData.total.branches.pct,
        functions: coverageData.total.functions.pct,
        statements: coverageData.total.statements.pct,
        fileCount: files.length,
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
        console.log(`  ${svc}: ${summary.lines}% (${summary.fileCount} files)`);
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
