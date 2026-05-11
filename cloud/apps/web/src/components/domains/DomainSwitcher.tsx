import { Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDomains } from '../../hooks/useDomains';

const LAST_DOMAIN_KEY = 'valuerank:lastSelectedDomainId';

type DomainSwitcherProps = {
  /** null means "all domains" is the active selection */
  currentDomainId: string | null;
  /** Path prefix before the domain ID, e.g. "/domains/status" */
  basePath: string;
};

export function DomainSwitcher({ currentDomainId, basePath }: DomainSwitcherProps) {
  const { domains } = useDomains();
  const navigate = useNavigate();

  if (domains.length <= 1) {
    const name = domains[0]?.name ?? currentDomainId ?? '';
    return <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">{name}</h1>;
  }

  const handleSelect = (domainId: string | null) => {
    if (domainId !== null) {
      localStorage.setItem(LAST_DOMAIN_KEY, domainId);
      navigate(`${basePath}/${domainId}`);
    } else {
      navigate(basePath);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="divide-y divide-gray-100">
        {/* eslint-disable-next-line react/forbid-elements -- Navigation item requires custom full-width layout */}
        <button
          type="button"
          onClick={() => handleSelect(null)}
          className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
            currentDomainId == null
              ? 'bg-teal-100 text-teal-900'
              : 'bg-white hover:bg-gray-100 text-gray-900'
          }`}
        >
          <span className="font-medium text-sm">All Domains</span>
          {currentDomainId == null && <Check className="w-4 h-4 text-teal-600 ml-4" />}
        </button>
        {domains.map((domain) => {
          const isSelected = currentDomainId === domain.id;
          return (
            // eslint-disable-next-line react/forbid-elements -- Navigation item requires custom full-width layout
            <button
              key={domain.id}
              type="button"
              onClick={() => handleSelect(domain.id)}
              className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
                isSelected
                  ? 'bg-teal-100 text-teal-900'
                  : 'bg-white hover:bg-gray-100 text-gray-900'
              }`}
            >
              <span className="font-medium text-sm">{domain.name}</span>
              {isSelected && <Check className="w-4 h-4 text-teal-600 ml-4" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
