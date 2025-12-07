import { PrismaClient } from '@prisma/client';

/**
 * CRITICAL SAFEGUARD: Prevent tests from accidentally using production database
 *
 * This check runs at module load time to catch configuration errors early.
 * If we're in a test environment, the DATABASE_URL MUST point to a test database.
 */
function validateDatabaseUrl(): void {
  const isTestEnvironment =
    process.env.NODE_ENV === 'test' ||
    process.env.VITEST === 'true' ||
    typeof (globalThis as Record<string, unknown>).__vitest_worker__ !== 'undefined';

  if (isTestEnvironment) {
    const dbUrl = process.env.DATABASE_URL || '';
    // Check that database name contains '_test' (e.g., valuerank_test)
    if (!dbUrl.includes('_test')) {
      const errorMessage = `
================================================================================
CRITICAL ERROR: Tests are attempting to connect to a non-test database!

DATABASE_URL: ${dbUrl}

Tests MUST use a database with '_test' in the name (e.g., valuerank_test).
This safeguard prevents accidental data loss in development/production databases.

To fix this:
1. Ensure your test setup file sets DATABASE_URL to the test database
2. Check that vitest.config.ts does NOT load .env with production credentials
3. Use: DATABASE_URL="postgresql://...localhost:5433/valuerank_test"
================================================================================
`;
      console.error(errorMessage);
      throw new Error('Test database safeguard: Refusing to connect to non-test database');
    }
  }
}

// Run validation before creating Prisma client
validateDatabaseUrl();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
