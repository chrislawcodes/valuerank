#!/usr/bin/env tsx
/**
 * CLI script for creating user accounts
 *
 * Usage: npm run create-user
 *
 * This is an interactive CLI that prompts for email, password, and optional name.
 * Used for invite-only user creation by administrators.
 */

import { fileURLToPath } from 'url';

import { db } from '@valuerank/db';
import { createLogger, ValidationError } from '@valuerank/shared';

import { hashPassword } from '../auth/index.js';
import { promptHidden, promptLine } from './shared/prompt.js';

const log = createLogger('cli:create-user');

/** Minimum password length */
export const MIN_PASSWORD_LENGTH = 8;

/** Email format regex */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email format
 */
export function validateEmail(email: string): void {
  if (!email || !EMAIL_REGEX.test(email)) {
    throw new ValidationError('Invalid email format');
  }
}

/**
 * Validate password meets requirements
 */
export function validatePassword(password: string): void {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    );
  }
}

/**
 * Check if email already exists in database
 */
export async function checkDuplicateEmail(email: string): Promise<void> {
  const existing = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existing) {
    throw new ValidationError(`User with email "${email}" already exists`);
  }
}

/**
 * Create a new user in the database
 */
export async function createUser(
  email: string,
  password: string,
  name?: string
): Promise<{ id: string; email: string }> {
  // Normalize email to lowercase
  const normalizedEmail = email.toLowerCase();

  // Validate inputs
  validateEmail(normalizedEmail);
  validatePassword(password);

  // Check for duplicate
  await checkDuplicateEmail(normalizedEmail);

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const user = await db.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      name: name || null,
    },
    select: {
      id: true,
      email: true,
    },
  });

  log.info({ userId: user.id, email: user.email }, 'User created successfully');

  return user;
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  log.info('Create user');

  try {
    // Collect inputs
    const email = await promptLine('Email: ');
    const password = await promptHidden('Password: ');
    const name = await promptLine('Name (optional, press Enter to skip): ');

    log.info('Creating user');

    const user = await createUser(email, password, name || undefined);

    log.info({ userId: user.id, email: user.email }, 'User created successfully');
  } catch (err) {
    if (err instanceof ValidationError) {
      log.error({ message: err.message }, 'Validation error');
      process.exit(1);
    }

    log.error({ err }, 'Failed to create user');
    log.error(
      { message: err instanceof Error ? err.message : 'Unknown error' },
      'Failed to create user'
    );
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

// Run CLI only when executed directly (not when imported for testing)
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((err) => {
    log.error({ err }, 'Fatal error');
    process.exit(1);
  });
}
