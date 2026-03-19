import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { type LucideIcon, Archive, BarChart2, FileText, FolderTree, GitCompare, Home, Menu, Settings, ShieldCheck, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

type NavItem = {
  name: string;
  icon: LucideIcon;
  path?: string;
  aliases?: string[];
  children?: NavItem[];
};

const navItems: NavItem[] = [
  { name: 'Home', path: '/', icon: Home },
  {
    name: 'Domains',
    path: '/domains',
    icon: FolderTree,
    children: [
      { name: 'Vignettes', path: '/definitions', icon: FileText },
      { name: 'Domain Analysis', path: '/domains/analysis', icon: BarChart2 },
      { name: 'Coverage', path: '/domains/coverage', icon: BarChart2 },
      { name: 'Trials', path: '/runs', icon: BarChart2 },
      {
        name: 'Domain Setup',
        icon: FileText,
        children: [
          { name: 'Preamble', path: '/preambles', icon: FileText },
          { name: 'Context', path: '/domain-contexts', icon: FileText },
          { name: 'Value Statements', path: '/value-statements', icon: FileText },
          { name: 'Level Presets', path: '/level-presets', icon: FileText },
        ],
      },
    ],
  },
  {
    name: 'Validation',
    path: '/validation',
    icon: ShieldCheck,
    children: [
      { name: 'Temp=0 Effect', path: '/assumptions/temp-zero-effect', icon: ShieldCheck },
      { name: 'Legacy Analysis', path: '/assumptions/analysis', icon: ShieldCheck },
      { name: 'Validation (old v1)', path: '/assumptions/analysis-v1', icon: ShieldCheck },
    ],
  },
  {
    name: 'Archive',
    path: '/archive',
    icon: Archive,
    children: [
      { name: 'Legacy Survey Work', path: '/archive/surveys', icon: Archive, aliases: ['/survey'] },
      { name: 'Legacy Survey Results', path: '/archive/survey-results', icon: Archive, aliases: ['/survey-results'] },
    ],
  },
  { name: 'Compare', path: '/compare', icon: GitCompare },
  { name: 'Settings', path: '/settings', icon: Settings },
];

function matchesNavPath(pathname: string, item: NavItem) {
  if (!item.path) {
    return false;
  }

  if (item.path === '/') {
    return pathname === '/';
  }

  return (
    pathname === item.path
    || pathname.startsWith(`${item.path}/`)
    || (item.aliases ?? []).some((alias) => pathname === alias || pathname.startsWith(`${alias}/`))
  );
}

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

  const isNavActive = (item: NavItem, includeChildren = true): boolean => {
    const itemMatches = (!includeChildren && item.children && item.path)
      ? (
        item.path === '/'
          ? location.pathname === '/'
          : location.pathname === item.path || (item.aliases ?? []).some((alias) => location.pathname === alias)
      )
      : matchesNavPath(location.pathname, item);

    if (includeChildren && item.children) {
      return item.children.some((child) => isNavActive(child, true)) || itemMatches;
    }

    return itemMatches;
  };

  const renderNavItems = (items: NavItem[], depth = 0) => items.map((item) => {
    const Icon = item.icon;
    const isActive = isNavActive(item, depth > 0 || !item.children);
    const indentClass = depth === 0 ? '' : depth === 1 ? 'pl-10 text-sm' : 'pl-16 text-sm';

    if (item.path) {
      return (
        <div key={item.path}>
          <NavLink
            to={item.path}
            className={cn(
              'flex items-center gap-3 px-4 py-3 min-h-[44px] text-base font-medium transition-colors',
              indentClass,
              isActive
                ? 'text-white bg-teal-600/20 border-l-2 border-teal-500'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            )}
          >
            <Icon className="w-5 h-5" />
            {item.name}
          </NavLink>
          {item.children ? renderNavItems(item.children, depth + 1) : null}
        </div>
      );
    }

    return (
      <div key={`${depth}-${item.name}`}>
        <div
          className={cn(
            'flex items-center gap-3 px-4 py-2 min-h-[44px] text-base font-medium text-white/60',
            indentClass
          )}
        >
          <Icon className="w-5 h-5" />
          {item.name}
        </div>
        {item.children ? renderNavItems(item.children, depth + 1) : null}
      </div>
    );
  });

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
          {renderNavItems(navItems)}
        </div>
      </nav>
    </div>
  );
}
