import { useState, useEffect } from 'react';
import { BarChart2, BarChart3, AlertCircle, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import type { AnalysisWarning } from '../../api/operations/analysis';

export function WarningBanner({ warning }: { warning: AnalysisWarning }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-800">{warning.message}</p>
        <p className="text-xs text-amber-600 mt-1">{warning.recommendation}</p>
      </div>
    </div>
  );
}

export function AnalysisPending({
  status,
  onRunAnalysis,
  isRunning,
  pendingSince,
}: {
  status: string | null | undefined;
  onRunAnalysis?: () => void;
  isRunning?: boolean;
  pendingSince?: string | null;
}) {
  const isComputing = status === 'computing';
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (pendingSince == null) {
      setElapsedMs(0);
      return;
    }

    const baseTime = new Date(pendingSince).getTime();
    if (!Number.isFinite(baseTime)) {
      setElapsedMs(0);
      return;
    }

    const tick = () => { setElapsedMs(Math.max(0, Date.now() - baseTime)); };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [pendingSince]);

  const elapsedText = elapsedMs > 0
    ? `${Math.floor(elapsedMs / 60000)}m ${Math.floor((elapsedMs % 60000) / 1000)}s`
    : null;

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {isComputing === true || isRunning === true ? (
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin mb-4" />
      ) : (
        <Clock className="w-8 h-8 text-gray-400 mb-4" />
      )}
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {isComputing === true || isRunning === true ? 'Computing Analysis...' : 'Analysis Pending'}
      </h3>
      <p className="text-sm text-gray-500 max-w-md">
        {isComputing === true || isRunning === true
          ? 'Statistical analysis is being computed. This usually takes a few seconds.'
          : 'Analysis has not been computed yet for this run.'}
      </p>
      {elapsedText != null && (
        <p className="text-xs text-gray-500 mt-2">
          Elapsed: {elapsedText} (auto-refresh every 5s)
        </p>
      )}
      {isComputing !== true && isRunning !== true && onRunAnalysis != null && (
        <Button variant="primary" size="sm" onClick={onRunAnalysis} className="mt-4">
          <BarChart2 className="w-4 h-4 mr-2" />
          Analyze Trial
        </Button>
      )}
    </div>
  );
}

export function AnalysisEmpty({
  onRunAnalysis,
  isRunning,
  status,
}: {
  onRunAnalysis?: () => void;
  isRunning?: boolean;
  status: string | null | undefined;
}) {
  const isFailed = status === 'failed';

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mx-auto h-12 w-12 text-gray-400 flex items-center justify-center">
        {isFailed ? (
          <AlertCircle className="w-12 h-12 text-amber-500" />
        ) : (
          <BarChart3 className="w-12 h-12 text-gray-300" />
        )}
      </div>
      <h3 className="mt-4 text-lg font-medium text-gray-900">
        {isFailed ? 'Analysis Failed' : 'Analysis Not Available'}
      </h3>
      <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
        {isFailed
          ? 'The analysis computation failed. This may be due to insufficient valid transcript data or a system error.'
          : 'Analysis has not been computed for this run yet, or there were not enough successful transcripts with decision codes.'}
      </p>
      {onRunAnalysis != null && (
        <div className="mt-6">
          <Button variant="primary" size="sm" onClick={onRunAnalysis} disabled={isRunning}>
            {isRunning === true ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Analysis...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                {isFailed ? 'Retry Analysis' : 'Analyze Trial'}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
