/**
 * Vitest setup file
 *
 * Sets required environment variables for tests.
 * This file runs BEFORE test files are imported.
 *
 * DO NOT export functions from this file - it runs as a script, not a module.
 * For test helpers, see tests/test-utils.ts
 */

// CRITICAL: Force test database - NEVER use production database in tests
// This MUST override any existing DATABASE_URL to prevent data loss
const TEST_DATABASE_URL = 'postgresql://valuerank:valuerank@localhost:5433/valuerank_test';

// Safety check: Fail fast if somehow pointing to production database
const currentDbUrl = process.env.DATABASE_URL || '';
if (currentDbUrl && !currentDbUrl.includes('_test')) {
  console.error('\n\x1b[31m========================================\x1b[0m');
  console.error('\x1b[31mCRITICAL: Tests attempted to use non-test database!\x1b[0m');
  console.error('\x1b[31mDATABASE_URL:', currentDbUrl, '\x1b[0m');
  console.error('\x1b[31mForcing use of test database instead.\x1b[0m');
  console.error('\x1b[31m========================================\n\x1b[0m');
}

// ALWAYS use test database - this is not optional
process.env.DATABASE_URL = TEST_DATABASE_URL;

// Set JWT_SECRET before any other imports
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
