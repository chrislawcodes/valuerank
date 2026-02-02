import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { PreambleRef, PreambleVersionRef } from './refs.js';

// PreambleVersion Type
builder.objectType(PreambleVersionRef, {
    description: 'A versioned snapshot of a preamble',
    fields: (t) => ({
        id: t.exposeID('id'),
        preambleId: t.exposeString('preambleId'),
        version: t.exposeString('version'),
        content: t.exposeString('content'),
        createdAt: t.expose('createdAt', { type: 'DateTime' }),
    }),
});

// Preamble Type
builder.objectType(PreambleRef, {
    description: 'A reusable preamble that can be prepended to scenarios',
    fields: (t) => ({
        id: t.exposeID('id'),
        name: t.exposeString('name'),
        createdAt: t.expose('createdAt', { type: 'DateTime' }),
        updatedAt: t.expose('updatedAt', { type: 'DateTime' }),

        // Versions relation
        versions: t.field({
            type: [PreambleVersionRef],
            description: 'History of all versions for this preamble',
            resolve: async (parent) => {
                return db.preambleVersion.findMany({
                    where: { preambleId: parent.id },
                    orderBy: { createdAt: 'desc' },
                });
            },
        }),

        // Helper: Latest Version
        latestVersion: t.field({
            type: PreambleVersionRef,
            nullable: true,
            description: 'The most recently created version',
            resolve: async (parent) => {
                const versions = await db.preambleVersion.findMany({
                    where: { preambleId: parent.id },
                    orderBy: { createdAt: 'desc' },
                    take: 1
                });
                return versions[0] || null;
            },
        }),
    }),
});

// Input Types
export const CreatePreambleInput = builder.inputType('CreatePreambleInput', {
    fields: (t) => ({
        name: t.string({ required: true }),
        content: t.string({ required: true }),
    }),
});

export const UpdatePreambleInput = builder.inputType('UpdatePreambleInput', {
    fields: (t) => ({
        content: t.string({ required: true }),
    }),
});
