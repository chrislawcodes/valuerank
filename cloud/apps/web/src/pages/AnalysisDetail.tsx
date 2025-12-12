/**
 * AnalysisDetail Page
 *
 * Displays detailed analysis for a single run with full AnalysisPanel.
 */

import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Play } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { AnalysisPanel } from '../components/analysis/AnalysisPanel';
import { useRun } from '../hooks/useRun';

export function AnalysisDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { run, loading, error } = useRun({
    id: id || '',
    pause: !id,
    enablePolling: false,
  });

  // Loading state
  if (loading && !run) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/analysis')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <Loading size="lg" text="Loading analysis..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/analysis')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <ErrorMessage message={`Failed to load analysis: ${error.message}`} />
      </div>
    );
  }

  // Not found
  if (!run) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/analysis')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <ErrorMessage message="Run not found" />
      </div>
    );
  }

  // No analysis available (analysisStatus is null when no analysis exists)
  if (!run.analysisStatus) {
    return (
      <div className="space-y-6">
        <Header runId={run.id} definitionName={run.definition?.name} />
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Analysis Available
          </h3>
          <p className="text-gray-500 mb-4">
            This run does not have analysis data. Analysis is computed for completed runs.
          </p>
          <Link
            to={`/runs/${run.id}`}
            className="inline-flex items-center text-teal-600 hover:text-teal-700"
          >
            <Play className="w-4 h-4 mr-1" />
            View Run Details
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header runId={run.id} definitionName={run.definition?.name} />
      <AnalysisPanel runId={run.id} analysisStatus={run.analysisStatus} />
    </div>
  );
}

/**
 * Header component with navigation.
 */
function Header({
  runId,
  definitionName,
}: {
  runId: string;
  definitionName?: string | null;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/analysis')}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Analysis
        </Button>
        <span className="text-gray-300">|</span>
        <div className="text-sm text-gray-500">
          {definitionName || 'Unnamed Definition'}
          <span className="mx-1">•</span>
          <span className="font-mono">Run {runId.slice(0, 8)}...</span>
        </div>
      </div>
      <Link
        to={`/runs/${runId}`}
        className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700"
      >
        <Play className="w-4 h-4" />
        View Run
      </Link>
    </div>
  );
}
