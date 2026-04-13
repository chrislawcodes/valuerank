import { builder } from '../builder.js';
import { AppError } from '@valuerank/shared';
import { ScenarioRef, DefinitionRef } from './refs.js';

// Re-export for backward compatibility
export { ScenarioRef };

builder.objectType(ScenarioRef, {
  description: 'A generated scenario from a definition',
  fields: (t) => ({
    id: t.exposeID('id'),
    definitionId: t.exposeString('definitionId'),
    name: t.exposeString('name'),
    content: t.expose('content', { type: 'JSON' }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),

    // Relation: definition
    definition: t.field({
      type: DefinitionRef,
      resolve: async (scenario, _args, ctx) => {
        const definition = await ctx.loaders.definition.load(scenario.definitionId);
        if (!definition) {
          throw new AppError(`Definition not found for scenario ${scenario.id}`, 'NOT_FOUND', 404);
        }
        return definition;
      },
    }),
  }),
});
