import { computeDots, type DotState } from './stabilityDots';

type StabilityDotsProps = {
  score: number | null | undefined;
  className?: string;
  title?: string;
};

function Dot({ state }: { state: DotState }) {
  if (state === 'full') {
    return <span data-state="full" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current" />;
  }

  if (state === 'half') {
    return (
      <span data-state="half" className="relative inline-block h-1.5 w-1.5 shrink-0 overflow-hidden rounded-full border border-current">
        <span className="absolute inset-y-0 left-0 w-1/2 bg-current" />
      </span>
    );
  }

  if (state === 'muted') {
    return <span data-state="muted" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-current opacity-30" />;
  }

  return <span data-state="empty" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-current" />;
}

export function StabilityDots({ score, className, title }: StabilityDotsProps) {
  const states = computeDots(score);

  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ''}`} aria-hidden="true" title={title}>
      {states.map((state, index) => (
        <Dot key={`${state}-${index}`} state={state} />
      ))}
    </span>
  );
}
