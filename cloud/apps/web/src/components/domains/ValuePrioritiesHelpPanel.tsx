export function ValuePrioritiesHelpPanel() {
  return (
    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-xs text-gray-700">
      <p className="font-medium text-gray-800">Score Method: Win Rate</p>
      <p className="mt-1">
        The percentage of pairwise comparisons in which the AI prioritized this value across all decisions,
        including neutral responses.
      </p>
      <p className="mt-2 font-medium text-gray-800">Formula</p>
      <p className="mt-0.5 font-mono text-[11px] text-sky-900">
        Win Rate = prioritized / (prioritized + deprioritized + neutral) × 100.0%
      </p>
      <ul className="mt-2 list-disc space-y-0.5 pl-4">
        <li>50.0% means the AI prioritized this value in half of all recorded decisions.</li>
        <li>Easy to interpret: higher % = model prioritizes this value more often.</li>
        <li>Shows &ldquo;n/a&rdquo; when no comparison data exists for a value.</li>
      </ul>
    </div>
  );
}
