import { builder } from '../builder.js';
import { ValueStatementRef } from './refs.js';

builder.objectType(ValueStatementRef, {
  description: 'A value statement keyed by token, used in Job Choice vignette assembly',
  fields: (t) => ({
    id: t.exposeID('id'),
    token: t.exposeString('token'),
    body: t.exposeString('body'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});

export const CreateValueStatementInput = builder.inputType('CreateValueStatementInput', {
  fields: (t) => ({
    token: t.string({ required: true }),
    body: t.string({ required: true }),
  }),
});

export const UpdateValueStatementInput = builder.inputType('UpdateValueStatementInput', {
  fields: (t) => ({
    body: t.string({ required: true }),
  }),
});
