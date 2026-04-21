import { useEffect, useState } from 'react';

type LoadingStage = 'prepare' | 'analyze';

type Props = {
  stage: LoadingStage;
  modelCount: number;
  signature: string;
  threshold: number;
};

const stageCopy: Record<LoadingStage, { label: string; initialProgress: number }> = {
  prepare: {
    label: 'Preparing model and signature data',
    initialProgress: 15,
  },
  analyze: {
    label: 'Computing circumplex fit across models',
    initialProgress: 35,
  },
};

function useEstimatedProgress(initialProgress: number): number {
  const [progress, setProgress] = useState(initialProgress);

  useEffect(() => {
    const startedAt = Date.now();
    setProgress(initialProgress);

    const interval = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      const easedProgress = initialProgress + (92 - initialProgress) * (1 - Math.exp(-elapsedMs / 9000));
      setProgress((current) => Math.max(current, Math.min(92, Math.round(easedProgress))));
    }, 500);

    return () => window.clearInterval(interval);
  }, [initialProgress]);

  return progress;
}

export function CircumplexLoadingProgress({ stage, modelCount, signature, threshold }: Props) {
  const { label, initialProgress } = stageCopy[stage];
  const progress = useEstimatedProgress(initialProgress);
  const modelText = modelCount === 1 ? '1 model' : `${modelCount} models`;

  return (
    <div className="flex min-h-[320px] items-center justify-center px-4 py-12">
      <section className="w-full max-w-xl rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Loading Circumplex</p>
          <h2 className="text-xl font-semibold text-gray-950">{label}</h2>
          <p className="text-sm leading-6 text-gray-600">
            Estimated progress for {modelText} on <span className="font-medium text-gray-800">{signature}</span>
            {' '}with at least {threshold} trials per value.
          </p>
        </div>

        <div className="mt-6" aria-live="polite">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Estimated progress</span>
            <span className="font-semibold text-teal-700">{progress}%</span>
          </div>
          <div
            aria-label="Estimated circumplex loading progress"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress}
            className="h-3 overflow-hidden rounded-full bg-gray-100"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 via-cyan-500 to-emerald-400 transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <p className="mt-4 text-xs leading-5 text-gray-500">
          This is an estimate while the server aggregates transcript data. The full report appears as soon as the analysis response returns.
        </p>
      </section>
    </div>
  );
}
