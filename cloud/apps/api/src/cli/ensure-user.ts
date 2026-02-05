#!/usr/bin/env tsx
import { db } from '@valuerank/db';
import { createLogger, ValidationError } from '@valuerank/shared';
import { hashPassword } from '../auth/index.js';
import { validateEmail, validatePassword } from './create-user.js';
import { promptHidden, promptLine } from './shared/prompt.js';

const log = createLogger('cli:ensure-user');

async function main() {
  const emailArg = process.argv[2];
  const name = process.argv[3];

  if (!emailArg) {
    log.error('Usage: npx tsx src/cli/ensure-user.ts <email> [name]');
    process.exit(1);
  }

  const email = emailArg.toLowerCase();
  validateEmail(email);

  log.info({ email }, 'Ensuring user exists');

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    const confirm = await promptLine(
      `User already exists (ID: ${existing.id}). Reset password${name ? ' and update name' : ''}? (y/N): `
    );
    if (!['y', 'yes'].includes(confirm.toLowerCase())) {
      log.info('No changes applied.');
      return;
    }
  }

  let password = await promptHidden('Enter password: ');
  validatePassword(password);

  const passwordHash = await hashPassword(password);
  password = '';

  const user = await db.user.upsert({
    where: { email },
    update: {
      passwordHash,
      name: name || undefined,
    },
    create: {
      email,
      passwordHash,
      name: name || null,
    },
  });

  log.info({ email: user.email, userId: user.id }, 'User ready');
}

void main()
  .catch((err) => {
    if (err instanceof ValidationError) {
      log.error({ message: err.message }, 'Validation error');
      process.exit(1);
    }
    log.error({ err }, 'Failed to ensure user');
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
