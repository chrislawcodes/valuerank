import type { HTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  // Base styles
  'inline-flex items-center font-medium',
  {
    variants: {
      variant: {
        success: 'bg-green-100 text-green-700',
        warning: 'bg-amber-100 text-amber-700',
        error: 'bg-red-100 text-red-700',
        info: 'bg-blue-100 text-blue-700',
        tag: 'bg-gray-100 text-gray-600',
        neutral: 'bg-gray-100 text-gray-700',
        inherited: 'bg-purple-50 text-purple-600 border border-purple-200',
        selected: 'bg-teal-50 text-teal-700',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs rounded',
        md: 'px-2.5 py-1 text-sm rounded-md',
        lg: 'px-3 py-1.5 text-base rounded-md',
        count: 'px-2 py-0.5 text-xs rounded-full min-w-[1.25rem] justify-center',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'md',
    },
  }
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    children: ReactNode;
    /** Maximum width before truncation (e.g., '150px', '10rem') */
    maxWidth?: string;
  };

export function Badge({
  variant,
  size,
  maxWidth,
  className,
  children,
  title,
  ...props
}: BadgeProps) {
  const truncateStyles = maxWidth ? {
    maxWidth,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  } : {};

  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      style={truncateStyles}
      title={maxWidth ? (title || (typeof children === 'string' ? children : undefined)) : title}
      {...props}
    >
      {children}
    </span>
  );
}

// Utility: Map run status to badge variant
export function getStatusVariant(status: string): BadgeProps['variant'] {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'success';
    case 'running':
    case 'summarizing':
      return 'warning';
    case 'failed':
    case 'cancelled':
      return 'error';
    case 'pending':
      return 'info';
    default:
      return 'neutral';
  }
}

export { badgeVariants };
