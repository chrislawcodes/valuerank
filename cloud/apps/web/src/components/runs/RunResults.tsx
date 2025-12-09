/**
 * RunResults Component
 *
 * Displays results of a completed run with transcript list and export options.
 */

import { useState } from 'react';
import { Download, FileText, BarChart2, List, Grid, DollarSign } from 'lucide-react';
import { Button } from '../ui/Button';
import { TranscriptList } from './TranscriptList';
import { TranscriptViewer } from './TranscriptViewer';
import type { Run, Transcript } from '../../api/operations/runs';

type RunResultsProps = {
  run: Run;
  onExport?: () => void;
  isExporting?: boolean;
};

type ViewMode = 'list' | 'grouped';

/**
 * Format cost for display.
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    // Show fractions of a cent
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Calculate summary stats from transcripts.
 */
function calculateStats(transcripts: Transcript[]) {
  if (transcripts.length === 0) {
    return {
      totalTokens: 0,
      avgTokens: 0,
      avgTurns: 0,
      avgDuration: 0,
      totalCost: 0,
      modelCounts: {} as Record<string, number>,
      modelCosts: {} as Record<string, number>,
    };
  }

  const totalTokens = transcripts.reduce((sum, t) => sum + t.tokenCount, 0);
  const totalTurns = transcripts.reduce((sum, t) => sum + t.turnCount, 0);
  const totalDuration = transcripts.reduce((sum, t) => sum + t.durationMs, 0);
  const totalCost = transcripts.reduce((sum, t) => sum + (t.estimatedCost ?? 0), 0);

  const modelCounts: Record<string, number> = {};
  const modelCosts: Record<string, number> = {};
  for (const t of transcripts) {
    modelCounts[t.modelId] = (modelCounts[t.modelId] ?? 0) + 1;
    modelCosts[t.modelId] = (modelCosts[t.modelId] ?? 0) + (t.estimatedCost ?? 0);
  }

  return {
    totalTokens,
    avgTokens: Math.round(totalTokens / transcripts.length),
    avgTurns: Math.round((totalTurns / transcripts.length) * 10) / 10,
    avgDuration: Math.round(totalDuration / transcripts.length),
    totalCost,
    modelCounts,
    modelCosts,
  };
}

export function RunResults({ run, onExport, isExporting = false }: RunResultsProps) {
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');

  const transcripts = run.transcripts ?? [];
  const stats = calculateStats(transcripts);

  const handleTranscriptSelect = (transcript: Transcript) => {
    setSelectedTranscript(transcript);
  };

  const handleCloseViewer = () => {
    setSelectedTranscript(null);
  };

  if (transcripts.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No results available yet</p>
        {run.status !== 'COMPLETED' && (
          <p className="text-sm text-gray-400 mt-1">
            Results will appear as the run progresses
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-medium text-gray-900">
            {transcripts.length}
          </div>
          <div className="text-sm text-gray-500">Transcripts</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-medium text-gray-900">
            {stats.totalTokens.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Total Tokens</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-medium text-gray-900">
            {stats.avgTurns}
          </div>
          <div className="text-sm text-gray-500">Avg Turns</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-medium text-gray-900">
            {Math.round(stats.avgDuration / 1000)}s
          </div>
          <div className="text-sm text-gray-500">Avg Duration</div>
        </div>
        {stats.totalCost > 0 && (
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-2xl font-medium text-green-700">
              {formatCost(stats.totalCost)}
            </div>
            <div className="text-sm text-green-600">Est. Cost</div>
          </div>
        )}
      </div>

      {/* Per-model breakdown */}
      {Object.keys(stats.modelCounts).length > 1 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <BarChart2 className="w-4 h-4" />
            Results by Model
          </h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.modelCounts).map(([modelId, count]) => {
              const modelCost = stats.modelCosts[modelId] ?? 0;
              return (
                <div
                  key={modelId}
                  className="bg-white px-3 py-2 rounded border border-gray-200"
                >
                  <span className="font-medium text-gray-900">{modelId}</span>
                  <span className="text-gray-500 ml-2">{count}</span>
                  {modelCost > 0 && (
                    <span className="text-green-600 ml-2 text-sm flex items-center gap-0.5 inline-flex">
                      <DollarSign className="w-3 h-3" />
                      {formatCost(modelCost).slice(1)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">View:</span>
          <button
            type="button"
            onClick={() => setViewMode('grouped')}
            className={`p-2 rounded ${
              viewMode === 'grouped'
                ? 'bg-teal-100 text-teal-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            title="Group by model"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`p-2 rounded ${
              viewMode === 'list'
                ? 'bg-teal-100 text-teal-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            title="Flat list"
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {onExport && (
          <Button
            variant="secondary"
            onClick={onExport}
            disabled={isExporting}
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        )}
      </div>

      {/* Transcript list */}
      <TranscriptList
        transcripts={transcripts}
        onSelect={handleTranscriptSelect}
        groupByModel={viewMode === 'grouped'}
      />

      {/* Transcript viewer modal */}
      {selectedTranscript && (
        <TranscriptViewer
          transcript={selectedTranscript}
          onClose={handleCloseViewer}
        />
      )}
    </div>
  );
}
