#!/usr/bin/env tsx
import * as readline from 'readline';
import { db } from '@valuerank/db';
import { hashPassword } from '../auth/index.js';

async function main() {
    const email = process.argv[2];
    const name = process.argv[3];

    if (!email) {
        console.error('Usage: npx tsx src/cli/ensure-user.ts <email> [name]');
        process.exit(1);
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const question = (query: string): Promise<string> =>
        new Promise((resolve) => rl.question(query, resolve));

    console.log(`Ensuring user exists: ${email}`);

    // Hidden password input is tricky in standard readline, but for this CLI
    // we'll just use a standard question for simplicity or a simple prompt.
    // To avoid password being visible in shell history, we use rl.question.
    const password = await question('Enter password: ');
    rl.close();

    if (!password || password.length < 8) {
        console.error('Password must be at least 8 characters long');
        process.exit(1);
    }

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

    console.log(`✓ User ${user.email} is ready (ID: ${user.id})`);
}

void main()
    .catch((err) => {
        console.error('Failed to ensure user:', err);
        process.exit(1);
    })
    .finally(() => {
        void db.$disconnect();
    });
