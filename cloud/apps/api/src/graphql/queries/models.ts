/**
 * Models Queries
 *
 * GraphQL queries for available LLM models.
 */

import { builder } from '../builder.js';
import { AvailableModelType } from '../types/available-model.js';
import { getAvailableModels } from '../../config/models.js';

// Query: availableModels - List all available LLM models
builder.queryField('availableModels', (t) =>
  t.field({
    type: [AvailableModelType],
    description: `
      List available LLM models for evaluation runs.

      Returns all supported models with their availability status.
      A model is available if the corresponding provider API key is configured.

      Use these model IDs when starting a run with the startRun mutation.
    `,
    resolve: async (_root, _args, ctx) => {
      ctx.log.debug('Fetching available models');

      const models = getAvailableModels();

      ctx.log.debug(
        { totalModels: models.length, availableCount: models.filter((m) => m.isAvailable).length },
        'Available models fetched'
      );

      return models;
    },
  })
);
