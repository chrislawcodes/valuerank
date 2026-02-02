import React, { useState } from 'react';
import { useQuery } from '@apollo/client';
import { gql } from '../../__generated__';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { RunStatus } from '../../types';
import { format } from 'date-fns';

const GET_COMPATIBLE_RUNS = gql(`
  query GetCompatibleRuns($definitionId: ID!, $preambleVersionId: String) {
    runs(definitionId: $definitionId, limit: 50) {
      id
      status
      createdAt
      sampleSize
      models {
        id
        modelId
        provider
      }
      definitionSnapshot {
        preambleVersionId
      }
    }
  }
`);

interface RunSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAggregate: (runIds: string[]) => void;
    definitionId: string;
    preambleVersionId?: string | null;
    currentRunId?: string; // To exclude or highlight the currently viewed run
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

    const { data, loading, error } = useQuery(GET_COMPATIBLE_RUNS, {
        variables: { definitionId, preambleVersionId },
        skip: !isOpen,
    });

    // Filter runs client-side for strict preamble match if not handled by API
    // (API supports filtering by definitionId, but preamble check ensures strict compatibility)
    const compatibleRuns = data?.runs.filter(run => {
        // Must be completed
        if (run.status !== 'COMPLETED') return false;

        // Must match preamble (if specified)
        // Note: definitionSnapshot layout might vary, using safe access
        const runPreamble = (run.definitionSnapshot as any)?.preambleVersionId;

        // If we are looking for a specific preamble, enforce match
        if (preambleVersionId && runPreamble !== preambleVersionId) return false;

        // If we are looking for NO preamble (standard), ensure run has none
        if (!preambleVersionId && runPreamble) return false;

        return true;
    }) || [];

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

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Aggregate Analysis</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4">
                    <p className="text-sm text-gray-400 mb-4">
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
                                    className={`grid grid-cols-12 gap-4 items-center p-4 rounded-lg border transition-colors ${selectedRunIds.has(run.id)
                                            ? 'border-indigo-500/50 bg-indigo-500/10'
                                            : 'border-slate-800 hover:border-slate-700'
                                        }`}
                                    onClick={() => handleToggle(run.id)}
                                >
                                    <div className="col-span-1 flex justify-center">
                                        <Checkbox
                                            checked={selectedRunIds.has(run.id)}
                                        // onClick handled by parent div
                                        />
                                    </div>
                                    <div className="col-span-4 text-sm">
                                        {format(new Date(run.createdAt), 'MMM d, yyyy HH:mm')}
                                        {run.id === currentRunId && <span className="ml-2 text-xs bg-slate-700 px-1.5 py-0.5 rounded">Current</span>}
                                    </div>
                                    <div className="col-span-2 text-sm text-gray-300">
                                        {run.sampleSize}
                                    </div>
                                    <div className="col-span-5 flex flex-wrap gap-1">
                                        {run.models.map(m => (
                                            <span key={m.id} className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-gray-400 border border-slate-700">
                                                {m.modelId}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t border-slate-800 pt-4 mt-auto">
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
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
