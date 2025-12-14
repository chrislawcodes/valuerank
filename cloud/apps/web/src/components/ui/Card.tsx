import type { HTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const cardVariants = cva(
  // Base styles
  'rounded-lg bg-white',
  {
    variants: {
      variant: {
        default: 'border border-gray-200',
        bordered: 'border-2 border-gray-300',
        elevated: 'shadow-md border border-gray-100',
        interactive: 'border border-gray-200 cursor-pointer transition-all duration-150 hover:shadow-md hover:border-gray-300',
      },
      padding: {
        none: '',
        compact: 'p-3',
        default: 'p-4',
        spacious: 'p-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'default',
    },
  }
);

export type CardProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants> & {
    children: ReactNode;
    /** When true, marks the interactive card as disabled (aria-disabled, removes tabIndex) */
    disabled?: boolean;
  };

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant, padding, className, children, onClick, disabled, ...props }, ref) => {
    // Add keyboard support for interactive cards
    const isInteractive = (variant === 'interactive' || onClick !== undefined) && !disabled;

    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant: onClick ? 'interactive' : variant, padding }), className)}
        onClick={disabled ? undefined : onClick}
        onKeyDown={isInteractive ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        } : undefined}
        role={onClick || variant === 'interactive' ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        aria-disabled={disabled || undefined}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// Subcomponents for structured card content
export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('pb-3 border-b border-gray-100', className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('pt-3', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('pt-3 border-t border-gray-100 mt-auto', className)} {...props}>
      {children}
    </div>
  );
}

export { cardVariants };
