import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { type LucideIcon, Archive, BarChart2, FileText, FolderTree, GitCompare, Home, Menu, Settings, ShieldCheck, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

type NavItem = {
  name: string;
  path: string;
  icon: LucideIcon;
  isNested?: boolean;
  aliases?: string[];
};

const navItems: NavItem[] = [
  { name: 'Home', path: '/', icon: Home },
  { name: 'Domains', path: '/domains', icon: FolderTree },
  { name: 'Vignettes', path: '/definitions', icon: FileText, isNested: true },
  { name: 'Domain Contexts', path: '/domain-contexts', icon: FileText, isNested: true },
  { name: 'Value Statements', path: '/value-statements', icon: FileText, isNested: true },
  { name: 'Domain Analysis', path: '/domains/analysis', icon: BarChart2, isNested: true },
  { name: 'Coverage', path: '/domains/coverage', icon: BarChart2, isNested: true },
  { name: 'Validation', path: '/validation', icon: ShieldCheck },
  { name: 'Temp=0 Effect', path: '/assumptions/temp-zero-effect', icon: ShieldCheck, isNested: true },
  { name: 'Validation Analysis', path: '/assumptions/analysis', icon: ShieldCheck, isNested: true },
  { name: 'Validation (old v1)', path: '/assumptions/analysis-v1', icon: ShieldCheck, isNested: true },
  { name: 'Archive', path: '/archive', icon: Archive },
  { name: 'Legacy Survey Work', path: '/archive/surveys', icon: Archive, isNested: true, aliases: ['/survey'] },
  { name: 'Legacy Survey Results', path: '/archive/survey-results', icon: Archive, isNested: true, aliases: ['/survey-results'] },
  { name: 'Compare', path: '/compare', icon: GitCompare },
  { name: 'Settings', path: '/settings', icon: Settings },
];

type MobileNavProps = {
  className?: string;
};

export function MobileNav({ className }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const isNavActive = (item: NavItem) => {
    if (item.path === '/') {
      return location.pathname === '/';
    }

    const hasNestedChildren = !item.isNested
      && navItems.some((candidate) => candidate.isNested && candidate.path.startsWith(`${item.path}/`));

    if (hasNestedChildren) {
      return location.pathname === item.path;
    }

    return (
      location.pathname === item.path
      || location.pathname.startsWith(`${item.path}/`)
      || (item.aliases ?? []).some((alias) => location.pathname === alias || location.pathname.startsWith(`${alias}/`))
    );
  };

  return (
    <div className={cn('sm:hidden', className)} ref={menuRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isOpen}
        aria-controls="mobile-nav-menu"
        className="min-w-[44px] min-h-[44px] p-2 text-white hover:bg-white/10"
      >
        <Menu className="w-6 h-6" />
      </Button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 sm:hidden"
          aria-hidden="true"
        />
      )}

      <nav
        id="mobile-nav-menu"
        className={cn(
          'fixed top-0 left-0 bottom-0 w-64 bg-[#1A1A1A] z-50 transform transition-transform duration-200 ease-in-out sm:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-800">
          <span className="text-xl font-serif font-medium text-white">
            ValueRank
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation menu"
            className="min-w-[44px] min-h-[44px] p-2 text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isNavActive(item);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 min-h-[44px] text-base font-medium transition-colors',
                  item.isNested ? 'pl-10 text-sm' : '',
                  isActive
                    ? 'text-white bg-teal-600/20 border-l-2 border-teal-500'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
