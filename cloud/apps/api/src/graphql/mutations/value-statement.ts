import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { ValueStatementRef } from '../types/refs.js';
import { CreateValueStatementInput, UpdateValueStatementInput } from '../types/value-statement.js';

builder.mutationFields((t) => ({
  createValueStatement: t.field({
    type: ValueStatementRef,
    args: { input: t.arg({ type: CreateValueStatementInput, required: true }) },
    resolve: async (_root, args, ctx) => {
      ctx.log.info({ token: args.input.token }, 'Creating value statement');
      const existing = await db.valueStatement.findUnique({
        where: { token: args.input.token },
      });
      if (existing != null) throw new Error(`Value statement for token "${args.input.token}" already exists`);
      return db.valueStatement.create({
        data: { token: args.input.token, body: args.input.body },
      });
    },
  }),
  updateValueStatement: t.field({
    type: ValueStatementRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateValueStatementInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      ctx.log.info({ id }, 'Updating value statement');
      const existing = await db.valueStatement.findUnique({ where: { id } });
      if (existing == null) throw new Error(`ValueStatement ${id} not found`);
      return db.valueStatement.update({
        where: { id },
        data: { body: args.input.body },
      });
    },
  }),
  deleteValueStatement: t.field({
    type: 'Boolean',
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      ctx.log.info({ id }, 'Deleting value statement');
      await db.valueStatement.delete({ where: { id } });
      return true;
    },
  }),
}));
