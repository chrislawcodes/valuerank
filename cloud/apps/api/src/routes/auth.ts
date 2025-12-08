/**
 * Authentication routes
 *
 * POST /api/auth/login - Authenticate with email/password, returns JWT
 * GET /api/auth/me - Get current user info (requires auth)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { db } from '@valuerank/db';
import {
  createLogger,
  AuthenticationError,
  ValidationError,
} from '@valuerank/shared';

import { verifyPassword, signToken } from '../auth/index.js';
import { loginRateLimiter } from '../auth/rate-limit.js';
import type { LoginRequest, LoginResponse } from '../auth/index.js';

const log = createLogger('auth');

export const authRouter = Router();

/**
 * POST /api/auth/login
 *
 * Authenticate user with email and password
 * Returns JWT token on success
 *
 * Rate limited: 10 attempts per 15 minutes per IP
 */
authRouter.post(
  '/login',
  loginRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as LoginRequest;

      // Validate required fields
      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      // Normalize email to lowercase for case-insensitive lookup
      const normalizedEmail = email.toLowerCase();

      // Find user by email
      const user = await db.user.findUnique({
        where: { email: normalizedEmail },
      });

      // Generic error for both non-existent user and wrong password
      // Prevents email enumeration attacks
      if (!user) {
        log.warn({ email: normalizedEmail }, 'Login failed: user not found');
        throw new AuthenticationError('Invalid credentials');
      }

      // Verify password
      const passwordValid = await verifyPassword(password, user.passwordHash);
      if (!passwordValid) {
        log.warn({ userId: user.id }, 'Login failed: invalid password');
        throw new AuthenticationError('Invalid credentials');
      }

      // Update last login timestamp
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate JWT token
      const token = signToken({ id: user.id, email: user.email });

      log.info({ userId: user.id }, 'Login successful');

      const response: LoginResponse = {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/auth/me
 *
 * Get current authenticated user info
 * Requires valid JWT in Authorization header
 */
authRouter.get(
  '/me',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if user is authenticated (set by authMiddleware)
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      // Fetch fresh user data from database
      const user = await db.user.findUnique({
        where: { id: req.user.id },
      });

      if (!user) {
        throw new AuthenticationError('User not found');
      }

      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      });
    } catch (err) {
      next(err);
    }
  }
);
