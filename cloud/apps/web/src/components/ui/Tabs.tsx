import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const tabVariants = cva(
  // Base styles for individual tab - includes min-h-[44px] for mobile touch targets
  'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 min-h-[44px]',
  {
    variants: {
      state: {
        active: 'border-teal-500 text-teal-600',
        inactive: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
      },
    },
    defaultVariants: {
      state: 'inactive',
    },
  }
);

const tabIconVariants = cva(
  'mr-2 transition-colors',
  {
    variants: {
      state: {
        active: 'text-teal-500',
        inactive: 'text-gray-400 group-hover:text-gray-500',
      },
    },
    defaultVariants: {
      state: 'inactive',
    },
  }
);

export type Tab = {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type TabsProps = VariantProps<typeof tabVariants> & {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
  /** Render tabs as full width */
  fullWidth?: boolean;
};

export function Tabs({ tabs, activeTab, onChange, className, fullWidth = false }: TabsProps) {
  return (
    <div className={cn('border-b border-gray-200', className)}>
      <nav
        className={cn('-mb-px flex', fullWidth ? 'w-full' : 'space-x-8')}
        aria-label="Tabs"
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const state = isActive ? 'active' : 'inactive';

          return (
            // eslint-disable-next-line react/forbid-elements
            <button
              key={tab.id}
              onClick={() => !tab.disabled && onChange(tab.id)}
              className={cn(
                tabVariants({ state }),
                fullWidth && 'flex-1 justify-center',
                tab.disabled && 'opacity-50 cursor-not-allowed'
              )}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              disabled={tab.disabled}
            >
              {tab.icon && (
                <span className={tabIconVariants({ state })}>
                  {tab.icon}
                </span>
              )}
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// TabPanel component for controlled content display
export type TabPanelProps = {
  id: string;
  activeTab: string;
  children: ReactNode;
  className?: string;
};

export function TabPanel({ id, activeTab, children, className }: TabPanelProps) {
  if (id !== activeTab) return null;

  return (
    <div
      id={`tabpanel-${id}`}
      role="tabpanel"
      aria-labelledby={id}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}

export { tabVariants, tabIconVariants };
