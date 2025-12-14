import { useState, useEffect, useCallback } from 'react';

/**
 * Breakpoints matching Tailwind CSS defaults
 * - Mobile: < 640px
 * - Tablet: 640px - 1023px
 * - Desktop: >= 1024px
 */
const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

type ViewportSize = 'mobile' | 'tablet' | 'desktop';

type UseViewportResult = {
  /** Current viewport width in pixels */
  width: number;
  /** Current viewport height in pixels */
  height: number;
  /** Current viewport size category */
  size: ViewportSize;
  /** True if viewport is mobile (< 640px) */
  isMobile: boolean;
  /** True if viewport is tablet (640px - 1023px) */
  isTablet: boolean;
  /** True if viewport is desktop (>= 1024px) */
  isDesktop: boolean;
  /** True if viewport is mobile or tablet (< 1024px) */
  isMobileOrTablet: boolean;
};

function getViewportSize(width: number): ViewportSize {
  if (width < BREAKPOINTS.sm) return 'mobile';
  if (width < BREAKPOINTS.lg) return 'tablet';
  return 'desktop';
}

/**
 * Hook for responsive viewport detection
 *
 * @example
 * const { isMobile, isDesktop, width } = useViewport();
 *
 * return (
 *   <div>
 *     {isMobile ? <MobileNav /> : <DesktopNav />}
 *   </div>
 * );
 */
export function useViewport(): UseViewportResult {
  const [dimensions, setDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));

  const handleResize = useCallback(() => {
    setDimensions({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, []);

  useEffect(() => {
    // Set initial dimensions
    handleResize();

    // Use ResizeObserver for better performance
    // Falls back to resize event for older browsers
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        handleResize();
      });
      observer.observe(document.documentElement);
      return () => observer.disconnect();
    }

    // Fallback to window resize event
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  const size = getViewportSize(dimensions.width);

  return {
    width: dimensions.width,
    height: dimensions.height,
    size,
    isMobile: size === 'mobile',
    isTablet: size === 'tablet',
    isDesktop: size === 'desktop',
    isMobileOrTablet: size !== 'desktop',
  };
}

/**
 * Hook to check if viewport matches a media query
 *
 * @example
 * const isWideScreen = useMediaQuery('(min-width: 1280px)');
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Use modern API (addListener/removeListener are deprecated)
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
