export function DomainAssumptions() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Assumptions</h1>
        <p className="mt-1 text-sm text-gray-600">
          Validate whether value-prioritization results are stable enough to trust for interpretation.
        </p>
      </div>

      <section className="rounded-lg border border-dashed border-gray-300 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Confirmation Checks</h2>
        <p className="mt-2 text-sm text-gray-600">
          This page will hold three reliability checks:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>`#285` Temp=0 determinism</li>
          <li>`#286` Order invariance</li>
          <li>`#287` Job-title invariance</li>
        </ul>
        <p className="mt-4 text-sm text-gray-600">
          All three checks will use the same locked professional-domain vignette package. Users will review that predetermined set in preflight rather than choosing inputs here.
        </p>
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Preflight review, cost estimates, exact percentage summaries, and transcript drill-down will be added in the next implementation chunks.
        </div>
      </section>
    </div>
  );
}
