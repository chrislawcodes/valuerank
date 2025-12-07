#!/usr/bin/env node
/**
 * Find files with lowest coverage, prioritized by impact
 *
 * Usage:
 *   node scripts/coverage-analysis/find-low-coverage.js [options]
 *
 * Options:
 *   --limit <n>         Number of files to return (default: 15)
 *   --service <name>    Filter by service
 *   --min-lines <n>     Minimum total lines to consider (default: 10)
 *   --with-dependents   Include dependent count from dependency MCP (slower)
 *
 * Output: JSON array of files sorted by priority score
 */

const fs = require('fs');
const path = require('path');

const SERVICES = ['api', 'frontend', 'database', 'storage'];
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
  const highImpactCategories = ['middleware', 'contexts', 'graphql', 'providers'];

  if (highImpactCategories.includes(category) && score > 50) return 'high';
  if (score > 100) return 'high';
  if (score > 30) return 'medium';
  return 'low';
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

function main() {
  const options = parseArgs();
  const servicesToProcess = options.service ? [options.service] : SERVICES;

  let allFiles = [];

  for (const service of servicesToProcess) {
    const coverageData = readCoverageSummary(service);

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
        service,
        category,
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
      coverage: f.coverage,
      impact: f.impact,
      priorityScore: f.priorityScore,
    })),
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
