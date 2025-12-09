/**
 * Models Queries
 *
 * GraphQL queries for available LLM models.
 * Uses database-backed model configuration (Phase 3+).
 */

import { builder } from '../builder.js';
import { AvailableModelType } from '../types/available-model.js';
import { getModelsFromDatabase } from '../../config/models.js';

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
    args: {
      availableOnly: t.arg.boolean({
        required: false,
        description: 'Only return models that are available (provider API key configured)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug('Fetching available models from database');

      const dbModels = await getModelsFromDatabase({
        activeOnly: true,
        availableOnly: args.availableOnly ?? false,
      });

      // Map to AvailableModel format for backward compatibility
      const models = dbModels.map((m) => ({
        id: m.modelId, // Use modelId as the identifier for runs
        providerId: m.providerName, // Use provider name as identifier
        displayName: m.displayName,
        versions: [m.modelId], // Single version from database
        defaultVersion: m.modelId,
        isAvailable: m.isAvailable,
        isDefault: m.isDefault, // Include default status for UI pre-selection
      }));

      ctx.log.debug(
        { totalModels: models.length, availableCount: models.filter((m) => m.isAvailable).length },
        'Available models fetched from database'
      );

      return models;
    },
  })
);
