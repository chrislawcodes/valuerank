/**
 * PKCE Validation Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validatePkce,
  isValidCodeVerifier,
  isValidCodeChallenge,
  generateCodeVerifier,
  generateCodeChallenge,
} from '../../../src/mcp/oauth/pkce.js';

describe('PKCE', () => {
  describe('generateCodeVerifier', () => {
    it('generates a valid code verifier', () => {
      const verifier = generateCodeVerifier();

      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
      expect(isValidCodeVerifier(verifier)).toBe(true);
    });

    it('generates unique verifiers', () => {
      const verifiers = new Set<string>();
      for (let i = 0; i < 100; i++) {
        verifiers.add(generateCodeVerifier());
      }
      expect(verifiers.size).toBe(100);
    });
  });

  describe('generateCodeChallenge', () => {
    it('generates a valid S256 code challenge', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      expect(challenge.length).toBe(43);
      expect(isValidCodeChallenge(challenge)).toBe(true);
    });

    it('generates consistent challenges for same verifier', () => {
      const verifier = 'test-verifier-that-is-exactly-43-chars-long!';
      const challenge1 = generateCodeChallenge(verifier);
      const challenge2 = generateCodeChallenge(verifier);

      expect(challenge1).toBe(challenge2);
    });
  });

  describe('isValidCodeVerifier', () => {
    it('accepts valid verifiers', () => {
      expect(isValidCodeVerifier('a'.repeat(43))).toBe(true);
      expect(isValidCodeVerifier('a'.repeat(128))).toBe(true);
      expect(isValidCodeVerifier('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq')).toBe(true); // 43 chars
      expect(isValidCodeVerifier('0123456789-._~'.repeat(4))).toBe(true); // 56 chars
    });

    it('rejects too short verifiers', () => {
      expect(isValidCodeVerifier('a'.repeat(42))).toBe(false);
      expect(isValidCodeVerifier('')).toBe(false);
    });

    it('rejects too long verifiers', () => {
      expect(isValidCodeVerifier('a'.repeat(129))).toBe(false);
    });

    it('rejects invalid characters', () => {
      expect(isValidCodeVerifier('a'.repeat(42) + '!')).toBe(false);
      expect(isValidCodeVerifier('a'.repeat(42) + ' ')).toBe(false);
      expect(isValidCodeVerifier('a'.repeat(42) + '+')).toBe(false);
    });
  });

  describe('isValidCodeChallenge', () => {
    it('accepts valid challenges', () => {
      // S256 produces exactly 43 base64url characters
      expect(isValidCodeChallenge('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')).toBe(true);
      expect(isValidCodeChallenge('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ')).toBe(true); // 43 chars
    });

    it('rejects wrong length challenges', () => {
      expect(isValidCodeChallenge('a'.repeat(42))).toBe(false);
      expect(isValidCodeChallenge('a'.repeat(44))).toBe(false);
      expect(isValidCodeChallenge('')).toBe(false);
    });

    it('rejects invalid characters', () => {
      expect(isValidCodeChallenge('a'.repeat(42) + '=')).toBe(false); // padding not allowed
      expect(isValidCodeChallenge('a'.repeat(42) + '+')).toBe(false);
      expect(isValidCodeChallenge('a'.repeat(42) + '/')).toBe(false);
    });
  });

  describe('validatePkce', () => {
    it('validates correct verifier against challenge', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      expect(validatePkce(verifier, challenge, 'S256')).toBe(true);
    });

    it('rejects incorrect verifier', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      const wrongVerifier = generateCodeVerifier();

      expect(validatePkce(wrongVerifier, challenge, 'S256')).toBe(false);
    });

    it('rejects unsupported methods', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      expect(validatePkce(verifier, challenge, 'plain')).toBe(false);
      expect(validatePkce(verifier, challenge, '')).toBe(false);
    });

    it('rejects invalid verifier format', () => {
      const challenge = generateCodeChallenge('valid-verifier-that-is-at-least-43-chars!!');

      expect(validatePkce('short', challenge, 'S256')).toBe(false);
      expect(validatePkce('invalid chars +/', challenge, 'S256')).toBe(false);
    });

    it('works with known test vectors', () => {
      // RFC 7636 Appendix B test vector
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      const computedChallenge = generateCodeChallenge(verifier);
      expect(computedChallenge).toBe(expectedChallenge);
      expect(validatePkce(verifier, expectedChallenge, 'S256')).toBe(true);
    });
  });
});
