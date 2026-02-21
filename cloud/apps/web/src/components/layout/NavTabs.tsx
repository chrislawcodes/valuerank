import { type FocusEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FileText, GitCompare, ClipboardList, Settings, FolderTree, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { useClickOutside } from '../../hooks/useClickOutside';

const tabs = [
  { name: 'Compare', path: '/compare', icon: GitCompare },
  { name: 'Survey', path: '/survey', icon: ClipboardList },
  { name: 'Survey Results', path: '/survey-results', icon: ClipboardList },
  { name: 'Settings', path: '/settings', icon: Settings },
];

const vignetteMenuItems = [
  { name: 'List', path: '/definitions' },
  { name: 'Preambles', path: '/preambles' },
  { name: 'Trials', path: '/runs' },
  { name: 'Analysis', path: '/analysis' },
];

const domainMenuItems = [
  { name: 'List', path: '/domains' },
  { name: 'Analysis', path: '/domains/analysis' },
];

export function NavTabs() {
  const location = useLocation();
  const [isVignettesMenuOpen, setIsVignettesMenuOpen] = useState(false);
  const [isDomainsMenuOpen, setIsDomainsMenuOpen] = useState(false);
  const vignetteMenuRef = useRef<HTMLDivElement>(null);
  const domainMenuRef = useRef<HTMLDivElement>(null);

  // Check if the current path matches or is a child of the tab path
  const isTabActive = (tabPath: string) => {
    return location.pathname === tabPath || location.pathname.startsWith(`${tabPath}/`);
  };
  const isVignettesActive = vignetteMenuItems.some((item) => isTabActive(item.path));
  const isDomainsActive = domainMenuItems.some((item) => isTabActive(item.path));

  useEffect(() => {
    setIsVignettesMenuOpen(false);
    setIsDomainsMenuOpen(false);
  }, [location.pathname]);

  useClickOutside(domainMenuRef, () => {
    if (isDomainsMenuOpen) setIsDomainsMenuOpen(false);
  }, isDomainsMenuOpen);
  useClickOutside(vignetteMenuRef, () => {
    if (isVignettesMenuOpen) setIsVignettesMenuOpen(false);
  }, isVignettesMenuOpen);

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

  return (
    // Hidden on mobile (< 640px), visible on tablet/desktop
    <nav className="hidden sm:block bg-[#1A1A1A] border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1">
          <div
            ref={domainMenuRef}
            className="relative group"
            onMouseEnter={() => setIsDomainsMenuOpen(true)}
            onMouseLeave={() => setIsDomainsMenuOpen(false)}
            onFocus={handleMenuFocus(setIsDomainsMenuOpen)}
            onBlur={handleMenuBlur(domainMenuRef, setIsDomainsMenuOpen)}
          >
            <div
              className={
                `flex items-center min-h-[44px] text-sm font-medium transition-colors border-b-2 ${isDomainsActive
                  ? 'text-white border-teal-500'
                  : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
                }`
              }
            >
              <NavLink to="/domains" end className="flex items-center gap-2 px-3 py-3">
                <FolderTree className="w-4 h-4" />
                <span className="hidden sm:inline">Domains</span>
              </NavLink>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Toggle Domains menu"
                aria-haspopup="menu"
                aria-expanded={isDomainsMenuOpen}
                onClick={() => setIsDomainsMenuOpen((prev) => !prev)}
                className="px-2 py-3 min-h-[44px] text-white/80 hover:text-white hover:bg-transparent"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${isDomainsMenuOpen ? 'rotate-180' : ''}`} />
              </Button>
            </div>
            <div className={`absolute left-0 top-full z-50 min-w-[180px] pt-1 transition-all duration-150 ${isDomainsMenuOpen ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'}`}>
              <div className="rounded-md border border-gray-700 bg-[#1A1A1A] shadow-lg py-1">
                {domainMenuItems.map((item) => {
                  const isActive = isTabActive(item.path);
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={`block px-3 py-2 text-sm ${isActive ? 'bg-teal-600/20 text-teal-300' : 'text-white/80 hover:bg-gray-800 hover:text-white'}`}
                    >
                      {item.name}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          </div>
          <div
            ref={vignetteMenuRef}
            className="relative group"
            onMouseEnter={() => setIsVignettesMenuOpen(true)}
            onMouseLeave={() => setIsVignettesMenuOpen(false)}
            onFocus={handleMenuFocus(setIsVignettesMenuOpen)}
            onBlur={handleMenuBlur(vignetteMenuRef, setIsVignettesMenuOpen)}
          >
            <div
              className={
                `flex items-center min-h-[44px] text-sm font-medium transition-colors border-b-2 ${isVignettesActive
                  ? 'text-white border-teal-500'
                  : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
                }`
              }
            >
              <NavLink to="/definitions" className="flex items-center gap-2 px-3 py-3">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Vignettes</span>
              </NavLink>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Toggle Vignettes menu"
                aria-haspopup="menu"
                aria-expanded={isVignettesMenuOpen}
                onClick={() => setIsVignettesMenuOpen((prev) => !prev)}
                className="px-2 py-3 min-h-[44px] text-white/80 hover:text-white hover:bg-transparent"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${isVignettesMenuOpen ? 'rotate-180' : ''}`} />
              </Button>
            </div>
            <div className={`absolute left-0 top-full z-50 min-w-[180px] pt-1 transition-all duration-150 ${isVignettesMenuOpen ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'}`}>
              <div className="rounded-md border border-gray-700 bg-[#1A1A1A] shadow-lg py-1">
                {vignetteMenuItems.map((item) => {
                  const isActive = isTabActive(item.path);
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={`block px-3 py-2 text-sm ${isActive ? 'bg-teal-600/20 text-teal-300' : 'text-white/80 hover:bg-gray-800 hover:text-white'}`}
                    >
                      {item.name}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          </div>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(tab.path);
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={
                  `flex items-center gap-2 px-4 py-3 min-h-[44px] text-sm font-medium transition-colors border-b-2 ${isActive
                    ? 'text-white border-teal-500'
                    : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
                  }`
                }
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
