import { builder } from '../builder.js';
import { DefinitionRef } from '../types/refs.js';
import type { DefinitionShape } from '../types/refs.js';

export type PairedVignetteResult = { definitionA: DefinitionShape; definitionB: DefinitionShape };

export const CreatePairedVignetteResultRef =
  builder.objectRef<PairedVignetteResult>('CreatePairedVignetteResult');

builder.objectType(CreatePairedVignetteResultRef, {
  fields: (t) => ({
    definitionA: t.field({ type: DefinitionRef, resolve: (result) => result.definitionA }),
    definitionB: t.field({ type: DefinitionRef, resolve: (result) => result.definitionB }),
  }),
});

export const CreatePairedVignetteInput = builder.inputType('CreatePairedVignetteInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    domainId: t.id({ required: true }),
    contextId: t.id({ required: true }),
    valueFirstId: t.id({ required: true }),
    valueSecondId: t.id({ required: true }),
    preambleVersionId: t.id({ required: false }),
    levelPresetVersionId: t.id({ required: false }),
  }),
});

export const UpdatePairedVignetteInput = builder.inputType('UpdatePairedVignetteInput', {
  fields: (t) => ({
    definitionId: t.id({ required: true }),
    name: t.string({ required: true }),
    contextId: t.id({ required: true }),
    valueFirstId: t.id({ required: true }),
    valueSecondId: t.id({ required: true }),
    preambleVersionId: t.id({ required: false }),
    levelPresetVersionId: t.id({ required: false }),
  }),
});
