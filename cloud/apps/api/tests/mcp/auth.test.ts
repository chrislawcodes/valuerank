/**
 * MCP Authentication Middleware Tests
 *
 * Tests both OAuth Bearer token and legacy API key authentication
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { mcpAuthMiddleware } from '../../src/mcp/auth.js';
import { AuthenticationError } from '@valuerank/shared';

// Mock the OAuth module
vi.mock('../../src/mcp/oauth/index.js', () => ({
  validateAccessToken: vi.fn(),
  buildWwwAuthenticateHeader: vi.fn().mockReturnValue('Bearer resource="http://localhost/mcp"'),
  getBaseUrl: vi.fn().mockReturnValue('http://localhost'),
}));

import { validateAccessToken } from '../../src/mcp/oauth/index.js';

describe('MCP Auth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {
      headers: {},
      path: '/mcp',
      protocol: 'http',
    };
    mockRes = {
      setHeader: vi.fn(),
    };
    mockNext = vi.fn();
  });

  describe('OAuth Bearer token authentication', () => {
    it('accepts valid Bearer token', () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };
      (validateAccessToken as ReturnType<typeof vi.fn>).mockReturnValue({
        sub: 'user-123',
        client_id: 'client-456',
        scope: 'mcp:read mcp:write',
      });

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.user).toEqual({ id: 'user-123', email: '' });
      expect(mockReq.authMethod).toBe('oauth');
    });

    it('rejects invalid Bearer token with 401', () => {
      mockReq.headers = { authorization: 'Bearer invalid-token' };
      (validateAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(null);

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('Bearer')
      );
      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.message).toContain('Invalid or expired access token');
    });

    it('rejects expired Bearer token', () => {
      mockReq.headers = { authorization: 'Bearer expired-token' };
      (validateAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(null);

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('API key authentication (legacy)', () => {
    it('accepts valid API key when user is pre-authenticated', () => {
      mockReq.headers = { 'x-api-key': 'valid-key-123' };
      mockReq.user = { id: 'user-1', email: 'test@test.com' };
      mockReq.authMethod = 'api_key';

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('rejects API key without pre-authenticated user', () => {
      mockReq.headers = { 'x-api-key': 'invalid-key-123' };
      mockReq.user = undefined;

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.message).toContain('Invalid or expired API key');
    });

    it('rejects JWT auth method even with valid user', () => {
      mockReq.headers = { 'x-api-key': 'valid-key-123' };
      mockReq.user = { id: 'user-1', email: 'test@test.com' };
      mockReq.authMethod = 'jwt';

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('no authentication', () => {
    it('returns 401 with WWW-Authenticate header when no credentials provided', () => {
      mockReq.headers = {};

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('Bearer')
      );
      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.message).toContain('Authentication required');
    });
  });

  describe('authentication priority', () => {
    it('prefers OAuth Bearer over API key when both present', () => {
      mockReq.headers = {
        authorization: 'Bearer valid-token',
        'x-api-key': 'also-valid-key',
      };
      mockReq.user = { id: 'api-key-user', email: 'api@test.com' };
      mockReq.authMethod = 'api_key';
      (validateAccessToken as ReturnType<typeof vi.fn>).mockReturnValue({
        sub: 'oauth-user',
        client_id: 'client-456',
        scope: 'mcp:read',
      });

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.user?.id).toBe('oauth-user');
      expect(mockReq.authMethod).toBe('oauth');
    });
  });
});
