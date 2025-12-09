/**
 * PKCE (Proof Key for Code Exchange) Implementation
 *
 * Implements RFC 7636 for OAuth 2.1 PKCE validation
 */

import crypto from 'crypto';

/**
 * Validate a PKCE code verifier against a code challenge
 *
 * @param codeVerifier - The code_verifier from the token request
 * @param codeChallenge - The code_challenge from the authorization request
 * @param method - The code_challenge_method (only 'S256' supported)
 * @returns true if the verifier matches the challenge
 */
export function validatePkce(
  codeVerifier: string,
  codeChallenge: string,
  method: string
): boolean {
  if (method !== 'S256') {
    return false;
  }

  // Validate code_verifier format (43-128 chars, URL-safe)
  if (!isValidCodeVerifier(codeVerifier)) {
    return false;
  }

  // S256: BASE64URL(SHA256(code_verifier)) === code_challenge
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const computed = hash.toString('base64url');

  return computed === codeChallenge;
}

/**
 * Check if a code verifier has valid format
 *
 * Must be 43-128 characters, using only [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 */
export function isValidCodeVerifier(verifier: string): boolean {
  if (verifier.length < 43 || verifier.length > 128) {
    return false;
  }

  // RFC 7636 character set: unreserved characters
  return /^[A-Za-z0-9\-._~]+$/.test(verifier);
}

/**
 * Check if a code challenge has valid format
 *
 * Must be BASE64URL encoded (no padding)
 */
export function isValidCodeChallenge(challenge: string): boolean {
  // S256 produces 43 characters (256 bits / 6 bits per char = 43 chars)
  if (challenge.length !== 43) {
    return false;
  }

  // BASE64URL character set (no padding)
  return /^[A-Za-z0-9\-_]+$/.test(challenge);
}

/**
 * Generate a code verifier (for testing)
 */
export function generateCodeVerifier(): string {
  // Generate 32 random bytes = 43 base64url characters
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a code challenge from a verifier (for testing)
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}
