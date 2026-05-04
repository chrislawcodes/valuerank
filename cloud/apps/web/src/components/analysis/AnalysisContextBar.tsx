import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

type AnalysisContextBarProps = {
  title: string;
  summary: string;
  children: ReactNode;
  secondary?: ReactNode;
  headerActions?: ReactNode;
  className?: string;
};

export const AnalysisContextBar = forwardRef<HTMLElement, AnalysisContextBarProps>(function AnalysisContextBar(
  {
    title,
    summary,
    children,
    secondary,
    headerActions,
    className,
  },
  ref,
) {
  const isMobile = useIsMobile();

  return (
    <section ref={ref} className={cn('rounded-xl border border-gray-200 bg-white p-4 md:p-5', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">{title}</h2>
          <p className="text-sm text-gray-600">{summary}</p>
        </div>
        {headerActions != null && (
          <div className="shrink-0">{headerActions}</div>
        )}
      </div>

      {isMobile ? (
        <div className="mt-4">
          <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-800">Adjust controls</span>
              <span className="text-xs text-gray-500">Show</span>
            </summary>
            <div className="mt-3 space-y-4">
              {children}
              {secondary != null && secondary}
            </div>
          </details>
        </div>
      ) : (
        <>
          <div className="mt-4">
            {children}
          </div>
          {secondary != null && (
            <div className="mt-4">
              {secondary}
            </div>
          )}
        </>
      )}
    </section>
  );
});

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(max-width: 767px)').matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleChange = () => setIsMobile(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}
