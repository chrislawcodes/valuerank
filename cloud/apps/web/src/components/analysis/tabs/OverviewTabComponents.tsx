/**
 * Small reusable UI components for the Overview Tab.
 */

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Tooltip } from '../../ui/Tooltip';
import {
  ANALYSIS_BASE_PATH,
  type AnalysisBasePath,
  buildAnalysisTranscriptsPath,
} from '../../../utils/analysisRouting';
import { formatPercent } from './OverviewTabHelpers';
import type { RepeatPattern, RepeatPatternMetrics } from './OverviewTabTypes';

export function InfoTooltipTrigger({
  label,
  title,
}: {
  label: string;
  title: string;
}) {
  return (
    <Tooltip
      content={<div className="max-w-xs whitespace-normal text-xs leading-5">{title}</div>}
      position="top"
      variant="light"
      className="max-w-xs whitespace-normal"
    >
      {/* eslint-disable-next-line react/forbid-elements -- Lightweight tooltip trigger requires custom icon-only control */}
      <button
        type="button"
        className="inline-flex cursor-help text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-sm"
        aria-label={`${label}: ${title}`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

export function SummaryHeader({
  label,
  title,
  align = 'left',
}: {
  label: string;
  title: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
      <span>{label}</span>
      <InfoTooltipTrigger label={label} title={title} />
    </div>
  );
}

export function ModeAvailabilitySection({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-700">{title}</h4>
      <p className="text-sm text-gray-600">{message}</p>
    </section>
  );
}

export function SummaryCell({
  children,
  title,
  showInfoIcon = false,
  align = 'left',
}: {
  children: ReactNode;
  title?: string;
  showInfoIcon?: boolean;
  align?: 'left' | 'center';
}) {
  return (
    <div className={`flex items-center gap-1 truncate ${align === 'center' ? 'justify-center' : ''}`}>
      <div className="truncate" aria-label={title}>
        {children}
      </div>
      {showInfoIcon && title ? <InfoTooltipTrigger label="Cell details" title={title} /> : null}
    </div>
  );
}

export function PatternMetricButton({
  runId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  analysisSearchParams,
  modelId,
  pattern,
  metrics,
  title,
  rowDim,
  colDim,
}: {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  analysisSearchParams?: URLSearchParams | string;
  modelId: string;
  pattern: RepeatPattern;
  metrics: Extract<RepeatPatternMetrics, { status: 'available' }>;
  title: string;
  rowDim: string;
  colDim: string;
}) {
  const navigate = useNavigate();
  const count = metrics.counts[pattern];
  const value = metrics.classifiedCount === 0 ? 0 : count / metrics.classifiedCount;

  if (count === 0) {
    return <SummaryCell title={title} align="center">{formatPercent(value)}</SummaryCell>;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-auto min-h-0 px-0 py-0 text-sm font-medium text-gray-700 hover:bg-transparent hover:text-teal-700"
      title={title}
      aria-label={title}
      onClick={() => {
        const params = new URLSearchParams({
          modelId,
          repeatPattern: pattern,
          rowDim,
          colDim,
          conditionIds: metrics.conditionIds[pattern].join(','),
        });
        navigate(buildAnalysisTranscriptsPath(analysisBasePath, runId, params, analysisSearchParams));
      }}
    >
      {formatPercent(value)}
    </Button>
  );
}

export function PairedPatternMetricButton({
  runId,
  companionRunId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  analysisSearchParams,
  modelId,
  pattern,
  primaryMetrics,
  companionMetrics,
  title,
  rowDim,
  colDim,
}: {
  runId: string;
  companionRunId: string;
  analysisBasePath?: AnalysisBasePath;
  analysisSearchParams?: URLSearchParams | string;
  modelId: string;
  pattern: RepeatPattern;
  primaryMetrics: Extract<RepeatPatternMetrics, { status: 'available' }>;
  companionMetrics: Extract<RepeatPatternMetrics, { status: 'available' }>;
  title: string;
  rowDim: string;
  colDim: string;
}) {
  const navigate = useNavigate();
  const primaryCount = primaryMetrics.counts[pattern];
  const companionCount = companionMetrics.counts[pattern];
  const totalClassified = primaryMetrics.classifiedCount + companionMetrics.classifiedCount;
  const totalCount = primaryCount + companionCount;
  const value = totalClassified === 0 ? 0 : totalCount / totalClassified;

  if (totalCount === 0) {
    return <SummaryCell title={title} align="center">{formatPercent(value)}</SummaryCell>;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-auto min-h-0 px-0 py-0 text-sm font-medium text-gray-700 hover:bg-transparent hover:text-teal-700"
      title={title}
      aria-label={title}
      onClick={() => {
        const params = new URLSearchParams({
          modelId,
          repeatPattern: pattern,
          rowDim,
          colDim,
          companionRunId,
          primaryConditionIds: primaryMetrics.conditionIds[pattern].join(','),
          companionConditionIds: companionMetrics.conditionIds[pattern].join(','),
        });
        navigate(buildAnalysisTranscriptsPath(analysisBasePath, runId, params, analysisSearchParams));
      }}
    >
      {formatPercent(value)}
    </Button>
  );
}
