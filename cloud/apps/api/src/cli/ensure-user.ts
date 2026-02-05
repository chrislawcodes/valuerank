#!/usr/bin/env tsx
import { db } from '@valuerank/db';
import { hashPassword } from '../auth/index.js';
import { createLogger } from '@valuerank/shared';

const log = createLogger('cli:ensure-user');

async function main() {
    const email = process.argv[2];
    const password = process.argv[3];
    const name = process.argv[4];

    if (!email || !password) {
        console.error('Usage: npx tsx src/cli/ensure-user.ts <email> <password> [name]');
        process.exit(1);
    }

    console.log(`Ensuring user exists: ${email}`);

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

main()
    .catch((err) => {
        console.error('Failed to ensure user:', err);
        process.exit(1);
    })
    .finally(async () => {
        await db.$disconnect();
    });
