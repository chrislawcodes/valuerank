import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { ValueStatementRef } from '../types/refs.js';
import { CreateValueStatementInput, UpdateValueStatementInput } from '../types/value-statement.js';

builder.mutationFields((t) => ({
  createValueStatement: t.field({
    type: ValueStatementRef,
    args: { input: t.arg({ type: CreateValueStatementInput, required: true }) },
    resolve: async (_root, args, ctx) => {
      const { domainId, token, body } = args.input;
      ctx.log.info({ token, domainId }, 'Creating value statement');
      const existing = await db.valueStatement.findUnique({
        where: { domainId_token: { domainId, token } },
      });
      if (existing != null) throw new Error(`Value statement for token "${token}" already exists in this domain`);
      return db.valueStatement.create({
        data: { domainId, token, body },
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
