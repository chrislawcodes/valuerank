import type { ReactNode } from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const tooltipVariants = cva(
  // Base styles
  'absolute z-50 px-2 py-1 text-sm rounded shadow-lg pointer-events-none',
  {
    variants: {
      variant: {
        dark: 'bg-gray-900 text-white',
        light: 'bg-white text-gray-900 border border-gray-200',
      },
    },
    defaultVariants: {
      variant: 'dark',
    },
  }
);

type Position = 'top' | 'bottom' | 'left' | 'right';

export type TooltipProps = VariantProps<typeof tooltipVariants> & {
  /** Content to display in tooltip */
  content: ReactNode;
  /** Element that triggers the tooltip */
  children: ReactNode;
  /** Preferred position (will flip if not enough space) */
  position?: Position;
  /** Delay before showing tooltip (ms) */
  delay?: number;
  /** Additional class for tooltip content */
  className?: string;
  /** Disable the tooltip */
  disabled?: boolean;
};

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
  variant,
  className,
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const gap = 8; // Space between trigger and tooltip

    let top = 0;
    let left = 0;

    switch (position) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - gap;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + gap;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.left - tooltipRect.width - gap;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.right + gap;
        break;
    }

    // Keep within viewport bounds
    const padding = 8;
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));

    setCoords({ top, left });
  }, [position]);

  useEffect(() => {
    if (isVisible) {
      calculatePosition();
    }
  }, [isVisible, calculatePosition]);

  const handleMouseEnter = () => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  const handleFocus = () => {
    if (disabled) return;
    setIsVisible(true);
  };

  const handleBlur = () => {
    setIsVisible(false);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="inline-block"
      >
        {children}
      </div>
      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className={cn(tooltipVariants({ variant }), className)}
            style={{
              top: coords.top,
              left: coords.left,
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}

export { tooltipVariants };
