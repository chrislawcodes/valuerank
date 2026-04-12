import { useNavigate } from 'react-router-dom';
import { useDomains } from '../../hooks/useDomains';

const LAST_DOMAIN_KEY = 'valuerank:lastSelectedDomainId';

type DomainSwitcherProps = {
  currentDomainId: string;
  /** Path prefix before the domain ID, e.g. "/domains/status" */
  basePath: string;
};

export function DomainSwitcher({ currentDomainId, basePath }: DomainSwitcherProps) {
  const { domains } = useDomains();
  const navigate = useNavigate();

  if (domains.length <= 1) {
    const name = domains.find((d) => d.id === currentDomainId)?.name ?? currentDomainId;
    return <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">{name}</h1>;
  }

  return (
    <select
      value={currentDomainId}
      onChange={(e) => {
        const newId = e.target.value;
        localStorage.setItem(LAST_DOMAIN_KEY, newId);
        navigate(`${basePath}/${newId}`);
      }}
      className="text-2xl font-serif font-medium text-[#1A1A1A] bg-transparent border-none cursor-pointer pr-8 appearance-none"
      style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23666\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0 center' }}
    >
      {domains.map((d) => (
        <option key={d.id} value={d.id}>{d.name}</option>
      ))}
    </select>
  );
}
