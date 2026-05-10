import { NotFoundError } from '@valuerank/shared';
import type { Context } from '../../context.js';

type LoadedRun = NonNullable<Awaited<ReturnType<Context['loaders']['run']['load']>>>;

export async function loadRunForResult(runId: string, ctx: Context): Promise<LoadedRun> {
  const run = await ctx.loaders.run.load(runId);
  if (run == null) {
    throw new NotFoundError('Run', runId);
  }
  return run;
}
