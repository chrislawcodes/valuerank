import { type FocusEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Archive, ChevronDown, ChevronRight, FolderTree, GitCompare, Home, Library, Settings, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { useClickOutside } from '../../hooks/useClickOutside';

const utilityTabs = [
  { name: 'Compare', path: '/compare', icon: GitCompare },
  { name: 'Settings', path: '/settings', icon: Settings },
];

type MenuLinkItem = {
  name: string;
  path: string;
  aliases?: string[];
};

type MenuGroupItem = {
  name: string;
  children: MenuLinkItem[];
};

type MenuItem = MenuLinkItem | MenuGroupItem;

const vignettesMenuItems: MenuItem[] = [
  { name: 'Vignette Library', path: '/definitions' },
  { name: 'Runs', path: '/runs' },
  { name: 'Analysis', path: '/analysis' },
];

const domainMenuItems: MenuItem[] = [
  { name: 'Overview', path: '/domains' },
  { name: 'Domain Analysis', path: '/domains/analysis' },
  { name: 'Coverage', path: '/domains/coverage' },
  {
    name: 'Domain Setup',
    children: [
      { name: 'Preamble', path: '/preambles' },
      { name: 'Context', path: '/domain-contexts' },
      { name: 'Value Statements', path: '/value-statements' },
      { name: 'Level Presets', path: '/level-presets' },
    ],
  },
];

const validationMenuItems = [
  { name: 'Overview', path: '/validation' },
  { name: 'Temp=0 Effect', path: '/assumptions/temp-zero-effect' },
  { name: 'Legacy Analysis', path: '/assumptions/analysis' },
  { name: 'Analysis (old v1)', path: '/assumptions/analysis-v1' },
];

const archiveMenuItems = [
  { name: 'Overview', path: '/archive', aliases: [] as string[] },
  { name: 'Legacy Survey Work', path: '/archive/surveys', aliases: ['/survey'] },
  { name: 'Legacy Survey Results', path: '/archive/survey-results', aliases: ['/survey-results'] },
];

function isMenuGroupItem(item: MenuItem): item is MenuGroupItem {
  return 'children' in item;
}

export function NavTabs() {
  const location = useLocation();
  const [isVignettesMenuOpen, setIsVignettesMenuOpen] = useState(false);
  const [isDomainsMenuOpen, setIsDomainsMenuOpen] = useState(false);
  const [isValidationMenuOpen, setIsValidationMenuOpen] = useState(false);
  const [isArchiveMenuOpen, setIsArchiveMenuOpen] = useState(false);
  const vignettesMenuRef = useRef<HTMLDivElement>(null);
  const domainMenuRef = useRef<HTMLDivElement>(null);
  const validationMenuRef = useRef<HTMLDivElement>(null);
  const archiveMenuRef = useRef<HTMLDivElement>(null);

  const isPathActive = useCallback((path: string) => (
    location.pathname === path || location.pathname.startsWith(`${path}/`)
  ), [location.pathname]);

  const isTabActive = useCallback((tabPath: string, aliases: string[] = []) => (
    isPathActive(tabPath) || aliases.some((alias) => isPathActive(alias))
  ), [isPathActive]);

  const isMenuItemActive = useCallback((item: MenuItem) => (
    isMenuGroupItem(item)
      ? item.children.some((child) => isTabActive(child.path, child.aliases ?? []))
      : isTabActive(item.path, item.aliases ?? [])
  ), [isTabActive]);

  const isHomeActive = location.pathname === '/';
  const isVignettesActive = vignettesMenuItems.some((item) => isMenuItemActive(item));
  const isDomainsActive = domainMenuItems.some((item) => isMenuItemActive(item));
  const isValidationActive = validationMenuItems.some((item) => isTabActive(item.path));
  const isArchiveActive = archiveMenuItems.some((item) => isTabActive(item.path, item.aliases));

  useEffect(() => {
    setIsVignettesMenuOpen(false);
    setIsDomainsMenuOpen(false);
    setIsValidationMenuOpen(false);
    setIsArchiveMenuOpen(false);
  }, [location.pathname, isMenuItemActive]);

  useClickOutside(vignettesMenuRef, () => {
    if (isVignettesMenuOpen) setIsVignettesMenuOpen(false);
  }, isVignettesMenuOpen);
  useClickOutside(domainMenuRef, () => {
    if (isDomainsMenuOpen) setIsDomainsMenuOpen(false);
  }, isDomainsMenuOpen);
  useClickOutside(validationMenuRef, () => {
    if (isValidationMenuOpen) setIsValidationMenuOpen(false);
  }, isValidationMenuOpen);
  useClickOutside(archiveMenuRef, () => {
    if (isArchiveMenuOpen) setIsArchiveMenuOpen(false);
  }, isArchiveMenuOpen);

  const handleMenuFocus = (setOpen: (value: boolean) => void) => () => {
    setOpen(true);
  };

  const handleMenuBlur =
    (menuRef: RefObject<HTMLDivElement>, setOpen: (value: boolean) => void) =>
      (event: FocusEvent<HTMLDivElement>) => {
        const nextFocused = event.relatedTarget as Node | null;
        if (menuRef.current && nextFocused && menuRef.current.contains(nextFocused)) {
          return;
        }
        setOpen(false);
      };

  const renderMenu = (
    ref: RefObject<HTMLDivElement>,
    label: string,
    path: string,
    icon: React.ComponentType<{ className?: string }>,
    items: MenuItem[],
    isActive: boolean,
    isOpen: boolean,
    setOpen: (value: boolean | ((prev: boolean) => boolean)) => void,
  ) => {
    const Icon = icon;
    return (
      <div
        ref={ref}
        className="relative group"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={handleMenuFocus((value) => setOpen(value))}
        onBlur={handleMenuBlur(ref, (value) => setOpen(value))}
      >
        <div
          className={`flex items-center min-h-[44px] text-sm font-medium transition-colors border-b-2 ${isActive
            ? 'text-white border-teal-500'
            : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
          }`}
        >
          <NavLink to={path} className="flex items-center gap-2 px-3 py-3">
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Toggle ${label} menu`}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            onClick={() => setOpen((prev) => !prev)}
            className="px-2 py-3 min-h-[44px] text-white/80 hover:text-white hover:bg-transparent"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </div>
        <div className={`absolute left-0 top-full z-50 min-w-[200px] pt-1 transition-all duration-150 ${isOpen ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'}`}>
          <div className="rounded-md border border-gray-700 bg-[#1A1A1A] shadow-lg py-1">
            {items.map((item) => {
              if (isMenuGroupItem(item)) {
                return (
                  <div key={item.name} className="relative border-t border-gray-800/80 mt-1 pt-1 group/submenu">
                    <div
                      className={`flex w-full items-center justify-between px-3 py-2 text-sm cursor-default select-none ${isMenuItemActive(item) ? 'bg-teal-600/20 text-teal-300' : 'text-white/80 group-hover/submenu:bg-gray-800 group-hover/submenu:text-white'}`}
                    >
                      <span>{item.name}</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                    <div className="absolute left-full top-0 z-50 min-w-[180px] pl-1 opacity-0 invisible pointer-events-none group-hover/submenu:opacity-100 group-hover/submenu:visible group-hover/submenu:pointer-events-auto transition-all duration-150">
                      <div className="rounded-md border border-gray-700 bg-[#1A1A1A] shadow-lg py-1">
                        {item.children.map((child) => {
                          const childActive = isTabActive(child.path, child.aliases ?? []);
                          return (
                            <NavLink
                              key={child.path}
                              to={child.path}
                              className={`block px-3 py-2 text-sm ${childActive ? 'bg-teal-600/20 text-teal-300' : 'text-white/70 hover:bg-gray-800 hover:text-white'}`}
                            >
                              {child.name}
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              const itemActive = isTabActive(item.path, item.aliases ?? []);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`block px-3 py-2 text-sm ${itemActive ? 'bg-teal-600/20 text-teal-300' : 'text-white/80 hover:bg-gray-800 hover:text-white'}`}
                >
                  {item.name}
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <nav className="hidden sm:block bg-[#1A1A1A] border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1">
          <NavLink
            to="/"
            end
            className={`flex items-center gap-2 px-3 py-3 min-h-[44px] text-sm font-medium transition-colors border-b-2 ${isHomeActive
              ? 'text-white border-teal-500'
              : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
            }`}
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </NavLink>

          {renderMenu(vignettesMenuRef, 'Vignettes', '/definitions', Library, vignettesMenuItems, isVignettesActive, isVignettesMenuOpen, setIsVignettesMenuOpen)}
          {renderMenu(domainMenuRef, 'Domains', '/domains', FolderTree, domainMenuItems, isDomainsActive, isDomainsMenuOpen, setIsDomainsMenuOpen)}
          {renderMenu(validationMenuRef, 'Validation', '/validation', ShieldCheck, validationMenuItems, isValidationActive, isValidationMenuOpen, setIsValidationMenuOpen)}
          {renderMenu(archiveMenuRef, 'Archive', '/archive', Archive, archiveMenuItems, isArchiveActive, isArchiveMenuOpen, setIsArchiveMenuOpen)}

          {utilityTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(tab.path);

            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={`flex items-center gap-2 px-3 py-3 min-h-[44px] text-sm font-medium transition-colors border-b-2 ${isActive
                  ? 'text-white border-teal-500'
                  : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.name}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
