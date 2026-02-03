import type React from 'react';
import { useState } from 'react';
import { useQuery, gql } from 'urql';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { format } from 'date-fns';

const GET_COMPATIBLE_RUNS = gql(`
  query GetCompatibleRuns($definitionId: String!) {
    runs(definitionId: $definitionId, limit: 50) {
      id
      status
      createdAt
      transcriptCount
      models {
        id
        modelId
      }
      definitionSnapshot
    }
  }
`);

interface CompatibleRun {
    id: string;
    status: string;
    createdAt: string;
    transcriptCount: number;
    models: {
        id: string;
        modelId: string;
    }[];
    definitionSnapshot: unknown;
}

interface GetCompatibleRunsQuery {
    runs: CompatibleRun[];
}

interface RunSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAggregate: (runIds: string[]) => void;
    definitionId: string;
    preambleVersionId?: string | null;
    currentRunId?: string; // To exclude or highlight the currently viewed run
}

interface SnapshotWithMeta {
    _meta?: {
        preambleVersionId?: string;
    };
    preambleVersionId?: string;
}

export const RunSelectionModal: React.FC<RunSelectionModalProps> = ({
    isOpen,
    onClose,
    onAggregate,
    definitionId,
    preambleVersionId,
    currentRunId
}) => {
    const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set(currentRunId ? [currentRunId] : []));

    const [{ data, fetching, error }] = useQuery<GetCompatibleRunsQuery>({
        query: GET_COMPATIBLE_RUNS,
        variables: { definitionId, preambleVersionId },
        pause: !isOpen,
    });

    // Alias fetching to loading for compatibility with rest of component logic below if needed
    const loading = fetching;

    // Filter runs client-side for strict preamble match if not handled by API
    // (API supports filtering by definitionId, but preamble check ensures strict compatibility)
    const compatibleRuns = (data?.runs || []).filter(run => {
        // Must be completed
        if (run.status !== 'COMPLETED') return false;

        // Must match preamble (if specified)
        // Note: definitionSnapshot layout might vary, using safe access
        const snapshot = run.definitionSnapshot as SnapshotWithMeta;
        const runPreamble = snapshot?._meta?.preambleVersionId ?? snapshot?.preambleVersionId;

        // If we are looking for a specific preamble, enforce match
        if (preambleVersionId && runPreamble !== preambleVersionId) return false;

        // If we are looking for NO preamble (standard), ensure run has none
        if (!preambleVersionId && runPreamble) return false;

        return true;
    });

    const handleToggle = (runId: string) => {
        const newSet = new Set(selectedRunIds);
        if (newSet.has(runId)) {
            newSet.delete(runId);
        } else {
            newSet.add(runId);
        }
        setSelectedRunIds(newSet);
    };

    const handleAggregate = () => {
        onAggregate(Array.from(selectedRunIds));
        onClose();
    };

    if (error) return <div>Error loading runs</div>;

    const footerContent = (
        <div className="flex justify-between items-center w-full">
            <div className="text-sm text-gray-400">
                {selectedRunIds.size} runs selected
            </div>
            <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button
                    onClick={handleAggregate}
                    disabled={selectedRunIds.size < 2}
                >
                    Aggregate {selectedRunIds.size} Runs
                </Button>
            </div>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Aggregate Analysis"
            size="2xl"
            footer={footerContent}
            className="flex flex-col max-h-[80vh]"
        >
            <div className="flex-1 overflow-y-auto py-2">
                <p className="text-sm text-gray-500 mb-4">
                    Select runs to combine. Aggregation increases statistical significance by merging sample sizes.
                    Only completed runs with matching unique definition and preamble version are shown.
                </p>

                {loading ? (
                    <div className="text-center py-8">Loading compatible runs...</div>
                ) : compatibleRuns.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No other compatible runs found.</div>
                ) : (
                    <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-4 px-4 py-2 font-medium text-xs text-gray-400 uppercase">
                            <div className="col-span-1"></div>
                            <div className="col-span-4">Date</div>
                            <div className="col-span-2">Samples</div>
                            <div className="col-span-5">Models</div>
                        </div>
                        {compatibleRuns.map(run => (
                            <div
                                key={run.id}
                                className={`grid grid-cols-12 gap-4 items-center p-4 rounded-lg border transition-colors cursor-pointer ${selectedRunIds.has(run.id)
                                    ? 'border-indigo-500/50 bg-indigo-500/10'
                                    : 'border-slate-800 hover:border-slate-700'
                                    }`}
                                onClick={() => handleToggle(run.id)}
                            >
                                <div className="col-span-1 flex justify-center">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-0"
                                        checked={selectedRunIds.has(run.id)}
                                        readOnly // handled by parent onClick
                                    />
                                </div>
                                <div className="col-span-4 text-sm">
                                    {format(new Date(run.createdAt), 'MMM d, yyyy HH:mm')}
                                    {run.id === currentRunId && <span className="ml-2 text-xs bg-slate-700 px-1.5 py-0.5 rounded text-white">Current</span>}
                                </div>
                                <div className="col-span-2 text-sm text-gray-600">
                                    {run.transcriptCount}
                                </div>
                                <div className="col-span-5 flex flex-wrap gap-1">
                                    {run.models.map(m => (
                                        <span key={m.id} className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-gray-600 border border-slate-200">
                                            {m.modelId}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
};
