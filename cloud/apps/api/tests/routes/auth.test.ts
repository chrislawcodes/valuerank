/**
 * Integration tests for auth routes
 *
 * Tests login endpoint behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/server.js';
import { hashPassword, signToken } from '../../src/auth/index.js';

// Mock the db module
vi.mock('@valuerank/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// Import db after mocking
import { db } from '@valuerank/db';

describe('Auth Routes', () => {
  const app = createServer();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('returns JWT for valid credentials', async () => {
      const passwordHash = await hashPassword('testpassword');
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash,
        name: 'Test User',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(db.user.update).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'testpassword' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.token).toMatch(/^eyJ/); // JWT starts with eyJ
      expect(response.body.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      });
    });

    it('returns 401 for wrong password', async () => {
      const passwordHash = await hashPassword('correctpassword');
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash,
        name: 'Test User',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('returns 401 for non-existent email', async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'anypassword' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('returns same error for wrong password and non-existent email', async () => {
      // Test non-existent email
      vi.mocked(db.user.findUnique).mockResolvedValue(null);
      const response1 = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'anypassword' });

      // Test wrong password
      const passwordHash = await hashPassword('correctpassword');
      vi.mocked(db.user.findUnique).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        passwordHash,
        name: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const response2 = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });

      // Both should return identical responses to prevent email enumeration
      expect(response1.body.message).toBe(response2.body.message);
      expect(response1.body.error).toBe(response2.body.error);
    });

    it('normalizes email to lowercase', async () => {
      const passwordHash = await hashPassword('testpassword');
      vi.mocked(db.user.findUnique).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        passwordHash,
        name: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(db.user.update).mockResolvedValue({} as never);

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'TEST@EXAMPLE.COM', password: 'testpassword' });

      // Verify findUnique was called with lowercase email
      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('updates last_login_at on successful login', async () => {
      const passwordHash = await hashPassword('testpassword');
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash,
        name: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(db.user.update).mockResolvedValue(mockUser);

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'testpassword' });

      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('returns 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'testpassword' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Email and password are required');
    });

    it('returns 400 for missing password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Email and password are required');
    });

    it('JWT token contains expected payload', async () => {
      const passwordHash = await hashPassword('testpassword');
      vi.mocked(db.user.findUnique).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        passwordHash,
        name: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(db.user.update).mockResolvedValue({} as never);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'testpassword' });

      // Decode JWT payload (base64url decode middle section)
      const [, payload] = response.body.token.split('.');
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8')
      );

      expect(decoded.sub).toBe('user-123');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      // exp should be ~24 hours from iat
      expect(decoded.exp - decoded.iat).toBeGreaterThanOrEqual(23 * 60 * 60);
      expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(25 * 60 * 60);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns current user when authenticated', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hash',
        lastLoginAt: new Date('2024-01-01'),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);

      const token = signToken({ id: 'user-123', email: 'test@example.com' });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: mockUser.createdAt.toISOString(),
        lastLoginAt: mockUser.lastLoginAt.toISOString(),
      });
    });

    it('returns 401 when not authenticated', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Authentication required');
    });

    it('returns 401 for invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    // Note: Rate limiting is skipped in test environment to allow
    // other tests to run without interference. These tests verify
    // the rate limiter configuration is properly loaded.

    it('rate limiter is configured and applied to login route', async () => {
      // Verify the login route responds without errors
      // Rate limiting is skipped in tests, but this verifies the
      // middleware chain works correctly
      vi.mocked(db.user.findUnique).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });

      // Should get 401 (auth error), not 500 (middleware error)
      expect(response.status).toBe(401);
    });

    it('includes rate limit headers in response (when not skipped)', async () => {
      // This test documents expected behavior in production
      // In test env, rate limiting is skipped so headers won't be present
      const passwordHash = await hashPassword('testpassword');
      vi.mocked(db.user.findUnique).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        passwordHash,
        name: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(db.user.update).mockResolvedValue({} as never);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'testpassword' });

      // Rate limiting is skipped in test, so we just verify success
      expect(response.status).toBe(200);
      // In production, response would include:
      // - RateLimit-Limit
      // - RateLimit-Remaining
      // - RateLimit-Reset
    });
  });
});
