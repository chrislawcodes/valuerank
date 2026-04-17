import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportRunAdjudicationCSV, exportRunAsCSV, exportTranscriptsAsJSON } from '../../api/export';
import { useRunMutations } from '../../hooks/useRunMutations';
import type { Run } from '../../api/operations/runs';

export function useRunDetailHandlers(run: Run | null, refetch: () => void) {
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingAdjudication, setIsExportingAdjudication] = useState(false);
  const [isExportingTranscripts, setIsExportingTranscripts] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    pauseRun,
    resumeRun,
    cancelRun,
    deleteRun,
    updateRun,
    cancelSummarization,
    restartSummarization,
    updateTranscriptDecision,
  } = useRunMutations();

  const handleSaveName = useCallback(
    async (name: string | null) => {
      if (!run) return;
      await updateRun(run.id, { name });
      refetch();
    },
    [run, updateRun, refetch]
  );

  const handleExport = useCallback(async () => {
    if (!run) return;
    setIsExporting(true);
    setExportError(null);
    try {
      await exportRunAsCSV(run.id);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [run]);

  const handleExportTranscripts = useCallback(async () => {
    if (!run) return;
    setIsExportingTranscripts(true);
    setExportError(null);
    try {
      await exportTranscriptsAsJSON(run.id);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExportingTranscripts(false);
    }
  }, [run]);

  const handleExportAdjudication = useCallback(async () => {
    if (!run) return;
    setIsExportingAdjudication(true);
    setExportError(null);
    try {
      await exportRunAdjudicationCSV(run.id);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExportingAdjudication(false);
    }
  }, [run]);

  const handlePause = useCallback(
    async (runId: string) => { await pauseRun(runId); refetch(); },
    [pauseRun, refetch]
  );

  const handleResume = useCallback(
    async (runId: string) => { await resumeRun(runId); refetch(); },
    [resumeRun, refetch]
  );

  const handleCancel = useCallback(
    async (runId: string) => { await cancelRun(runId); refetch(); },
    [cancelRun, refetch]
  );

  const handleRerunSuccess = useCallback(
    (newRunId: string) => { navigate(`/runs/${newRunId}`); },
    [navigate]
  );

  const handleDelete = useCallback(async () => {
    if (!run) return;
    setIsDeleting(true);
    try {
      await deleteRun(run.id);
      navigate('/runs');
    } catch {
      setIsDeleting(false);
    }
  }, [run, deleteRun, navigate]);

  const handleCancelSummarization = useCallback(
    async (runId: string) => {
      const result = await cancelSummarization(runId);
      refetch();
      return { cancelledCount: result.cancelledCount };
    },
    [cancelSummarization, refetch]
  );

  const handleRestartSummarization = useCallback(
    async (runId: string, force?: boolean) => {
      const result = await restartSummarization(runId, force);
      refetch();
      return { queuedCount: result.queuedCount };
    },
    [restartSummarization, refetch]
  );

  const handleUpdateTranscriptDecision = useCallback(
    async (transcriptId: string, decisionCode: string) => {
      await updateTranscriptDecision(transcriptId, decisionCode);
      refetch();
    },
    [updateTranscriptDecision, refetch]
  );

  return {
    isExporting,
    isExportingAdjudication,
    isExportingTranscripts,
    exportError,
    isDeleting,
    handleSaveName,
    handleExport,
    handleExportTranscripts,
    handleExportAdjudication,
    handlePause,
    handleResume,
    handleCancel,
    handleRerunSuccess,
    handleDelete,
    handleCancelSummarization,
    handleRestartSummarization,
    handleUpdateTranscriptDecision,
  };
}
