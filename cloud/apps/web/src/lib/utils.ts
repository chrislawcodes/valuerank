import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function for composing Tailwind CSS classes.
 * Combines clsx for conditional classes with tailwind-merge for conflict resolution.
 *
 * @example
 * // Basic usage
 * cn('px-4 py-2', 'bg-blue-500')
 *
 * // Conditional classes
 * cn('base-class', isActive && 'active-class', hasError && 'error-class')
 *
 * // With CVA variants
 * cn(buttonVariants({ variant, size }), className)
 *
 * // Conflict resolution (tailwind-merge handles this)
 * cn('p-4', 'p-2') // => 'p-2' (later wins)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
