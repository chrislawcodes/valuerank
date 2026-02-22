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

import { verifyPassword, signToken, hashPassword } from '../auth/index.js';
import { loginRateLimiter } from '../auth/rate-limit.js';
import { invalidatePasswordChangedAtCache } from '../auth/middleware.js';
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
      if (email === undefined || email === '' || password === undefined || password === '') {
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
      if (user === null) {
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
      if (req.user === undefined || req.user === null) {
        throw new AuthenticationError('Authentication required');
      }

      // Fetch fresh user data from database
      const user = await db.user.findUnique({
        where: { id: req.user.id },
      });

      if (user === null) {
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

/**
 * PATCH /api/auth/me
 *
 * Update current authenticated user info (name, email)
 * Requires valid JWT in Authorization header
 */
authRouter.patch(
  '/me',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user === undefined || req.user === null) {
        throw new AuthenticationError('Authentication required');
      }

      const { name, email } = req.body as { name?: string; email?: string };

      if (name === undefined && email === undefined) {
        throw new ValidationError('Nothing to update');
      }

      const updateData: { name?: string; email?: string } = {};
      if (typeof name === 'string' && name.trim() !== '') {
        updateData.name = name.trim();
      }

      if (typeof email === 'string' && email.trim() !== '') {
        const normalizedEmail = email.trim().toLowerCase();

        // Prevent setting exact same email
        if (normalizedEmail !== req.user.email) {
          // Check for conflicts
          const existingUser = await db.user.findUnique({
            where: { email: normalizedEmail },
          });

          if (existingUser !== null && existingUser.id !== req.user.id) {
            throw new ValidationError('Email is already in use by another account');
          }
          updateData.email = normalizedEmail;
        }
      }

      if (Object.keys(updateData).length === 0) {
        throw new ValidationError('No valid fields to update');
      }

      const user = await db.user.update({
        where: { id: req.user.id },
        data: updateData,
      });

      // Issue a fresh token if email changed (since it's in the payload)
      const token = updateData.email !== undefined ? signToken({ id: user.id, email: user.email }) : undefined;

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        },
        token,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/auth/password
 *
 * Change current user's password
 * Requires valid JWT and current password
 */
authRouter.put(
  '/password',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user === undefined || req.user === null) {
        throw new AuthenticationError('Authentication required');
      }

      const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

      if (currentPassword === undefined || currentPassword === '' || newPassword === undefined || newPassword === '') {
        throw new ValidationError('Current password and new password are required');
      }

      if (newPassword.length < 8) {
        throw new ValidationError('New password must be at least 8 characters long');
      }

      const user = await db.user.findUnique({
        where: { id: req.user.id },
      });

      if (!user) {
        throw new AuthenticationError('User not found');
      }

      const passwordValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!passwordValid) {
        throw new AuthenticationError('Current password is incorrect');
      }

      // Hash new password using the local auth implementation.
      const passwordHash = await hashPassword(newPassword);

      await db.user.update({
        where: { id: req.user.id },
        data: { passwordHash, passwordChangedAt: new Date() },
      });

      log.info({ userId: req.user.id }, 'User changed password successfully');
      invalidatePasswordChangedAtCache(req.user.id);

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);
