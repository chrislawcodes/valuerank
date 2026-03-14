import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { DomainContextRef, DomainRef } from './refs.js';

builder.objectType(DomainContextRef, {
  description: 'A shared context paragraph for all vignettes in a domain',
  fields: (t) => ({
    id: t.exposeID('id'),
    domainId: t.exposeID('domainId'),
    text: t.exposeString('text'),
    version: t.exposeInt('version'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    domain: t.field({
      type: DomainRef,
      nullable: true,
      resolve: (parent, _args, ctx) => {
        ctx.log.debug({ domainId: parent.domainId }, 'Resolving domain for context');
        return db.domain.findUnique({ where: { id: parent.domainId } });
      },
    }),
  }),
});

export const CreateDomainContextInput = builder.inputType('CreateDomainContextInput', {
  fields: (t) => ({
    domainId: t.string({ required: true }),
    text: t.string({ required: true }),
  }),
});

export const UpdateDomainContextInput = builder.inputType('UpdateDomainContextInput', {
  fields: (t) => ({
    text: t.string({ required: true }),
  }),
});
