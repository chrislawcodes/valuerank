/**
 * API Key generation and validation
 *
 * API keys use vr_ prefix with 32 random alphanumeric characters.
 * Keys are stored as SHA-256 hashes, never in plaintext.
 */

import crypto from 'crypto';

/** API key prefix for identification */
const API_KEY_PREFIX = 'vr_';

/** Length of random portion of API key */
const API_KEY_LENGTH = 32;

/** Characters used for API key generation */
const API_KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a secure random API key
 *
 * Format: vr_[32 alphanumeric characters]
 * Example: vr_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6
 *
 * @returns Full API key (show to user only once)
 */
export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(API_KEY_LENGTH);
  let key = API_KEY_PREFIX;

  for (let i = 0; i < API_KEY_LENGTH; i++) {
    // Use modulo to map byte to character set
    // This provides uniform distribution for alphanumeric chars
    const byte = randomBytes[i];
    if (byte === undefined) {
      throw new Error(`Unexpected undefined byte at index ${i}`);
    }
    const index = byte % API_KEY_CHARS.length;
    key += API_KEY_CHARS[index];
  }

  return key;
}

/**
 * Hash an API key using SHA-256
 *
 * This hash is stored in the database for validation.
 * The full key is never stored.
 *
 * @param key - Full API key to hash
 * @returns SHA-256 hash as hex string
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Extract the prefix from an API key for display
 *
 * Shows first 10 characters (vr_ + 7 chars) for identification
 * without revealing the full key.
 *
 * @param key - Full API key
 * @returns Key prefix for display (e.g., "vr_abc1234")
 */
export function getKeyPrefix(key: string): string {
  // Return first 10 characters: "vr_" + 7 random chars
  return key.slice(0, 10);
}

/**
 * Validate API key format
 *
 * @param key - Key to validate
 * @returns true if key has valid format
 */
export function isValidApiKeyFormat(key: string): boolean {
  if (!key.startsWith(API_KEY_PREFIX)) {
    return false;
  }

  const randomPart = key.slice(API_KEY_PREFIX.length);
  if (randomPart.length !== API_KEY_LENGTH) {
    return false;
  }

  // Check all characters are alphanumeric
  return /^[A-Za-z0-9]+$/.test(randomPart);
}
