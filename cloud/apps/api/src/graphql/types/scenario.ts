import { builder } from '../builder.js';
import type { Scenario } from '@valuerank/db';

// Scenario GraphQL object type - stub for Phase 3, can be expanded later
export const ScenarioRef = builder.objectRef<Scenario>('Scenario');

builder.objectType(ScenarioRef, {
  description: 'A generated scenario from a definition',
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    content: t.expose('content', { type: 'JSON' }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    // Definition relation added later if needed
  }),
});
