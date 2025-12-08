/**
 * MCP Authentication Middleware Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { mcpAuthMiddleware } from '../../src/mcp/auth.js';
import { AuthenticationError } from '@valuerank/shared';

describe('MCP Auth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      path: '/mcp',
    };
    mockRes = {};
    mockNext = vi.fn();
  });

  describe('API key requirement', () => {
    it('rejects request without X-API-Key header', () => {
      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.message).toContain('API key required');
    });

    it('rejects request with empty X-API-Key header', () => {
      mockReq.headers = { 'x-api-key': '' };

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.message).toContain('API key required');
    });

    it('rejects request when API key is not a string', () => {
      mockReq.headers = { 'x-api-key': ['array', 'value'] as unknown as string };

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('user validation', () => {
    it('rejects request with API key but no user (invalid key)', () => {
      mockReq.headers = { 'x-api-key': 'invalid-key-123' };
      mockReq.user = undefined;

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.message).toContain('Invalid');
    });
  });

  describe('auth method validation', () => {
    it('rejects JWT authentication even with valid user', () => {
      mockReq.headers = { 'x-api-key': 'valid-key-123' };
      mockReq.user = { id: 'user-1', email: 'test@test.com' };
      mockReq.authMethod = 'jwt';

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.message).toContain('API key authentication');
    });

    it('accepts API key authentication with valid user', () => {
      mockReq.headers = { 'x-api-key': 'valid-key-123' };
      mockReq.user = { id: 'user-1', email: 'test@test.com' };
      mockReq.authMethod = 'api_key';

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(); // Called with no arguments
    });
  });

  describe('successful authentication', () => {
    it('calls next without error for valid API key auth', () => {
      mockReq.headers = { 'x-api-key': 'valid-api-key-12345' };
      mockReq.user = { id: 'user-123', email: 'user@example.com' };
      mockReq.authMethod = 'api_key';

      mcpAuthMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
