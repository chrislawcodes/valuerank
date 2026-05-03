import { useEffect, useRef, useState, type ComponentType, type RefObject } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  Archive,
  ChevronDown,
  ChevronRight,
  Cpu,
  FolderTree,
  Library,
  LogOut,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../auth/hooks';
import { useClickOutside } from '../../hooks/useClickOutside';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { MobileNav } from './MobileNav';

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

type NavTabItem = {
  name: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  aliases?: string[];
};

const utilityTabs: NavTabItem[] = [
  { name: 'Status', path: '/status', icon: Activity, aliases: ['/domains/status'] },
];

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
  { name: 'Domain Analysis', path: '/domains/analysis' },
  { name: 'Domain Shifts', path: '/models/domain-shifts' },
  { name: 'Pressure Sensitivity', path: '/models/pressure-sensitivity' },
  { name: 'Confidence', path: '/models/confidence' },
];

const archiveMenuItems: MenuItem[] = [
  { name: 'Overview', path: '/archive', aliases: [] },
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

export function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isModelsMenuOpen, setIsModelsMenuOpen] = useState(false);
  const [isDomainsMenuOpen, setIsDomainsMenuOpen] = useState(false);
  const [isVignettesMenuOpen, setIsVignettesMenuOpen] = useState(false);
  const [isArchiveMenuOpen, setIsArchiveMenuOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelsMenuRef = useRef<HTMLDivElement>(null);
  const domainsMenuRef = useRef<HTMLDivElement>(null);
  const vignettesMenuRef = useRef<HTMLDivElement>(null);
  const archiveMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsDropdownOpen(false);
    setIsModelsMenuOpen(false);
    setIsDomainsMenuOpen(false);
    setIsVignettesMenuOpen(false);
    setIsArchiveMenuOpen(false);
    setIsSettingsMenuOpen(false);
  }, [location.pathname]);

  useClickOutside(dropdownRef, () => setIsDropdownOpen(false), isDropdownOpen);
  useClickOutside(modelsMenuRef, () => setIsModelsMenuOpen(false), isModelsMenuOpen);
  useClickOutside(domainsMenuRef, () => setIsDomainsMenuOpen(false), isDomainsMenuOpen);
  useClickOutside(vignettesMenuRef, () => setIsVignettesMenuOpen(false), isVignettesMenuOpen);
  useClickOutside(archiveMenuRef, () => setIsArchiveMenuOpen(false), isArchiveMenuOpen);
  useClickOutside(settingsMenuRef, () => setIsSettingsMenuOpen(false), isSettingsMenuOpen);

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'U';

  const isAdmin = user?.role === 'ADMIN';

  const isPathActive = (path: string, match: 'exact' | 'prefix' = 'prefix') => (
    location.pathname === path || (match === 'prefix' && location.pathname.startsWith(`${path}/`))
  );

  const isTabActive = (tabPath: string, aliases: string[] = [], match: 'exact' | 'prefix' = 'prefix') => (
    isPathActive(tabPath, match) || aliases.some((alias) => isPathActive(alias, match))
  );

  const isMenuItemActive = (item: MenuItem) => (
    isMenuGroupItem(item)
      ? item.children.some((child) => isTabActive(child.path, child.aliases ?? [], child.match ?? 'prefix'))
      : isTabActive(item.path, item.aliases ?? [], item.match ?? 'prefix')
  );

  const visibleDomainMenuItems = isAdmin
    ? domainMenuItems
    : domainMenuItems.filter((item) => !isMenuGroupItem(item) && item.path !== '/domains/manage');
  const visibleSettingsMenuItems = isAdmin ? adminSettingsMenuItems : [];
  const isModelsActive = modelsMenuItems.some((item) => isMenuItemActive(item));
  const isDomainsActive = visibleDomainMenuItems.some((item) => isMenuItemActive(item));
  const isVignettesActive = vignettesMenuItems.some((item) => isMenuItemActive(item));
  const isArchiveActive = isAdmin && archiveMenuItems.some((item) => isMenuItemActive(item));
  const isSettingsActive = visibleSettingsMenuItems.some((item) => isMenuItemActive(item));

  const renderMenu = (
    ref: RefObject<HTMLDivElement>,
    label: string,
    path: string,
    icon: ComponentType<{ className?: string }>,
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
      >
        <div
          className={cn(
            'flex items-center min-h-[44px] text-sm font-medium transition-colors border-b-2',
            isActive
              ? 'text-white border-teal-500'
              : 'text-white/70 border-transparent hover:text-white hover:border-gray-600',
          )}
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
            className="flex items-center justify-center px-2 py-3 min-h-[44px] text-white/80 hover:text-white hover:bg-transparent"
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
    <header className="sticky top-0 z-20 border-b border-gray-800 bg-[#1A1A1A]">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <div className="flex items-center gap-2 shrink-0">
          <MobileNav className="sm:hidden" />
          <span className="whitespace-nowrap text-xl font-serif font-medium text-white">
            ValueRank
          </span>
        </div>

        <nav className="hidden min-w-0 flex-1 sm:flex items-stretch gap-1 overflow-x-auto">
          {renderMenu(modelsMenuRef, 'Models', '/domains/analysis', Cpu, modelsMenuItems, isModelsActive, isModelsMenuOpen, setIsModelsMenuOpen)}
          {renderMenu(domainsMenuRef, 'Domains', '/domains', FolderTree, visibleDomainMenuItems, isDomainsActive, isDomainsMenuOpen, setIsDomainsMenuOpen)}
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
        </nav>

        {/* User menu */}
        <div className="relative" ref={dropdownRef}>
          {/* eslint-disable-next-line react/forbid-elements -- Dropdown trigger requires custom avatar + text layout */}
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-sm font-medium text-white">
              {initials}
            </div>
            <span className="hidden sm:block text-sm">
              {user?.name || user?.email}
            </span>
            <ChevronDown className="w-4 h-4" />
          </button>

          {/* Dropdown */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email}
                </p>
              </div>
              {/* eslint-disable-next-line react/forbid-elements -- Menu item requires custom full-width layout */}
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
