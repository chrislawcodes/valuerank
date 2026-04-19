import { Link, useLocation } from 'react-router-dom';

type ModelsTabNavProps = {
  domainId: string | null;
  signature: string | null;
};

function buildPath(pathname: string, domainId: string | null, signature: string | null): string {
  const params = new URLSearchParams();
  if (domainId) params.set('domainId', domainId);
  if (signature) params.set('signature', signature);
  const query = params.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

export function ModelsTabNav({ domainId, signature }: ModelsTabNavProps) {
  const location = useLocation();
  const matrixActive = location.pathname === '/models';
  const consistencyActive = location.pathname === '/models/consistency';

  const matrixPath = buildPath('/models', domainId, signature);
  const consistencyPath = buildPath('/models/consistency', domainId, signature);

  const tabClass = (active: boolean) => (
    active
      ? 'border-teal-600 bg-teal-50 text-teal-800'
      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
  );

  return (
    <nav aria-label="Models tabs" className="flex flex-wrap gap-2">
      <Link to={matrixPath} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${tabClass(matrixActive)}`}>
        Matrix
      </Link>
      <Link
        to={consistencyPath}
        className={`rounded-full border px-3 py-1.5 text-sm font-medium ${tabClass(consistencyActive)}`}
      >
        Consistency
      </Link>
    </nav>
  );
}
