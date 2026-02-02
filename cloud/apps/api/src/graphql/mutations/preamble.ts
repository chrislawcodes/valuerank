import { builder } from '../builder.js';
import { createPreamble, updatePreamble, deletePreamble } from '../../services/preamble/index.js';
import { PreambleRef } from '../types/refs.js';
import { CreatePreambleInput, UpdatePreambleInput } from '../types/preamble.js';

builder.mutationFields((t) => ({
    createPreamble: t.field({
        description: 'Create a new preamble',
        type: PreambleRef,
        args: {
            input: t.arg({ type: CreatePreambleInput, required: true }),
        },
        resolve: async (_root, args) => {
            // Logic from Service returns { ...preamble, latestVersion }.
            // This matches PreambleRef shape + resolver logic.
            return createPreamble(args.input.name, args.input.content);
        },
    }),
    updatePreamble: t.field({
        description: 'Update a preamble (creates a new version)',
        type: PreambleRef,
        args: {
            id: t.arg.id({ required: true }),
            input: t.arg({ type: UpdatePreambleInput, required: true }),
        },
        resolve: async (_root, args) => {
            return updatePreamble(String(args.id), args.input.content);
        },
    }),
    deletePreamble: t.field({
        description: 'Delete a preamble',
        type: PreambleRef,
        args: {
            id: t.arg.id({ required: true }),
        },
        resolve: async (_root, args) => {
            return deletePreamble(String(args.id));
        },
    }),
}));
