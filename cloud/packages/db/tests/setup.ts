/**
 * Vitest setup file for packages/db
 *
 * CRITICAL: Forces use of test database to prevent production data loss.
 * This file runs BEFORE test files are imported.
 */

// CRITICAL: Force test database - NEVER use production database in tests
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
