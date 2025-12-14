/**
 * Analysis Banner
 *
 * Shows the analysis status and link to analysis page for a run.
 */

import { Link } from 'react-router-dom';
import { BarChart2, Loader2 } from 'lucide-react';

type AnalysisBannerProps = {
  runId: string;
  analysisStatus: string | null;
  runStatus: string;
};

export function AnalysisBanner({ runId, analysisStatus, runStatus }: AnalysisBannerProps) {
  // Don't show banner if run isn't completed and no analysis exists
  if (runStatus !== 'COMPLETED' && !analysisStatus) {
    return null;
  }

  // Show computing state
  if (analysisStatus === 'computing') {
    return (
      <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-amber-800">Analysis Computing</h3>
            <p className="text-xs text-amber-600 mt-0.5">
              Statistical analysis is being computed. This usually takes a few seconds.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show pending state (can run analysis)
  if (analysisStatus === 'pending') {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900">Analysis Pending</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Analysis is queued and will be computed shortly.
              </p>
            </div>
          </div>
          <Link
            to={`/analysis/${runId}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            View Analysis
          </Link>
        </div>
      </div>
    );
  }

  // Show completed/failed analysis link
  if (analysisStatus === 'completed' || analysisStatus === 'failed') {
    const isCompleted = analysisStatus === 'completed';
    return (
      <div
        className={`rounded-lg border p-4 ${
          isCompleted ? 'bg-purple-50 border-purple-200' : 'bg-red-50 border-red-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isCompleted ? 'bg-purple-100' : 'bg-red-100'
              }`}
            >
              <BarChart2 className={`w-5 h-5 ${isCompleted ? 'text-purple-600' : 'text-red-600'}`} />
            </div>
            <div>
              <h3
                className={`text-sm font-medium ${isCompleted ? 'text-purple-900' : 'text-red-900'}`}
              >
                {isCompleted ? 'Analysis Complete' : 'Analysis Failed'}
              </h3>
              <p className={`text-xs mt-0.5 ${isCompleted ? 'text-purple-600' : 'text-red-600'}`}>
                {isCompleted
                  ? 'Statistical analysis and model comparison results are available.'
                  : 'Analysis encountered an error. You can try recomputing.'}
              </p>
            </div>
          </div>
          <Link
            to={`/analysis/${runId}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            View Analysis
          </Link>
        </div>
      </div>
    );
  }

  // Default: show link if run is completed (even if no analysis status yet)
  if (runStatus === 'COMPLETED') {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900">Analysis</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                View statistical analysis and model comparison results.
              </p>
            </div>
          </div>
          <Link
            to={`/analysis/${runId}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            View Analysis
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
