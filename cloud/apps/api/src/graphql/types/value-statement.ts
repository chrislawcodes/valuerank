import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { DomainRef, ValueStatementRef } from './refs.js';

builder.objectType(ValueStatementRef, {
  description: 'A value statement keyed by (domainId, token), used in Job Choice vignette assembly',
  fields: (t) => ({
    id: t.exposeID('id'),
    domainId: t.exposeID('domainId'),
    token: t.exposeString('token'),
    body: t.exposeString('body'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    domain: t.field({
      type: DomainRef,
      nullable: true,
      resolve: (parent, _args, ctx) => {
        ctx.log.debug({ domainId: parent.domainId }, 'Resolving domain for value statement');
        return db.domain.findUnique({ where: { id: parent.domainId } });
      },
    }),
  }),
});

export const CreateValueStatementInput = builder.inputType('CreateValueStatementInput', {
  fields: (t) => ({
    domainId: t.string({ required: true }),
    token: t.string({ required: true }),
    body: t.string({ required: true }),
  }),
});

export const UpdateValueStatementInput = builder.inputType('UpdateValueStatementInput', {
  fields: (t) => ({
    body: t.string({ required: true }),
  }),
});
