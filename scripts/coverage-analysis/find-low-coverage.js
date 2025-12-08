#!/usr/bin/env node
/**
 * Find files with lowest coverage, prioritized by impact
 *
 * Usage:
 *   node scripts/coverage-analysis/find-low-coverage.js [options]
 *
 * Options:
 *   --limit <n>         Number of files to return (default: 15)
 *   --service <name>    Filter by service (api, web, db, shared, workers)
 *   --min-lines <n>     Minimum total lines to consider (default: 10)
 *   --with-dependents   Include dependent count from dependency MCP (slower)
 *
 * Output: JSON array of files sorted by priority score
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
    limit: 15,
    service: null,
    minLines: 10,
    withDependents: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--service':
        options.service = args[++i];
        break;
      case '--min-lines':
        options.minLines = parseInt(args[++i], 10);
        break;
      case '--with-dependents':
        options.withDependents = true;
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

function calculateImpact(file) {
  // Higher impact for certain categories
  const categoryWeights = {
    middleware: 3.0,    // Security/auth critical
    contexts: 2.5,      // Shared state
    hooks: 2.0,         // Reusable logic
    graphql: 1.8,       // API layer
    utils: 1.5,         // Shared utilities
    services: 1.5,      // Business logic
    providers: 1.5,     // External integrations
    common: 1.5,        // Shared Python modules
    auth: 2.0,          // Authentication
    queue: 1.5,         // Background jobs
    api: 1.5,           // API operations
    pages: 1.2,         // User-facing
    components: 1.0,    // UI components
    queries: 1.0,       // Database queries
    other: 0.8,
  };

  const categoryWeight = categoryWeights[file.category] || 1.0;

  // Score based on:
  // 1. Uncovered lines (more = higher priority)
  // 2. Category importance
  // 3. Low coverage percentage (0% = highest priority)
  const uncoveredScore = file.coverage.lines.uncovered;
  const pctPenalty = file.coverage.lines.pct === 0 ? 2.0 : (100 - file.coverage.lines.pct) / 100;

  return Math.round(uncoveredScore * categoryWeight * pctPenalty * 100) / 100;
}

function determineImpactLevel(score, category) {
  // Certain categories are always high impact if they have significant uncovered code
  const highImpactCategories = ['middleware', 'contexts', 'graphql', 'providers', 'auth', 'common'];

  if (highImpactCategories.includes(category) && score > 50) return 'high';
  if (score > 100) return 'high';
  if (score > 30) return 'medium';
  return 'low';
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

function main() {
  const options = parseArgs();
  const servicesToProcess = options.service ? [options.service] : Object.keys(SERVICES);

  let allFiles = [];

  for (const serviceName of servicesToProcess) {
    if (!SERVICES[serviceName]) {
      continue;
    }

    const coverageData = readCoverageSummary(serviceName);
    const serviceConfig = SERVICES[serviceName];

    if (!coverageData) continue;

    for (const [absolutePath, metrics] of Object.entries(coverageData)) {
      if (absolutePath === 'total') continue;

      const relativePath = absolutePath.replace(PROJECT_ROOT + '/', '');

      if (isTestFile(relativePath)) continue;
      if (metrics.lines.total < options.minLines) continue;

      const category = detectCategory(relativePath);
      const uncoveredLines = metrics.lines.total - metrics.lines.covered;

      const file = {
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
        },
      };

      file.priorityScore = calculateImpact(file);
      file.impact = determineImpactLevel(file.priorityScore, category);

      allFiles.push(file);
    }
  }

  // Sort by priority score (highest first)
  allFiles.sort((a, b) => b.priorityScore - a.priorityScore);

  // Apply limit
  const topFiles = allFiles.slice(0, options.limit);

  // Add rank
  topFiles.forEach((file, index) => {
    file.rank = index + 1;
  });

  const totalUncovered = allFiles.reduce((sum, f) => sum + f.coverage.lines.uncovered, 0);

  const result = {
    timestamp: new Date().toISOString(),
    options,
    totalFilesAnalyzed: allFiles.length,
    totalUncoveredLines: totalUncovered,
    files: topFiles.map(f => ({
      rank: f.rank,
      path: f.path,
      service: f.service,
      category: f.category,
      language: f.language,
      coverage: f.coverage,
      impact: f.impact,
      priorityScore: f.priorityScore,
    })),
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
