import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { DomainContextRef } from '../types/refs.js';
import { CreateDomainContextInput, UpdateDomainContextInput } from '../types/domain-context.js';

builder.mutationFields((t) => ({
  createDomainContext: t.field({
    type: DomainContextRef,
    args: { input: t.arg({ type: CreateDomainContextInput, required: true }) },
    resolve: async (_root, args, ctx) => {
      ctx.log.info({ domainId: args.input.domainId }, 'Creating domain context');
      return db.domainContext.create({
        data: {
          domainId: args.input.domainId,
          text: args.input.text,
        },
      });
    },
  }),
  updateDomainContext: t.field({
    type: DomainContextRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateDomainContextInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      ctx.log.info({ id }, 'Updating domain context');
      const existing = await db.domainContext.findUnique({ where: { id } });
      if (existing == null) throw new Error(`DomainContext ${id} not found`);
      return db.domainContext.update({
        where: { id },
        data: { text: args.input.text, version: existing.version + 1 },
      });
    },
  }),
  deleteDomainContext: t.field({
    type: 'Boolean',
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      ctx.log.info({ id }, 'Deleting domain context');
      await db.domainContext.delete({ where: { id } });
      return true;
    },
  }),
}));
