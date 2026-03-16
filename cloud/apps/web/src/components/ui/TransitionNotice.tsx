import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

type TransitionNoticeLink = {
  label: string;
  to: string;
};

type TransitionNoticeProps = {
  eyebrow: string;
  title: string;
  description: string;
  links?: TransitionNoticeLink[];
};

export function TransitionNotice({ eyebrow, title, description, links = [] }: TransitionNoticeProps) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-base font-semibold text-[#1A1A1A]">{title}</h2>
      <p className="mt-1 text-sm text-amber-900/80">{description}</p>
      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="inline-flex items-center gap-1 text-sm font-medium text-amber-900 hover:text-amber-950"
            >
              {link.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
