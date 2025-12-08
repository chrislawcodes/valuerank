/**
 * Tests for create-user CLI functions
 *
 * Tests email and password validation, duplicate checking, and user creation
 */

import { describe, it, expect, afterEach } from 'vitest';
import { ValidationError } from '@valuerank/shared';
import { db } from '@valuerank/db';

import {
  validateEmail,
  validatePassword,
  checkDuplicateEmail,
  createUser,
  EMAIL_REGEX,
  MIN_PASSWORD_LENGTH,
} from '../../src/cli/create-user.js';

describe('Create User CLI', () => {
  describe('validateEmail', () => {
    it('accepts valid email format', () => {
      expect(() => validateEmail('user@example.com')).not.toThrow();
      expect(() => validateEmail('user.name@example.com')).not.toThrow();
      expect(() => validateEmail('user+tag@example.co.uk')).not.toThrow();
    });

    it('rejects empty email', () => {
      expect(() => validateEmail('')).toThrow(ValidationError);
      expect(() => validateEmail('')).toThrow('Invalid email format');
    });

    it('rejects email without @', () => {
      expect(() => validateEmail('invalidemail')).toThrow(ValidationError);
      expect(() => validateEmail('invalid.email.com')).toThrow('Invalid email format');
    });

    it('rejects email without domain', () => {
      expect(() => validateEmail('invalid@')).toThrow(ValidationError);
      expect(() => validateEmail('@invalid.com')).toThrow(ValidationError);
    });

    it('rejects email with spaces', () => {
      expect(() => validateEmail('user @example.com')).toThrow(ValidationError);
      expect(() => validateEmail('user@ example.com')).toThrow(ValidationError);
    });
  });

  describe('validatePassword', () => {
    it('accepts password with minimum length', () => {
      expect(() => validatePassword('12345678')).not.toThrow();
    });

    it('accepts password longer than minimum', () => {
      expect(() => validatePassword('password123')).not.toThrow();
      expect(() => validatePassword('a very long password with spaces')).not.toThrow();
    });

    it('rejects empty password', () => {
      expect(() => validatePassword('')).toThrow(ValidationError);
      expect(() => validatePassword('')).toThrow(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      );
    });

    it('rejects password shorter than minimum', () => {
      expect(() => validatePassword('1234567')).toThrow(ValidationError);
      expect(() => validatePassword('short')).toThrow(ValidationError);
    });
  });

  describe('EMAIL_REGEX', () => {
    it('matches valid email patterns', () => {
      expect(EMAIL_REGEX.test('user@example.com')).toBe(true);
      expect(EMAIL_REGEX.test('USER@EXAMPLE.COM')).toBe(true);
      expect(EMAIL_REGEX.test('a@b.c')).toBe(true);
    });

    it('rejects invalid email patterns', () => {
      expect(EMAIL_REGEX.test('')).toBe(false);
      expect(EMAIL_REGEX.test('invalid')).toBe(false);
      expect(EMAIL_REGEX.test('@invalid.com')).toBe(false);
    });
  });

  describe('checkDuplicateEmail', () => {
    const testEmail = 'duplicate-check@example.com';

    afterEach(async () => {
      // Clean up any test users
      await db.user.deleteMany({ where: { email: testEmail.toLowerCase() } });
    });

    it('passes when email does not exist', async () => {
      await expect(checkDuplicateEmail(testEmail)).resolves.not.toThrow();
    });

    it('throws when email already exists', async () => {
      // Create a user with the test email
      await db.user.create({
        data: {
          email: testEmail.toLowerCase(),
          passwordHash: 'test-hash',
        },
      });

      await expect(checkDuplicateEmail(testEmail)).rejects.toThrow(ValidationError);
      await expect(checkDuplicateEmail(testEmail)).rejects.toThrow(
        `User with email "${testEmail}" already exists`
      );
    });

    it('normalizes email to lowercase for comparison', async () => {
      // Create user with lowercase email
      await db.user.create({
        data: {
          email: testEmail.toLowerCase(),
          passwordHash: 'test-hash',
        },
      });

      // Check with uppercase - should still detect duplicate
      await expect(checkDuplicateEmail(testEmail.toUpperCase())).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('createUser', () => {
    const testEmail = 'create-user-test@example.com';

    afterEach(async () => {
      // Clean up any test users
      await db.user.deleteMany({ where: { email: testEmail.toLowerCase() } });
    });

    it('creates user with valid email and password', async () => {
      const result = await createUser(testEmail, 'validpassword123');

      expect(result.id).toBeDefined();
      expect(result.email).toBe(testEmail.toLowerCase());

      // Verify user exists in database
      const dbUser = await db.user.findUnique({
        where: { id: result.id },
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.email).toBe(testEmail.toLowerCase());
    });

    it('creates user with optional name', async () => {
      const result = await createUser(testEmail, 'validpassword123', 'Test User');

      const dbUser = await db.user.findUnique({
        where: { id: result.id },
      });
      expect(dbUser?.name).toBe('Test User');
    });

    it('creates user without name when not provided', async () => {
      const result = await createUser(testEmail, 'validpassword123');

      const dbUser = await db.user.findUnique({
        where: { id: result.id },
      });
      expect(dbUser?.name).toBeNull();
    });

    it('normalizes email to lowercase', async () => {
      const result = await createUser('TEST@EXAMPLE.COM', 'validpassword123');

      expect(result.email).toBe('test@example.com');

      // Clean up
      await db.user.delete({ where: { id: result.id } });
    });

    it('hashes password before storing', async () => {
      const password = 'plaintext123';
      const result = await createUser(testEmail, password);

      const dbUser = await db.user.findUnique({
        where: { id: result.id },
      });

      // Password should be hashed, not plain text
      expect(dbUser?.passwordHash).not.toBe(password);
      expect(dbUser?.passwordHash).toMatch(/^\$2[aby]?\$\d{1,2}\$/); // bcrypt hash pattern
    });

    it('throws on invalid email', async () => {
      await expect(createUser('invalid', 'validpassword123')).rejects.toThrow(
        ValidationError
      );
    });

    it('throws on short password', async () => {
      await expect(createUser(testEmail, 'short')).rejects.toThrow(ValidationError);
    });

    it('throws on duplicate email', async () => {
      // Create first user
      await createUser(testEmail, 'validpassword123');

      // Try to create second user with same email
      await expect(createUser(testEmail, 'anotherpassword')).rejects.toThrow(
        ValidationError
      );
    });
  });
});
