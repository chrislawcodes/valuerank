import '../types/value-statement.js';
import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { ValueStatementRef } from '../types/refs.js';

builder.queryFields((t) => ({
  valueStatements: t.field({
    type: [ValueStatementRef],
    resolve: async (_root, _args, ctx) => {
      ctx.log.debug('Listing value statements');
      return db.valueStatement.findMany({ orderBy: { token: 'asc' } });
    },
  }),
  valueStatement: t.field({
    type: ValueStatementRef,
    nullable: true,
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ id: String(args.id) }, 'Fetching value statement');
      return db.valueStatement.findUnique({ where: { id: String(args.id) } });
    },
  }),
}));
