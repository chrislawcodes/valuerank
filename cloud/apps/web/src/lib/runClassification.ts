type RunLike = {
  definition?: {
    name?: string | null;
  } | null;
};

const SURVEY_RUN_PREFIX = '[Survey]';

export function isSurveyRun(run: RunLike): boolean {
  return (run.definition?.name ?? '').startsWith(SURVEY_RUN_PREFIX);
}

export function isNonSurveyRun(run: RunLike): boolean {
  return !isSurveyRun(run);
}
