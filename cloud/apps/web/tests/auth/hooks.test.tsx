import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ReactNode } from 'react';
import { AuthProvider } from '../../src/auth/context';
import { useAuth } from '../../src/auth/hooks';

function Wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('useAuth hook', () => {
  it('should throw when used outside AuthProvider', () => {
    // Suppress React's console.error for the expected throw — otherwise jsdom
    // logs it to stderr and vitest exits non-zero even though the test passes.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('should return auth context value when inside AuthProvider', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    expect(result.current).toHaveProperty('user');
    expect(result.current).toHaveProperty('token');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isAuthenticated');
    expect(result.current).toHaveProperty('login');
    expect(result.current).toHaveProperty('logout');
  });

  it('should provide login and logout functions', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    expect(typeof result.current.login).toBe('function');
    expect(typeof result.current.logout).toBe('function');
  });
});
