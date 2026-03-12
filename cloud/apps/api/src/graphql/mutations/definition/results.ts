import { builder } from '../../builder.js';

type DeleteDefinitionResultShape = {
  deletedIds: string[];
  count: number;
};

export const DeleteDefinitionResultRef =
  builder.objectRef<DeleteDefinitionResultShape>('DeleteDefinitionResult');

builder.objectType(DeleteDefinitionResultRef, {
  description: 'Result of deleting a definition',
  fields: (t) => ({
    deletedIds: t.stringList({
      description: 'IDs of all definitions that were deleted (includes descendants)',
      resolve: (parent) => parent.deletedIds,
    }),
    count: t.exposeInt('count', {
      description: 'Total number of definitions deleted',
    }),
  }),
});

type RegenerateScenariosResultShape = {
  definitionId: string;
  jobId: string | null;
  queued: boolean;
};

export const RegenerateScenariosResultRef = builder.objectRef<RegenerateScenariosResultShape>(
  'RegenerateScenariosResult'
);

builder.objectType(RegenerateScenariosResultRef, {
  description: 'Result of triggering scenario regeneration',
  fields: (t) => ({
    definitionId: t.exposeString('definitionId', {
      description: 'ID of the definition being regenerated',
    }),
    jobId: t.exposeString('jobId', {
      nullable: true,
      description: 'ID of the queued expansion job (null if not queued)',
    }),
    queued: t.exposeBoolean('queued', {
      description: 'Whether a new expansion job was queued',
    }),
  }),
});

type CancelExpansionResultShape = {
  definitionId: string;
  cancelled: boolean;
  jobId: string | null;
  message: string;
};

export const CancelExpansionResultRef =
  builder.objectRef<CancelExpansionResultShape>('CancelExpansionResult');

builder.objectType(CancelExpansionResultRef, {
  description: 'Result of cancelling scenario expansion',
  fields: (t) => ({
    definitionId: t.exposeString('definitionId', {
      description: 'ID of the definition',
    }),
    cancelled: t.exposeBoolean('cancelled', {
      description: 'Whether an active job was cancelled',
    }),
    jobId: t.exposeString('jobId', {
      nullable: true,
      description: 'ID of the cancelled job (null if no active job)',
    }),
    message: t.exposeString('message', {
      description: 'Status message',
    }),
  }),
});
