import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Menu, X, FileText, Play, BarChart2, GitCompare, ClipboardList, Settings, FolderTree } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

const navItems = [
  { name: 'Vignettes', path: '/definitions', icon: FileText },
  { name: 'Domains', path: '/domains', icon: FolderTree },
  { name: 'Trials', path: '/runs', icon: Play },
  { name: 'Analysis', path: '/analysis', icon: BarChart2 },
  { name: 'Compare', path: '/compare', icon: GitCompare },
  { name: 'Survey', path: '/survey', icon: ClipboardList },
  { name: 'Survey Results', path: '/survey-results', icon: BarChart2 },
  { name: 'Settings', path: '/settings', icon: Settings },
];

type MobileNavProps = {
  className?: string;
};

export function MobileNav({ className }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Prevent body scroll when menu is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close menu on escape key
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

  // Check if the current path matches or is a child of the nav path
  const isNavActive = (navPath: string) => {
    return location.pathname === navPath || location.pathname.startsWith(`${navPath}/`);
  };

  return (
    <div className={cn('sm:hidden', className)} ref={menuRef}>
      {/* Hamburger button - 44x44px touch target */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isOpen}
        aria-controls="mobile-nav-menu"
        className="min-w-[44px] min-h-[44px] p-2 text-white hover:bg-white/10"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </Button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 sm:hidden"
          aria-hidden="true"
        />
      )}

      {/* Slide-out menu */}
      <nav
        id="mobile-nav-menu"
        className={cn(
          'fixed top-0 left-0 bottom-0 w-64 bg-[#1A1A1A] z-50 transform transition-transform duration-200 ease-in-out sm:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Mobile navigation"
      >
        {/* Menu header */}
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

        {/* Navigation links */}
        <div className="py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isNavActive(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 min-h-[44px] text-base font-medium transition-colors',
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
