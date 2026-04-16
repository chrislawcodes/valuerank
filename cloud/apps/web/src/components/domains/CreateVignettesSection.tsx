import { useState } from 'react';
import { Button } from '../ui/Button';
import {
  useEnsureDomainVignettePairMutation,
  type VignettePairStatus,
} from '../../generated/graphql';

type ValueStatement = { id: string; token: string };

type Props = {
  domainId: string;
  valueStatements: ValueStatement[];
  hasPendingChanges: boolean;
};

type ProgressState = {
  phase: 'idle' | 'running' | 'done' | 'error';
  current: number;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  skippedHasRuns: number;
  errors: number;
  fatalError: string | null;
};

const INITIAL_PROGRESS: ProgressState = {
  phase: 'idle',
  current: 0,
  total: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  skippedHasRuns: 0,
  errors: 0,
  fatalError: null,
};

export function CreateVignettesSection({
  domainId,
  valueStatements,
  hasPendingChanges,
}: Props) {
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS);
  const [, executeMutation] = useEnsureDomainVignettePairMutation();

  const pairs: [ValueStatement, ValueStatement][] = [];
  for (let i = 0; i < valueStatements.length; i++) {
    for (let j = i + 1; j < valueStatements.length; j++) {
      pairs.push([valueStatements[i]!, valueStatements[j]!]);
    }
  }
  const total = pairs.length;

  const handleCreate = async () => {
    if (hasPendingChanges || progress.phase === 'running') return;

    setProgress({
      phase: 'running',
      current: 0,
      total,
      created: 0,
      updated: 0,
      skipped: 0,
      skippedHasRuns: 0,
      errors: 0,
      fatalError: null,
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let skippedHasRuns = 0;
    let errors = 0;
    let isFirstCall = true;

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i]!;
      const result = await executeMutation({
        input: {
          domainId,
          valueFirstId: pair[0].id,
          valueSecondId: pair[1].id,
        },
      });

      if (result.error != null) {
        if (isFirstCall) {
          setProgress((prev) => ({
            ...prev,
            phase: 'error',
            fatalError: result.error?.message ?? 'Failed to create vignettes',
          }));
          return;
        }
        errors += 1;
      } else {
        const status: VignettePairStatus | undefined =
          result.data?.ensureDomainVignettePair?.status;

        if (status === 'CREATED') created += 1;
        else if (status === 'UPDATED') updated += 1;
        else if (status === 'SKIPPED_HAS_RUNS') skippedHasRuns += 1;
        else skipped += 1;
      }

      isFirstCall = false;
      const current = i + 1;
      setProgress((prev) => ({
        ...prev,
        current,
        created,
        updated,
        skipped,
        skippedHasRuns,
        errors,
      }));
    }

    setProgress((prev) => ({ ...prev, phase: 'done' }));
  };

  const isDisabled = hasPendingChanges || progress.phase === 'running' || total < 2;

  return (
    <div className="border-t border-gray-200 pt-4 mt-4">
      <h4 className="text-sm font-medium text-gray-700 mb-2">Vignettes</h4>

      {hasPendingChanges && (
        <p className="text-xs text-amber-600 mb-2">
          Save your changes before creating vignettes.
        </p>
      )}

      {total < 2 && (
        <p className="text-xs text-gray-500 mb-2">
          Add at least 2 value statements to create vignette pairs.
        </p>
      )}

      {progress.phase === 'running' && (
        <p className="text-xs text-gray-600 mb-2">
          Processing pair {progress.current} of {total}…
        </p>
      )}

      {progress.phase === 'done' && (
        <p className="text-xs text-gray-600 mb-2">
          Done — Created {progress.created}, Updated {progress.updated}, Skipped{' '}
          {progress.skipped + progress.skippedHasRuns}
          {progress.skippedHasRuns > 0 && ` (${progress.skippedHasRuns} skipped — has run data)`}
          {progress.errors > 0 && `, ${progress.errors} failed`}
        </p>
      )}

      {progress.phase === 'error' && progress.fatalError != null && (
        <p className="text-xs text-red-600 mb-2">Error: {progress.fatalError}</p>
      )}

      <Button
        onClick={() => void handleCreate()}
        disabled={isDisabled}
        variant="secondary"
        size="sm"
      >
        {progress.phase === 'running' ? 'Creating…' : 'Create Vignettes'}
      </Button>
    </div>
  );
}
