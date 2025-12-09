/**
 * OAuth Request Validation Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isValidRedirectUri,
  isValidResourceUri,
  validateScope,
  validateAuthorizationRequest,
  validateTokenRequest,
  validateClientRegistrationRequest,
} from '../../../src/mcp/oauth/validation.js';

describe('OAuth Validation', () => {
  describe('isValidRedirectUri', () => {
    it('accepts HTTPS URLs', () => {
      expect(isValidRedirectUri('https://example.com/callback')).toBe(true);
      expect(isValidRedirectUri('https://app.example.com:8443/oauth')).toBe(true);
    });

    it('accepts Claude.ai callbacks', () => {
      expect(isValidRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
      expect(isValidRedirectUri('https://claude.com/api/mcp/auth_callback')).toBe(true);
    });

    it('accepts localhost HTTP', () => {
      expect(isValidRedirectUri('http://localhost/callback')).toBe(true);
      expect(isValidRedirectUri('http://localhost:3000/oauth')).toBe(true);
      expect(isValidRedirectUri('http://127.0.0.1/callback')).toBe(true);
      expect(isValidRedirectUri('http://[::1]:8080/callback')).toBe(true);
    });

    it('rejects non-localhost HTTP', () => {
      expect(isValidRedirectUri('http://example.com/callback')).toBe(false);
      expect(isValidRedirectUri('http://192.168.1.1/callback')).toBe(false);
    });

    it('rejects URLs with fragments', () => {
      expect(isValidRedirectUri('https://example.com/callback#fragment')).toBe(false);
    });

    it('rejects invalid URLs', () => {
      expect(isValidRedirectUri('not-a-url')).toBe(false);
      expect(isValidRedirectUri('')).toBe(false);
    });

    it('rejects unsupported schemes', () => {
      expect(isValidRedirectUri('ftp://example.com/callback')).toBe(false);
      expect(isValidRedirectUri('custom://callback')).toBe(false);
    });
  });

  describe('isValidResourceUri', () => {
    it('accepts valid resource URIs', () => {
      expect(isValidResourceUri('https://mcp.example.com')).toBe(true);
      expect(isValidResourceUri('https://mcp.example.com/mcp')).toBe(true);
      expect(isValidResourceUri('https://mcp.example.com:8443')).toBe(true);
    });

    it('rejects URIs with fragments', () => {
      expect(isValidResourceUri('https://mcp.example.com#fragment')).toBe(false);
    });

    it('rejects invalid URIs', () => {
      expect(isValidResourceUri('mcp.example.com')).toBe(false);
      expect(isValidResourceUri('')).toBe(false);
    });
  });

  describe('validateScope', () => {
    it('returns default scope for empty input', () => {
      expect(validateScope(undefined)).toBe('mcp:read mcp:write');
      expect(validateScope('')).toBe('mcp:read mcp:write');
    });

    it('filters to supported scopes', () => {
      expect(validateScope('mcp:read')).toBe('mcp:read');
      expect(validateScope('mcp:write')).toBe('mcp:write');
      expect(validateScope('mcp:read mcp:write')).toBe('mcp:read mcp:write');
    });

    it('removes unsupported scopes', () => {
      expect(validateScope('mcp:read invalid:scope')).toBe('mcp:read');
      expect(validateScope('invalid:scope')).toBe('mcp:read mcp:write');
    });
  });

  describe('validateAuthorizationRequest', () => {
    const validRequest = {
      response_type: 'code',
      client_id: 'test-client',
      redirect_uri: 'https://example.com/callback',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      resource: 'https://mcp.example.com',
    };

    it('accepts valid request', () => {
      const result = validateAuthorizationRequest(validRequest);

      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.client_id).toBe('test-client');
    });

    it('accepts request with optional state', () => {
      const result = validateAuthorizationRequest({
        ...validRequest,
        state: 'random-state',
      });

      expect(result.valid).toBe(true);
      expect(result.data?.state).toBe('random-state');
    });

    it('rejects invalid response_type', () => {
      const result = validateAuthorizationRequest({
        ...validRequest,
        response_type: 'token',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_request');
    });

    it('rejects missing client_id', () => {
      const { client_id, ...noClientId } = validRequest;

      const result = validateAuthorizationRequest(noClientId);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_request');
    });

    it('rejects invalid redirect_uri', () => {
      const result = validateAuthorizationRequest({
        ...validRequest,
        redirect_uri: 'http://external.com/callback',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_request');
    });

    it('rejects missing code_challenge', () => {
      const { code_challenge, ...noChallenge } = validRequest;

      const result = validateAuthorizationRequest(noChallenge);

      expect(result.valid).toBe(false);
      expect(result.errorDescription).toContain('code_challenge');
    });

    it('rejects invalid code_challenge_method', () => {
      const result = validateAuthorizationRequest({
        ...validRequest,
        code_challenge_method: 'plain',
      });

      expect(result.valid).toBe(false);
      expect(result.errorDescription).toContain('S256');
    });

    it('rejects missing resource', () => {
      const { resource, ...noResource } = validRequest;

      const result = validateAuthorizationRequest(noResource);

      expect(result.valid).toBe(false);
      expect(result.errorDescription).toContain('resource');
    });
  });

  describe('validateTokenRequest', () => {
    describe('authorization_code grant', () => {
      const validAuthCodeRequest = {
        grant_type: 'authorization_code',
        client_id: 'test-client',
        code: 'auth-code-123',
        redirect_uri: 'https://example.com/callback',
        code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      };

      it('accepts valid request', () => {
        const result = validateTokenRequest(validAuthCodeRequest);

        expect(result.valid).toBe(true);
        expect(result.data?.grant_type).toBe('authorization_code');
      });

      it('rejects missing code', () => {
        const { code, ...noCode } = validAuthCodeRequest;

        const result = validateTokenRequest(noCode);

        expect(result.valid).toBe(false);
        expect(result.errorDescription).toContain('code');
      });

      it('rejects missing redirect_uri', () => {
        const { redirect_uri, ...noRedirect } = validAuthCodeRequest;

        const result = validateTokenRequest(noRedirect);

        expect(result.valid).toBe(false);
        expect(result.errorDescription).toContain('redirect_uri');
      });

      it('rejects missing code_verifier', () => {
        const { code_verifier, ...noVerifier } = validAuthCodeRequest;

        const result = validateTokenRequest(noVerifier);

        expect(result.valid).toBe(false);
        expect(result.errorDescription).toContain('code_verifier');
      });
    });

    describe('refresh_token grant', () => {
      const validRefreshRequest = {
        grant_type: 'refresh_token',
        client_id: 'test-client',
        refresh_token: 'refresh-token-123',
      };

      it('accepts valid request', () => {
        const result = validateTokenRequest(validRefreshRequest);

        expect(result.valid).toBe(true);
        expect(result.data?.grant_type).toBe('refresh_token');
      });

      it('rejects missing refresh_token', () => {
        const { refresh_token, ...noToken } = validRefreshRequest;

        const result = validateTokenRequest(noToken);

        expect(result.valid).toBe(false);
        expect(result.errorDescription).toContain('refresh_token');
      });
    });

    it('rejects unsupported grant_type', () => {
      const result = validateTokenRequest({
        grant_type: 'client_credentials',
        client_id: 'test-client',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('unsupported_grant_type');
    });
  });

  describe('validateClientRegistrationRequest', () => {
    it('accepts valid request', () => {
      const result = validateClientRegistrationRequest({
        redirect_uris: ['https://example.com/callback'],
        client_name: 'Test Client',
      });

      expect(result.valid).toBe(true);
      expect(result.data?.redirect_uris).toEqual(['https://example.com/callback']);
      expect(result.data?.client_name).toBe('Test Client');
    });

    it('accepts request with multiple redirect URIs', () => {
      const result = validateClientRegistrationRequest({
        redirect_uris: [
          'https://example.com/callback',
          'http://localhost:3000/callback',
        ],
      });

      expect(result.valid).toBe(true);
      expect(result.data?.redirect_uris).toHaveLength(2);
    });

    it('rejects empty redirect_uris', () => {
      const result = validateClientRegistrationRequest({
        redirect_uris: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errorDescription).toContain('redirect_uris');
    });

    it('rejects invalid redirect_uri in array', () => {
      const result = validateClientRegistrationRequest({
        redirect_uris: ['https://valid.com/callback', 'http://invalid.com/callback'],
      });

      expect(result.valid).toBe(false);
      expect(result.errorDescription).toContain('Invalid redirect_uri');
    });

    it('rejects missing redirect_uris', () => {
      const result = validateClientRegistrationRequest({
        client_name: 'Test Client',
      });

      expect(result.valid).toBe(false);
    });
  });
});
