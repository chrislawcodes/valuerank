#!/usr/bin/env tsx
import * as readline from 'readline';
import { db } from '@valuerank/db';
import { createLogger, ValidationError } from '@valuerank/shared';
import { hashPassword } from '../auth/index.js';
import { validateEmail, validatePassword } from './create-user.js';

const log = createLogger('cli:ensure-user');

function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      promptLine(question).then(resolve);
      return;
    }

    stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.setRawMode(true);

    let input = '';

    const onData = (char: string) => {
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004': {
          stdout.write('\n');
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          resolve(input);
          return;
        }
        case '\u0003': {
          stdout.write('\n');
          process.exit(130);
        }
        case '\u007f': {
          input = input.slice(0, -1);
          return;
        }
        default: {
          input += char;
        }
      }
    };

    stdin.on('data', onData);
  });
}

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

  const password = await promptHidden('Enter password: ');
  validatePassword(password);

  const passwordHash = await hashPassword(password);

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
      log.error(err.message);
      process.exit(1);
    }
    log.error({ err }, 'Failed to ensure user');
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
