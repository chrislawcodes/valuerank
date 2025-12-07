#!/usr/bin/env node
/**
 * Parse test output to extract failures in structured format
 *
 * Usage:
 *   npm run test:coverage 2>&1 | node scripts/coverage-analysis/parse-test-output.js
 *
 * Or with a file:
 *   node scripts/coverage-analysis/parse-test-output.js < test-output.log
 *
 * Output: JSON object with test execution summary and failures
 */

const readline = require('readline');

async function parseTestOutput() {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  const failures = [];
  const lines = [];
  let currentService = null;
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let skippedTests = 0;
  let inFailure = false;
  let currentFailure = null;
  let executionTime = null;

  // Patterns for Jest and Vitest
  const patterns = {
    // Service detection
    service: /(@206mp\/\w+)/,

    // Jest patterns
    jestFail: /FAIL\s+(.+\.(?:test|spec)\.[jt]sx?)$/,
    jestPass: /PASS\s+(.+\.(?:test|spec)\.[jt]sx?)$/,
    jestTestFail: /^\s*[✕×]\s+(.+)$/,
    jestTestPass: /^\s*[✓√]\s+(.+)$/,
    jestError: /^\s*●\s+(.+)$/,
    jestSummary: /Tests:\s+(\d+)\s+failed.*?(\d+)\s+passed.*?(\d+)\s+total/,
    jestTime: /Time:\s+([\d.]+)\s*s/,

    // Vitest patterns
    vitestFail: /^\s*[×✗]\s+(.+\.(?:test|spec)\.[jt]sx?)\s*\(\d+/,
    vitestTestFail: /^\s*[×✗]\s+(.+)$/,
    vitestSummary: /Tests\s+(\d+)\s+failed\s+\|\s+(\d+)\s+passed/,
    vitestTime: /Duration\s+([\d.]+)s/,

    // Common patterns
    errorMessage: /^\s*(Error|AssertionError|expect\(|TypeError|ReferenceError).*$/,
    stackTrace: /^\s+at\s+/,
  };

  for await (const line of rl) {
    lines.push(line);

    // Detect current service
    const serviceMatch = line.match(patterns.service);
    if (serviceMatch) {
      currentService = serviceMatch[1];
    }

    // Jest: Detect failing test file
    const jestFailMatch = line.match(patterns.jestFail);
    if (jestFailMatch) {
      currentFailure = {
        service: currentService || 'unknown',
        file: jestFailMatch[1].trim(),
        testName: '',
        error: '',
        log: [],
      };
      inFailure = true;
    }

    // Vitest: Detect failing test file
    const vitestFailMatch = line.match(patterns.vitestFail);
    if (vitestFailMatch) {
      currentFailure = {
        service: currentService || 'unknown',
        file: vitestFailMatch[1].trim(),
        testName: '',
        error: '',
        log: [],
      };
      inFailure = true;
    }

    // Jest: Individual test failure
    const jestTestFailMatch = line.match(patterns.jestTestFail);
    if (jestTestFailMatch && inFailure && currentFailure) {
      if (currentFailure.testName) {
        // Save previous failure and start new one
        failures.push({ ...currentFailure });
        currentFailure = {
          ...currentFailure,
          testName: jestTestFailMatch[1].trim(),
          error: '',
          log: [],
        };
      } else {
        currentFailure.testName = jestTestFailMatch[1].trim();
      }
    }

    // Jest: Error block start (● Test Name)
    const jestErrorMatch = line.match(patterns.jestError);
    if (jestErrorMatch && inFailure) {
      if (currentFailure && currentFailure.testName && currentFailure.error) {
        failures.push({ ...currentFailure });
      }
      currentFailure = {
        service: currentService || 'unknown',
        file: currentFailure?.file || 'unknown',
        testName: jestErrorMatch[1].trim(),
        error: '',
        log: [],
      };
    }

    // Capture error messages
    if (inFailure && currentFailure && patterns.errorMessage.test(line)) {
      if (!currentFailure.error) {
        currentFailure.error = line.trim();
      }
      currentFailure.log.push(line);
    }

    // Capture stack traces (limited)
    if (inFailure && currentFailure && patterns.stackTrace.test(line)) {
      if (currentFailure.log.length < 15) {
        currentFailure.log.push(line);
      }
    }

    // Jest summary line
    const jestSummaryMatch = line.match(patterns.jestSummary);
    if (jestSummaryMatch) {
      failedTests += parseInt(jestSummaryMatch[1], 10);
      passedTests += parseInt(jestSummaryMatch[2], 10);
      totalTests += parseInt(jestSummaryMatch[3], 10);

      // Finalize any pending failure
      if (currentFailure && currentFailure.testName) {
        failures.push({ ...currentFailure });
        currentFailure = null;
      }
      inFailure = false;
    }

    // Vitest summary
    const vitestSummaryMatch = line.match(patterns.vitestSummary);
    if (vitestSummaryMatch) {
      const failed = parseInt(vitestSummaryMatch[1], 10);
      const passed = parseInt(vitestSummaryMatch[2], 10);
      failedTests += failed;
      passedTests += passed;
      totalTests += failed + passed;
    }

    // Time extraction
    const jestTimeMatch = line.match(patterns.jestTime);
    if (jestTimeMatch) {
      executionTime = `${jestTimeMatch[1]}s`;
    }

    const vitestTimeMatch = line.match(patterns.vitestTime);
    if (vitestTimeMatch) {
      executionTime = `${vitestTimeMatch[1]}s`;
    }
  }

  // Finalize any pending failure
  if (currentFailure && currentFailure.testName) {
    failures.push(currentFailure);
  }

  // Deduplicate failures (same file + testName)
  const uniqueFailures = [];
  const seen = new Set();
  for (const f of failures) {
    const key = `${f.file}:${f.testName}`;
    if (!seen.has(key)) {
      seen.add(key);
      // Trim log to 10 lines max
      f.log = f.log.slice(0, 10);
      uniqueFailures.push(f);
    }
  }

  const result = {
    testExecution: {
      testsPass: failedTests === 0,
      totalTests,
      passed: passedTests,
      failed: failedTests,
      skipped: skippedTests,
      executionTime: executionTime || 'unknown',
      command: 'npm run test:coverage --workspaces',
    },
    testFailures: uniqueFailures,
  };

  console.log(JSON.stringify(result, null, 2));
}

parseTestOutput().catch(console.error);
