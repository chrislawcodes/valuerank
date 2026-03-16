import { Link } from 'react-router-dom';
import { Archive, FolderTree, GitCompare, Settings, ShieldCheck } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useDomains } from '../hooks/useDomains';

const quickLinks = [
  {
    title: 'Domains',
    description: 'Start with active domain work, setup assets, and ongoing research programs.',
    to: '/domains',
    icon: FolderTree,
  },
  {
    title: 'Validation',
    description: 'Review methodology checks and validation reporting without mixing them into findings.',
    to: '/validation',
    icon: ShieldCheck,
  },
  {
    title: 'Archive',
    description: 'Open historical survey work and secondary research surfaces.',
    to: '/archive',
    icon: Archive,
  },
  {
    title: 'Compare',
    description: 'Use the global benchmark and comparison tooling as a cross-cutting utility.',
    to: '/compare',
    icon: GitCompare,
  },
];

export function Dashboard() {
  const { domains } = useDomains();
  const activeDomain = domains[0] ?? null;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Home</p>
        <div>
          <h1 className="text-3xl font-serif font-medium text-[#1A1A1A]">Domain-first workspace</h1>
          <p className="mt-3 max-w-3xl text-gray-600">
            ValueRank is moving toward a domain-first workflow. During the migration, use Domains for active research,
            Validation for methodology checks, and Archive for legacy or historical survey work.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-medium text-[#1A1A1A]">Primary workflow</h2>
        <ol className="mt-3 grid gap-3 text-sm text-gray-600 md:grid-cols-2">
          <li>1. Start with a domain idea and organize the work under Domains.</li>
          <li>2. Build the instrument with preambles, contexts, value statements, and vignettes.</li>
          <li>3. Pilot small runs, inspect diagnostics, and tune wording before larger evaluations.</li>
          <li>4. Keep findings and validation separate so diagnostics do not masquerade as interpretation.</li>
        </ol>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.to} to={link.to} className="block">
              <Card variant="interactive" padding="spacious" className="h-full">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-teal-50 p-2 text-teal-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-[#1A1A1A]">{link.title}</h2>
                    <p className="mt-2 text-sm text-gray-600">{link.description}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {activeDomain && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-medium text-[#1A1A1A]">Resume active domain work</h2>
          <p className="mt-2 text-sm text-gray-600">
            Jump straight back into exact surfaces for <span className="font-medium">{activeDomain.name}</span>.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Link
              to={`/domains/${activeDomain.id}/run-trials?scopeCategory=PILOT`}
              className="rounded-lg border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Pilot next</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">Open domain evaluation launcher</div>
              <div className="mt-1 text-xs text-gray-600">Resume the pilot or production launch flow for this domain.</div>
            </Link>
            <Link
              to={`/domains/analysis?domainId=${activeDomain.id}`}
              className="rounded-lg border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Review evidence</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">Open findings for this domain</div>
              <div className="mt-1 text-xs text-gray-600">Go directly to the current findings or diagnostics state.</div>
            </Link>
            <Link
              to={`/domains?domainId=${activeDomain.id}&tab=setup&setupTab=contexts`}
              className="rounded-lg border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Tune setup</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">Review setup coverage</div>
              <div className="mt-1 text-xs text-gray-600">Jump back to defaults, contexts, and value-statement coverage.</div>
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-gray-300 bg-[#F8F5EF] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-[#1A1A1A]">Compatibility surfaces remain live</h2>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Some pages still use the older object-first structure while the new information architecture lands in
              slices. Use the new top-level labels to orient yourself, but expect a transitional mix of old and new
              pages for now.
            </p>
          </div>
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
