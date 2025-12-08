import DataLoader from 'dataloader';
import { db } from '@valuerank/db';
import type { Experiment } from '@valuerank/db';

export function createExperimentLoader(): DataLoader<string, Experiment | null> {
  return new DataLoader<string, Experiment | null>(async (ids) => {
    const experiments = await db.experiment.findMany({
      where: { id: { in: [...ids] } },
    });

    // Create a map for O(1) lookup
    const experimentMap = new Map(experiments.map((e) => [e.id, e]));

    // Return in same order as input ids
    return ids.map((id) => experimentMap.get(id) ?? null);
  });
}
