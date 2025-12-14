import type { ImgHTMLAttributes } from 'react';
import { useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const avatarVariants = cva(
  // Base styles
  'inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-600 font-medium overflow-hidden',
  {
    variants: {
      size: {
        xs: 'h-6 w-6 text-xs',
        sm: 'h-8 w-8 text-sm',
        md: 'h-10 w-10 text-base',
        lg: 'h-12 w-12 text-lg',
        xl: 'h-16 w-16 text-xl',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

export type AvatarProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'size'> &
  VariantProps<typeof avatarVariants> & {
    /** Full name for generating initials fallback */
    name?: string;
    /** Custom fallback content when no image */
    fallback?: React.ReactNode;
  };

/**
 * Generate initials from a name
 * "John Doe" -> "JD"
 * "alice" -> "A"
 * "John Michael Doe" -> "JD" (first and last)
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0]?.charAt(0).toUpperCase() || '?';
  }
  const first = parts[0]?.charAt(0) || '';
  const last = parts[parts.length - 1]?.charAt(0) || '';
  return (first + last).toUpperCase();
}

export function Avatar({
  src,
  alt,
  name,
  size,
  fallback,
  className,
  ...props
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  const showImage = src && !imageError;
  const initials = name ? getInitials(name) : null;

  return (
    <span
      className={cn(avatarVariants({ size }), className)}
      role="img"
      aria-label={alt || name || 'Avatar'}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt || name || 'Avatar'}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
          {...props}
        />
      ) : fallback ? (
        fallback
      ) : initials ? (
        initials
      ) : (
        <svg
          className="h-1/2 w-1/2 text-gray-400"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )}
    </span>
  );
}

export { avatarVariants };
