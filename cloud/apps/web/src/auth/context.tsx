import type { ReactNode } from 'react';
import { createContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types';
import type { AuthContextValue, LoginResponse } from './types';

const TOKEN_KEY = 'valuerank_token';

// API base URL - empty string means same origin (dev), full URL for production
const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || '';

export const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const validateToken = useCallback(async (tokenToValidate: string, retryCount = 0) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${tokenToValidate}`,
        },
      });

      if (response.ok) {
        const userData = (await response.json()) as User;
        setUser(userData);
        setToken(tokenToValidate);
      } else if (response.status === 401 || response.status === 403) {
        // Token is invalid/expired, clear it
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      } else {
        // Server error (5xx), keep token and retry
        if (retryCount < 3) {
          setTimeout(() => { void validateToken(tokenToValidate, retryCount + 1); }, 1000);
          return; // Don't set isLoading to false yet
        }
        // After 3 retries, keep the token but set user to null
        // User will see loading state clear but can retry manually
        setUser(null);
        setIsLoading(false);
        return;
      }
    } catch {
      // Network error (server down) - retry a few times before giving up
      // Don't clear token on network errors - server might just be restarting
      if (retryCount < 3) {
        setTimeout(() => { void validateToken(tokenToValidate, retryCount + 1); }, 1000);
        return; // Don't set isLoading to false yet
      }
      // After retries, keep the token - user can refresh when server is back
      setUser(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
  }, []);

  // Restore token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
      // Validate token and fetch user info
      void validateToken(storedToken);
    } else {
      setIsLoading(false);
    }
  }, [validateToken]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ message: 'Login failed' }))) as { message?: string };
      throw new Error(error.message ?? 'Invalid credentials');
    }

    const data = (await response.json()) as LoginResponse;

    // Store token
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    token,
    isLoading,
    isAuthenticated: !!token && !!user,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Export token getter for urql client
export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// Export token clearer for 401 handling
export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
