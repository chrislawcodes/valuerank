/**
 * Vitest setup file for packages/db
 *
 * CRITICAL: Forces use of test database to prevent production data loss.
 * This file runs BEFORE test files are imported.
 */

// CRITICAL: Force test database - NEVER use production database in tests
const LOCAL_TEST_DATABASE_URL = 'postgresql://valuerank:valuerank@localhost:5433/valuerank_test';

// Use the existing DATABASE_URL if it already points to a test database,
// otherwise fall back to the local default. This allows CI to provide its own URL.
const currentDbUrl = process.env.DATABASE_URL || '';
if (currentDbUrl.includes('_test')) {
  // Already pointing to a test database - keep it
} else {
  if (currentDbUrl) {
    console.error('\n\x1b[31m========================================\x1b[0m');
    console.error('\x1b[31mCRITICAL: Tests attempted to use non-test database!\x1b[0m');
    console.error('\x1b[31mDATABASE_URL:', currentDbUrl, '\x1b[0m');
    console.error('\x1b[31mForcing use of test database instead.\x1b[0m');
    console.error('\x1b[31m========================================\n\x1b[0m');
  }
  process.env.DATABASE_URL = LOCAL_TEST_DATABASE_URL;
}
