/**
 * Rate limiting configuration for authentication endpoints
 *
 * Protects login endpoint from brute force attacks
 */

import rateLimit from 'express-rate-limit';
import { createLogger } from '@valuerank/shared';

const log = createLogger('auth:rate-limit');

/**
 * Rate limiter for login endpoint
 *
 * Configuration:
 * - 10 attempts per 15 minutes per IP
 * - Returns 429 Too Many Requests when exceeded
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
  handler: (req, res, _next, options) => {
    log.warn(
      { ip: req.ip, path: req.path },
      'Rate limit exceeded for login'
    );
    res.status(429).json(options.message);
  },
  // Skip rate limiting in test environment
  skip: () => process.env.NODE_ENV === 'test',
});
