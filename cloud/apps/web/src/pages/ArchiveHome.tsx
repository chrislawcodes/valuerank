import { Link } from 'react-router-dom';
import { Archive, ClipboardList, BarChart3 } from 'lucide-react';
import { Card } from '../components/ui/Card';

const cards = [
  {
    title: 'Legacy Survey Work',
    description: 'Maintain historical or secondary survey programs while keeping new active research in the domain-first workflow.',
    to: '/archive/surveys',
    icon: ClipboardList,
  },
  {
    title: 'Legacy Survey Results',
    description: 'Review historical survey runs and outputs without mixing them into the active domain workflow.',
    to: '/archive/survey-results',
    icon: BarChart3,
  },
];

export function ArchiveHome() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          <Archive className="h-4 w-4" />
          Archive
        </div>
        <div>
          <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Archive</h1>
          <p className="mt-2 max-w-3xl text-gray-600">
            Archive holds historical, legacy, or secondary research surfaces during the migration. These pages stay available,
            but they are not the primary home for active domain-first work.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-medium text-[#1A1A1A]">Current archive shape</h2>
        <p className="mt-2 text-sm text-gray-600">
          Legacy survey surfaces now live under Archive-first routes while the main product shifts toward domains,
          evaluations, findings, and validation.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.to} to={card.to} className="block">
              <Card variant="interactive" padding="spacious" className="h-full">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-[#1A1A1A]">{card.title}</h2>
                    <p className="mt-2 text-sm text-gray-600">{card.description}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
