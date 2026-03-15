import {
  CANONICAL_GLOSSARY_MAPPING_TABLE,
  CANONICAL_GLOSSARY_OVERVIEW,
  CANONICAL_GLOSSARY_PURPOSE,
  CANONICAL_GLOSSARY_RELATED_DOCS,
  CANONICAL_GLOSSARY_SECTIONS,
  CANONICAL_GLOSSARY_USAGE,
} from '@valuerank/shared';

export function Glossary() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-[#1A1A1A]/10 bg-[#1A1A1A] text-[#FDFBF7] shadow-[0_24px_80px_-40px_rgba(15,23,42,0.55)]">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.26),_transparent_50%),linear-gradient(135deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0))] px-8 py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-200/80">Shared Language</p>
          <h1 className="mt-3 text-4xl font-serif font-medium tracking-tight text-white">Canonical Glossary</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/80">{CANONICAL_GLOSSARY_OVERVIEW}</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/70">{CANONICAL_GLOSSARY_PURPOSE}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="rounded-[24px] border border-[#1A1A1A]/10 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">How to use it</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-[#3B3B3B]">
            {CANONICAL_GLOSSARY_USAGE.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-2 h-2 w-2 rounded-full bg-teal-500" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[24px] border border-[#1A1A1A]/10 bg-[#F6F1E8] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">Legacy mapping</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-[#1A1A1A]/10 bg-white">
            <table className="min-w-full divide-y divide-[#1A1A1A]/10 text-left text-sm">
              <thead className="bg-[#F8F5EF] text-[#5C5C5C]">
                <tr>
                  <th className="px-4 py-3 font-medium">Legacy</th>
                  <th className="px-4 py-3 font-medium">Canonical</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]/10 text-[#1A1A1A]">
                {CANONICAL_GLOSSARY_MAPPING_TABLE.map((mapping) => (
                  <tr key={mapping.legacyTerm}>
                    <td className="px-4 py-3 align-top">
                      <code className="rounded bg-[#F4F1EB] px-2 py-1 text-xs">{mapping.legacyTerm}</code>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <code className="rounded bg-[#E9F7F4] px-2 py-1 text-xs text-teal-900">{mapping.canonicalTerm}</code>
                      <p className="mt-2 text-xs text-[#5C5C5C]">{mapping.notes}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {CANONICAL_GLOSSARY_SECTIONS.map((section) => (
        <section key={section.id} className="space-y-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">{section.title}</p>
            <h2 className="text-2xl font-serif font-medium text-[#1A1A1A]">{section.title}</h2>
            <p className="max-w-3xl text-sm leading-7 text-[#5C5C5C]">{section.description}</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {section.terms.map((term) => (
              <article
                key={term.name}
                className="rounded-[24px] border border-[#1A1A1A]/10 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-[#1A1A1A]">
                    <code className="rounded bg-[#F4F1EB] px-2 py-1 text-sm font-medium">{term.name}</code>
                  </h3>
                  {term.preferredTerm && (
                    <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-800">
                      Prefer {term.preferredTerm}
                    </span>
                  )}
                </div>

                <p className="mt-4 text-sm leading-7 text-[#2F2F2F]">{term.summary}</p>

                <div className="mt-4 rounded-2xl bg-[#F8F5EF] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A6A55]">Example</p>
                  <p className="mt-2 text-sm leading-7 text-[#3B3B3B]">{term.example}</p>
                </div>

                {term.clarifications && term.clarifications.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A6A55]">Avoid confusion</p>
                    <ul className="mt-3 space-y-2 text-sm leading-7 text-[#3B3B3B]">
                      {term.clarifications.map((clarification) => (
                        <li key={clarification} className="flex gap-3">
                          <span className="mt-2 h-2 w-2 rounded-full bg-[#1A1A1A]" aria-hidden="true" />
                          <span>{clarification}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {term.preferredReplacement && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">Preferred replacement</p>
                    <p className="mt-2 text-sm leading-7 text-amber-950">{term.preferredReplacement}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-[24px] border border-[#1A1A1A]/10 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-serif font-medium text-[#1A1A1A]">Relationship to other docs</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {CANONICAL_GLOSSARY_RELATED_DOCS.map((doc) => (
            <article key={doc.title} className="rounded-2xl border border-[#1A1A1A]/10 bg-[#FCFAF6] p-5">
              <p className="text-sm font-semibold text-[#1A1A1A]">{doc.title}</p>
              <p className="mt-2 text-sm leading-7 text-[#5C5C5C]">{doc.summary}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
