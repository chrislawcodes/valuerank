/**
 * Compare Page
 *
 * Cross-run comparison for analyzing differences between runs.
 * URL state: /compare?runs=id1,id2&viz=overview&model=...&display=overlay
 */

export function Compare() {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Compare Runs</h1>
          <p className="text-gray-400 mt-1">
            Select runs to compare analysis results across different configurations
          </p>
        </div>

        {/* Placeholder for run selection and visualization */}
        <div className="bg-[#1E1E1E] rounded-lg border border-gray-800 p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-teal-500/10 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-teal-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              Cross-Run Comparison
            </h3>
            <p className="text-gray-400 max-w-md">
              Compare analysis results across multiple runs to identify patterns,
              detect model drift, and analyze the effects of definition changes.
            </p>
            <p className="text-gray-500 text-sm mt-4">
              Run selection and visualization coming soon...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
