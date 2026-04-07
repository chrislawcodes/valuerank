import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDomains } from '../hooks/useDomains';

/**
 * Redirects /status to the first domain's trial dashboard.
 * Top-level entry point so users always have one place to check run status.
 */
export function StatusRedirect() {
  const { domains, queryLoading } = useDomains();
  const navigate = useNavigate();

  useEffect(() => {
    if (queryLoading) return;
    const domain = domains[0];
    if (domain != null) {
      navigate(`/domains/${domain.id}/run-trials`, { replace: true });
    }
  }, [domains, queryLoading, navigate]);

  if (queryLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-white/50">
        Loading...
      </div>
    );
  }

  if (domains.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-white/50">
        No domains configured. Create a domain first.
      </div>
    );
  }

  return null;
}
