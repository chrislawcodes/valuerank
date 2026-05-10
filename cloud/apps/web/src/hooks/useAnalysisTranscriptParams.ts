/**
 * useAnalysisTranscriptParams
 *
 * Reads and normalizes all URL search params for the AnalysisTranscripts page.
 */

import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseConditionIds, parsePairedConditionSource } from '../utils/analysisTranscriptParams';

export function useAnalysisTranscriptParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rowDim = searchParams.get('rowDim') ?? '';
  const colDim = searchParams.get('colDim') ?? '';
  const row = searchParams.get('row') ?? '';
  const col = searchParams.get('col') ?? '';
  const selectedModel = searchParams.get('modelId') ?? searchParams.get('model') ?? '';
  const favoredValueKey = searchParams.get('favoredValueKey') ?? '';
  const decisionStrength = searchParams.get('decisionStrength') ?? '';
  const normalizedFavoredValueKey = favoredValueKey === '' ? undefined : favoredValueKey;
  const normalizedDecisionStrength: 'strong' | 'lean' | 'neutral' | 'unknown' | undefined = decisionStrength === 'strong'
    || decisionStrength === 'lean'
    || decisionStrength === 'neutral'
    || decisionStrength === 'unknown'
    ? decisionStrength
    : undefined;
  const decisionBucket = searchParams.get('decisionBucket') ?? '';
  const repeatPattern = searchParams.get('repeatPattern') ?? '';
  const selectedTranscriptId = searchParams.get('transcriptId') ?? '';
  const companionRunId = searchParams.get('companionRunId') ?? '';
  const pairedValueKey = searchParams.get('pairedValueKey') ?? '';
  const pairedDecisionBucketParam = searchParams.get('pairedDecisionBucket') ?? '';
  const pairedValueLabel = searchParams.get('pairedValueLabel') ?? '';
  const pairView = searchParams.get('pairView') ?? '';
  const orientationBucketParam = searchParams.get('orientationBucket');
  const hasLegacyOrientationBucket = orientationBucketParam === 'canonical' || orientationBucketParam === 'flipped';
  const pairedConditionSource = parsePairedConditionSource(searchParams.get('sourceRun'));
  const analysisMode: 'paired' | 'single' | null = searchParams.get('mode') === 'paired'
    ? 'paired'
    : searchParams.get('mode') === 'single'
      ? 'single'
      : null;

  const conditionIds = useMemo(
    () => parseConditionIds(searchParams.get('conditionIds') ?? ''),
    [searchParams]
  );
  const primaryConditionIds = useMemo(
    () => parseConditionIds(searchParams.get('primaryConditionIds') ?? ''),
    [searchParams]
  );
  const companionConditionIds = useMemo(
    () => parseConditionIds(searchParams.get('companionConditionIds') ?? ''),
    [searchParams]
  );
  const isPairedStabilityDrilldown = Boolean(
    repeatPattern && searchParams.has('primaryConditionIds')
  );

  return {
    searchParams,
    setSearchParams,
    rowDim,
    colDim,
    row,
    col,
    selectedModel,
    normalizedFavoredValueKey,
    normalizedDecisionStrength,
    decisionBucket,
    repeatPattern,
    selectedTranscriptId,
    companionRunId,
    pairedValueKey,
    pairedDecisionBucketParam,
    pairedValueLabel,
    pairView,
    hasLegacyOrientationBucket,
    pairedConditionSource,
    analysisMode,
    conditionIds,
    primaryConditionIds,
    companionConditionIds,
    isPairedStabilityDrilldown,
  };
}
