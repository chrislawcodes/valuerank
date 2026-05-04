import { type FocusEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Activity, Archive, ChevronDown, ChevronRight, Cpu, FolderTree, Library, Settings } from 'lucide-react';
import { Button } from '../ui/Button';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useAuth } from '../../auth/hooks';

const utilityTabs: { name: string; path: string; icon: React.ComponentType<{ className?: string }>; aliases?: string[] }[] = [
  { name: 'Status', path: '/status', icon: Activity, aliases: ['/domains/status'] },
];

type MenuLinkItem = {
  name: string;
  path: string;
  aliases?: string[];
  match?: 'exact' | 'prefix';
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
  { name: 'Manage Domains', path: '/domains/manage' },
];

const modelsMenuItems: MenuItem[] = [
  { name: 'Model Groups', path: '/models', match: 'exact' },
  { name: 'Domain Analysis', path: '/domains/analysis' },
  { name: 'Domain Shifts', path: '/models/domain-shifts' },
  { name: 'Pressure Sensitivity', path: '/models/pressure-sensitivity' },
  { name: 'Confidence', path: '/models/confidence' },
];

const archiveMenuItems: MenuItem[] = [
  { name: 'Overview', path: '/archive', aliases: [] as string[] },
  { name: 'Legacy Survey Work', path: '/archive/surveys' },
  { name: 'Legacy Survey Results', path: '/archive/survey-results' },
  { name: 'Circumplex', path: '/archive/circumplex' },
  { name: 'Consistency', path: '/archive/consistency' },
];

const adminSettingsMenuItems: MenuItem[] = [
  {
    name: 'Research Setup',
    children: [
      { name: 'Preambles', path: '/preambles' },
      { name: 'Level Presets', path: '/level-presets' },
    ],
  },
  { name: 'Account', path: '/settings/account' },
  { name: 'System Health', path: '/settings/system-health' },
  { name: 'LLM Models', path: '/settings/models' },
  { name: 'Infrastructure', path: '/settings/infrastructure' },
  { name: 'API Keys', path: '/settings/api-keys' },
  { name: 'User Management', path: '/settings/users' },
];

function isMenuGroupItem(item: MenuItem): item is MenuGroupItem {
  return 'children' in item;
}

export function NavTabs() {
  const { user } = useAuth();
  const location = useLocation();
  const isAdmin = user?.role === 'ADMIN';
  const [isVignettesMenuOpen, setIsVignettesMenuOpen] = useState(false);
  const [isDomainsMenuOpen, setIsDomainsMenuOpen] = useState(false);
  const [isModelsMenuOpen, setIsModelsMenuOpen] = useState(false);
  const [isArchiveMenuOpen, setIsArchiveMenuOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const vignettesMenuRef = useRef<HTMLDivElement>(null);
  const domainMenuRef = useRef<HTMLDivElement>(null);
  const modelsMenuRef = useRef<HTMLDivElement>(null);
  const archiveMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  const isPathActive = useCallback((path: string, match: 'exact' | 'prefix' = 'prefix') => (
    location.pathname === path || (match === 'prefix' && location.pathname.startsWith(`${path}/`))
  ), [location.pathname]);

  const isTabActive = useCallback((tabPath: string, aliases: string[] = [], match: 'exact' | 'prefix' = 'prefix') => (
    isPathActive(tabPath, match) || aliases.some((alias) => isPathActive(alias, match))
  ), [isPathActive]);

  const isMenuItemActive = useCallback((item: MenuItem) => (
    isMenuGroupItem(item)
      ? item.children.some((child) => isTabActive(child.path, child.aliases ?? [], child.match ?? 'prefix'))
      : isTabActive(item.path, item.aliases ?? [], item.match ?? 'prefix')
  ), [isTabActive]);

  const isVignettesActive = vignettesMenuItems.some((item) => isMenuItemActive(item));
  const visibleDomainMenuItems = isAdmin
    ? domainMenuItems
    : domainMenuItems.filter((item) => !isMenuGroupItem(item) && item.path !== '/domains/manage');
  const isDomainsActive = visibleDomainMenuItems.some((item) => isMenuItemActive(item));
  const isModelsActive = modelsMenuItems.some((item) => isMenuItemActive(item));
  const isArchiveActive = isAdmin && archiveMenuItems.some((item) => isMenuItemActive(item));
  const visibleSettingsMenuItems = isAdmin ? adminSettingsMenuItems : [];
  const isSettingsActive = visibleSettingsMenuItems.some((item) => isMenuItemActive(item));

  useEffect(() => {
    setIsVignettesMenuOpen(false);
    setIsDomainsMenuOpen(false);
    setIsModelsMenuOpen(false);
    setIsArchiveMenuOpen(false);
    setIsSettingsMenuOpen(false);
  }, [location.pathname, isMenuItemActive]);

  useClickOutside(vignettesMenuRef, () => {
    if (isVignettesMenuOpen) setIsVignettesMenuOpen(false);
  }, isVignettesMenuOpen);
  useClickOutside(domainMenuRef, () => {
    if (isDomainsMenuOpen) setIsDomainsMenuOpen(false);
  }, isDomainsMenuOpen);
  useClickOutside(modelsMenuRef, () => {
    if (isModelsMenuOpen) setIsModelsMenuOpen(false);
  }, isModelsMenuOpen);
  useClickOutside(archiveMenuRef, () => {
    if (isArchiveMenuOpen) setIsArchiveMenuOpen(false);
  }, isArchiveMenuOpen);
  useClickOutside(settingsMenuRef, () => {
    if (isSettingsMenuOpen) setIsSettingsMenuOpen(false);
  }, isSettingsMenuOpen);

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
                          const childActive = isTabActive(child.path, child.aliases ?? [], child.match ?? 'prefix');
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

              const itemActive = isTabActive(item.path, item.aliases ?? [], item.match ?? 'prefix');
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
    <nav className="hidden sm:block bg-[#1A1A1A] border-t border-gray-800 sticky top-14 z-10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1">
          {renderMenu(modelsMenuRef, 'Models', '/models', Cpu, modelsMenuItems, isModelsActive, isModelsMenuOpen, setIsModelsMenuOpen)}
          {renderMenu(domainMenuRef, 'Domains', '/domains', FolderTree, visibleDomainMenuItems, isDomainsActive, isDomainsMenuOpen, setIsDomainsMenuOpen)}
          {renderMenu(vignettesMenuRef, 'Vignettes', '/definitions', Library, vignettesMenuItems, isVignettesActive, isVignettesMenuOpen, setIsVignettesMenuOpen)}
          {isAdmin ? renderMenu(archiveMenuRef, 'Archive', '/archive', Archive, archiveMenuItems, isArchiveActive, isArchiveMenuOpen, setIsArchiveMenuOpen) : null}
          {isAdmin ? renderMenu(settingsMenuRef, 'Settings', '/settings/account', Settings, visibleSettingsMenuItems, isSettingsActive, isSettingsMenuOpen, setIsSettingsMenuOpen) : null}

          {utilityTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(tab.path) ||
              (tab.aliases?.some((alias) => location.pathname.includes(alias)) ?? false);

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
