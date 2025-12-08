/**
 * StatCard Component
 *
 * Reusable card for displaying a statistic with label and optional detail.
 */

import { type ReactNode } from 'react';

type StatCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  icon?: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error';
};

const variantStyles = {
  default: 'bg-gray-50 border-gray-200',
  success: 'bg-green-50 border-green-200',
  warning: 'bg-amber-50 border-amber-200',
  error: 'bg-red-50 border-red-200',
};

const labelStyles = {
  default: 'text-gray-500',
  success: 'text-green-600',
  warning: 'text-amber-600',
  error: 'text-red-600',
};

const valueStyles = {
  default: 'text-gray-900',
  success: 'text-green-700',
  warning: 'text-amber-700',
  error: 'text-red-700',
};

export function StatCard({
  label,
  value,
  detail,
  icon,
  variant = 'default',
}: StatCardProps) {
  return (
    <div
      className={`p-4 rounded-lg border ${variantStyles[variant]}`}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex-shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium ${labelStyles[variant]}`}>
            {label}
          </p>
          <p className={`text-xl font-semibold mt-1 ${valueStyles[variant]}`}>
            {value}
          </p>
          {detail && (
            <p className="text-xs text-gray-500 mt-1 truncate">
              {detail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
