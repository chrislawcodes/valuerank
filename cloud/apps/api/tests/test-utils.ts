/**
 * Test utilities for API tests
 *
 * Provides auth helpers and other test utilities.
 * Import this file from test files (not setup.ts).
 */

import { signToken } from '../src/auth/index.js';

// Test user for authentication
export const TEST_USER = {
  id: 'test-user-id',
  email: 'test@example.com',
};

// Get an auth token for test requests
export function getTestAuthToken(): string {
  return signToken(TEST_USER);
}

// Get authorization header value
export function getAuthHeader(): string {
  return `Bearer ${getTestAuthToken()}`;
}
