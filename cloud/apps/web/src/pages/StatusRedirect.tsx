import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDomains } from '../hooks/useDomains';

const LAST_DOMAIN_KEY = 'valuerank:lastSelectedDomainId';

/**
 * Redirects /status (or /domains/status) to the last-used domain's status page.
 * Falls back to the first domain if no last-used domain is stored.
 */
export function StatusRedirect() {
  const { domains, queryLoading } = useDomains();
  const navigate = useNavigate();

  useEffect(() => {
    if (queryLoading) return;
    const lastId = localStorage.getItem(LAST_DOMAIN_KEY);
    const lastDomain = lastId != null ? domains.find((d) => d.id === lastId) : null;
    const domain = lastDomain ?? domains[0];
    if (domain != null) {
      navigate(`/domains/status/${domain.id}`, { replace: true });
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
