/**
 * Static limitations panel for the Pressure Sensitivity report (spec FR-014).
 *
 * Plain-English caveats sit on the page itself, not in tooltips, so readers cannot miss them.
 */
export function PressureSensitivityLimitations() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <h3 className="text-base font-semibold text-gray-900">What this report can and can&apos;t tell you</h3>
      <ul className="mt-3 space-y-2 text-sm text-gray-700">
        <li>
          <strong className="font-medium text-gray-900">Pressure levels are not calibrated across vignettes.</strong>{' '}
          &quot;Pressure level 4&quot; in one vignette may not be the same intensity as &quot;level 4&quot; in another.
          Comparing sensitivity scores across different value pairs is suspect for that reason. Use the per-pair
          grid (above) to read individual stories rather than ranking pairs against each other.
        </li>
        <li>
          <strong className="font-medium text-gray-900">Conviction is the model&apos;s self-report, not a calibrated confidence scale.</strong>{' '}
          Sycophantic models can increase stated conviction without any change in their actual decision logic — this
          report would surface that as a bigger Conviction Δ even though the underlying reasoning didn&apos;t change.
        </li>
        <li>
          <strong className="font-medium text-gray-900">Sycophancy and instruction-following can mimic sensitivity.</strong>{' '}
          A model that mirrors prompt emphasis without reasoning about the values will look pressure-sensitive here.
          We don&apos;t try to detect that; the directional sanity check is the closest thing to a control.
        </li>
        <li>
          <strong className="font-medium text-gray-900">Cells with N &lt; 3 trials are excluded.</strong>{' '}
          A pair&apos;s Δ values need at least one cell in each pressure band (own ≤ 2 and own ≥ 4) at N ≥ 3 — otherwise
          they&apos;re reported as &quot;—&quot;. Coverage gaps are visible in the per-pair grid as dotted cells.
        </li>
        <li>
          <strong className="font-medium text-gray-900">Excluded vignettes are counted, not silenced.</strong>{' '}
          Definitions that fail validation (collisions, out-of-range scores, missing levels, self-pairs, etc.)
          appear in the coverage notes section so you can tell whether the report is reading thin data.
        </li>
        <li>
          <strong className="font-medium text-gray-900">Banding averages across opponent pressure.</strong>{' '}
          Direction / Conviction / netScore Δ collapse the 2D grid to a 1D summary by averaging within each band.
          Models that become more (or less) firm specifically when opponent pressure is high won&apos;t show that pattern
          in the Δ numbers — only in the per-pair 2D grid.
        </li>
        <li>
          <strong className="font-medium text-gray-900">Aggregate sensitivity is unweighted by coverage.</strong>{' '}
          A model measured on three highly elastic pairs can rank higher than a model measured on twelve
          modestly elastic pairs. The pair count in the cross-model summary is the right correction for this.
        </li>
      </ul>
    </section>
  );
}
