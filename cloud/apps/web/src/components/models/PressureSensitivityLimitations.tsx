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
          <strong className="font-medium text-gray-900">The 1-to-5 scale is consistent inside each pair, but the <em>story</em> differs across pairs.</strong>{' '}
          Within one value pair, level 4 always means the same thing as level 4 in another vignette of that same pair: one step bigger than level 3, one step smaller than level 5. That&apos;s solid.
          {' '}Across different pairs, the level number is the same but the surrounding situation isn&apos;t. We test &quot;Power vs Tradition&quot; inside a job-choice story (someone picking a career). We test &quot;Power vs Universalism&quot; inside a national-priorities story (a government picking a policy). Both vignettes use the same five labels. But level-4 pressure on a career choice is asking the model about a different kind of situation than level-4 pressure on national policy. Same number, different test.
          {' '}So if Model A has a pressure response of +0.8 on a job-choice pair and Model B has +0.6 on a national-priorities pair, you can&apos;t say A is &quot;more pressure-sensitive&quot; than B without that asterisk. Compare rankings inside a domain; treat cross-domain comparisons as a hint, not a measurement.
        </li>
        <li>
          <strong className="font-medium text-gray-900">Pressure response is what this report measures, full stop.</strong>{' '}
          A model that moves under pressure is moving — whether that&apos;s moral reasoning, sycophancy, instruction-following, or something else, we don&apos;t try to tell you. We just show the movement. Don&apos;t read pressure sensitivity as virtue: a strong response isn&apos;t automatically better than a weak one, or vice versa.
        </li>
        <li>
          <strong className="font-medium text-gray-900">We only show numbers we trust, and we count what we drop.</strong>{' '}
          Each cell of the grid needs at least 3 trials before we report a number — thin cells show as &quot;—&quot; or grey. A pair also needs at least one qualifying cell in each direction pool before we compute a pressure response; otherwise the response is &quot;—&quot; too. Separately, vignettes that fail validation (missing tokens, scores outside 1–5, etc.) get dropped and counted in the footer. If that count is high, the rest of the report is reading thin data.
        </li>
        <li>
          <strong className="font-medium text-gray-900">Each Pressure response is a 1D summary of a 2D pattern.</strong>{' '}
          Pressure response collapses the 5×5 grid (own × opponent pressure) into one number. That hides interesting patterns — like a model that moves more when opponent pressure is high. The 2D heat map below the table is where you can see the full picture.
        </li>
        <li>
          <strong className="font-medium text-gray-900">How we average things shapes the rankings.</strong>{' '}
          The summary row uses a plain mean across a model&apos;s pairs — it does not weight by trial count. A model with 3 elastic pairs can rank above a model with 12 modest pairs. The pair count next to each row tells you how thin the data is.
        </li>
      </ul>
    </section>
  );
}
