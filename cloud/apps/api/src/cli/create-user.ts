#!/usr/bin/env tsx
/**
 * CLI script for creating user accounts
 *
 * Usage: npm run create-user
 *
 * This is an interactive CLI that prompts for email, password, and optional name.
 * Used for invite-only user creation by administrators.
 */

import * as readline from 'readline';
import { fileURLToPath } from 'url';

import { db } from '@valuerank/db';
import { createLogger, ValidationError } from '@valuerank/shared';

import { hashPassword } from '../auth/index.js';

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
 * Prompt for input with optional masking
 */
function prompt(
  rl: readline.Interface,
  question: string
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n=== Create User ===\n');

  try {
    // Collect inputs
    const email = await prompt(rl, 'Email: ');
    const password = await prompt(rl, 'Password: ');
    const name = await prompt(rl, 'Name (optional, press Enter to skip): ');

    console.log('\nCreating user...');

    const user = await createUser(email, password, name || undefined);

    console.log(`\n✓ User created successfully!`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}\n`);
  } catch (err) {
    if (err instanceof ValidationError) {
      console.error(`\n✗ Validation error: ${err.message}\n`);
      process.exit(1);
    }

    log.error({ err }, 'Failed to create user');
    console.error(`\n✗ Failed to create user: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
    process.exit(1);
  } finally {
    rl.close();
    await db.$disconnect();
  }
}

// Run CLI only when executed directly (not when imported for testing)
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
