import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { PreambleRef } from '../types/refs.js';

builder.queryFields((t) => ({
    preambles: t.field({
        description: 'List all preambles',
        type: [PreambleRef],
        resolve: async () => {
            return db.preamble.findMany({
                orderBy: { updatedAt: 'desc' },
            });
        },
    }),
    preamble: t.field({
        description: 'Get a specific preamble by ID',
        type: PreambleRef,
        nullable: true,
        args: {
            id: t.arg.id({ required: true }),
        },
        resolve: async (_root, args) => {
            return db.preamble.findUnique({
                where: { id: String(args.id) },
            });
        },
    }),
}));
