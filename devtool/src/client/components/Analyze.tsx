import { useState, useEffect, useCallback } from 'react';
import { analysis, type AnalysisRun, type DeepAnalysisResult } from '../lib/api';
import { FolderOpen, BarChart3, TrendingUp, Grid3X3, RefreshCw, Upload, X, GitBranch, Microscope } from 'lucide-react';
import {
  type VisualizationType,
  type DataSource,
  type ExtendedAggregateData,
  parseCSVToAggregate,
  DecisionDistribution,
  ModelVariance,
  ScenarioHeatmap,
  DimensionAnalysis,
  DeepAnalysis,
} from './visualizations';

export function Analyze() {
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>('');
  const [data, setData] = useState<ExtendedAggregateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeViz, setActiveViz] = useState<VisualizationType>('decision-dist');

  // Drag and drop state
  const [dataSource, setDataSource] = useState<DataSource>('server');
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFileName, setDroppedFileName] = useState<string | null>(null);

  // Deep analysis state
  const [deepAnalysisData, setDeepAnalysisData] = useState<DeepAnalysisResult | null>(null);
  const [deepAnalysisLoading, setDeepAnalysisLoading] = useState(false);
  const [csvContentForDeepAnalysis, setCsvContentForDeepAnalysis] = useState<string | null>(null);

  // Load available runs
  useEffect(() => {
    loadRuns();
  }, []);

  // Load data when run is selected (only if using server source)
  useEffect(() => {
    if (selectedRun && dataSource === 'server') {
      loadData(selectedRun);
    }
  }, [selectedRun, dataSource]);

  const loadRuns = async () => {
    try {
      const result = await analysis.getRuns();
      setRuns(result.runs);
      if (result.runs.length > 0 && !selectedRun) {
        setSelectedRun(result.runs[0].name);
      }
    } catch (err) {
      setError('Failed to load runs: ' + String(err));
    }
  };

  const loadData = async (runPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await analysis.getAggregate(runPath);
      setData({ ...result, rawRows: result.rawRows ?? [] });
    } catch (err) {
      setError('Failed to load data: ' + String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith('.csv')) {
      setError('Please drop a CSV file');
      return;
    }

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const aggregatedData = parseCSVToAggregate(content);

        if (aggregatedData.models.length === 0) {
          setError('No valid data found in CSV. Ensure it has "AI Model Name" and "Decision Code" columns.');
          setData(null);
          setCsvContentForDeepAnalysis(null);
        } else {
          setData(aggregatedData);
          setDataSource('file');
          setDroppedFileName(file.name);
          // Store CSV content for deep analysis
          setCsvContentForDeepAnalysis(content);
          // Reset deep analysis when new file is loaded
          setDeepAnalysisData(null);
        }
      } catch (err) {
        setError('Failed to parse CSV: ' + String(err));
        setData(null);
        setCsvContentForDeepAnalysis(null);
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file');
      setLoading(false);
    };
    reader.readAsText(file);
  }, []);

  const clearDroppedFile = useCallback(() => {
    setDataSource('server');
    setDroppedFileName(null);
    setCsvContentForDeepAnalysis(null);
    setDeepAnalysisData(null);
    if (selectedRun) {
      loadData(selectedRun);
    } else {
      setData(null);
    }
  }, [selectedRun]);

  // Run deep analysis when switching to the Deep Analysis tab
  const runDeepAnalysis = useCallback(async () => {
    // Already loaded or currently loading
    if (deepAnalysisData || deepAnalysisLoading) return;

    setDeepAnalysisLoading(true);
    setError(null);

    try {
      let result: DeepAnalysisResult;

      if (dataSource === 'file' && csvContentForDeepAnalysis) {
        // Use uploaded CSV content
        result = await analysis.runDeepAnalysis(csvContentForDeepAnalysis);
      } else if (dataSource === 'server' && selectedRun) {
        // Use server run
        result = await analysis.runDeepAnalysisOnRun(selectedRun);
      } else {
        throw new Error('No data source available for deep analysis');
      }

      setDeepAnalysisData(result);
    } catch (err) {
      setError('Failed to run deep analysis: ' + String(err));
    } finally {
      setDeepAnalysisLoading(false);
    }
  }, [dataSource, csvContentForDeepAnalysis, selectedRun, deepAnalysisData, deepAnalysisLoading]);

  // Trigger deep analysis when switching to that tab
  useEffect(() => {
    if (activeViz === 'deep-analysis' && !deepAnalysisData && !deepAnalysisLoading) {
      runDeepAnalysis();
    }
  }, [activeViz, deepAnalysisData, deepAnalysisLoading, runDeepAnalysis]);

  const vizOptions: { id: VisualizationType; label: string; icon: React.ReactNode }[] = [
    { id: 'decision-dist', label: 'Decision Distribution', icon: <BarChart3 size={16} /> },
    { id: 'model-variance', label: 'Model Consistency', icon: <TrendingUp size={16} /> },
    { id: 'scenario-heatmap', label: 'Scenario Comparison', icon: <Grid3X3 size={16} /> },
    { id: 'dimension-analysis', label: 'Dimension Impact', icon: <GitBranch size={16} /> },
    { id: 'deep-analysis', label: 'Deep Analysis', icon: <Microscope size={16} /> },
  ];

  return (
    <div
      className="h-full flex flex-col bg-gray-50 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-blue-500/10 border-4 border-dashed border-blue-500 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-8 text-center">
            <Upload size={48} className="mx-auto mb-4 text-blue-500" />
            <p className="text-xl font-semibold text-gray-900">Drop CSV file here</p>
            <p className="text-sm text-gray-500 mt-2">Release to analyze the data</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">Analysis</h2>

            {/* Data Source Indicator */}
            {dataSource === 'file' && droppedFileName ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-md text-sm">
                <Upload size={14} />
                <span className="font-medium">{droppedFileName}</span>
                <button
                  onClick={clearDroppedFile}
                  className="ml-1 p-0.5 hover:bg-purple-200 rounded"
                  title="Clear and return to server runs"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              /* Run Selector */
              <div className="flex items-center gap-2">
                <FolderOpen size={16} className="text-gray-400" />
                <select
                  value={selectedRun}
                  onChange={(e) => setSelectedRun(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {runs.length === 0 && <option value="">No runs available</option>}
                  {runs.map((run) => (
                    <option key={run.name} value={run.name}>
                      {run.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => loadRuns()}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                  title="Refresh runs"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Data Summary */}
          {data && (
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>{data.models.length} models</span>
              <span>{data.scenarios.length} scenarios</span>
              <span>{data.totalRows.toLocaleString()} data points</span>
            </div>
          )}
        </div>

        {/* Visualization Type Tabs */}
        <div className="flex gap-1 mt-4">
          {vizOptions.map((viz) => (
            <button
              key={viz.id}
              onClick={() => setActiveViz(viz.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                activeViz === viz.id
                  ? 'bg-gray-100 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {viz.icon}
              {viz.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-4">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-gray-500">
              <RefreshCw size={20} className="animate-spin" />
              Loading data...
            </div>
          </div>
        )}

        {!loading && !data && !error && activeViz !== 'deep-analysis' && (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <div className="text-center">
              <Upload size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">Drop a CSV file here to analyze</p>
              <p className="text-sm">or select a run from the dropdown above</p>
            </div>
          </div>
        )}

        {!loading && data && activeViz !== 'deep-analysis' && (
          <>
            {activeViz === 'decision-dist' && <DecisionDistribution data={data} />}
            {activeViz === 'model-variance' && <ModelVariance data={data} />}
            {activeViz === 'scenario-heatmap' && <ScenarioHeatmap data={data} />}
            {activeViz === 'dimension-analysis' && <DimensionAnalysis data={data} />}
          </>
        )}

        {/* Deep Analysis Tab */}
        {activeViz === 'deep-analysis' && (
          <>
            {deepAnalysisLoading && (
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3 text-gray-500">
                  <RefreshCw size={24} className="animate-spin" />
                  <span>Running deep statistical analysis...</span>
                  <span className="text-sm text-gray-400">This may take a moment</span>
                </div>
              </div>
            )}

            {!deepAnalysisLoading && !deepAnalysisData && !error && (
              <div className="flex items-center justify-center h-64 text-gray-400">
                <div className="text-center">
                  <Microscope size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">Load data to run deep analysis</p>
                  <p className="text-sm">Drop a CSV file or select a run from the dropdown</p>
                </div>
              </div>
            )}

            {!deepAnalysisLoading && deepAnalysisData && (
              <DeepAnalysis data={deepAnalysisData} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
