import type { User } from '../types';

// Login request to REST endpoint
export type LoginRequest = {
  email: string;
  password: string;
};

// Login response from REST endpoint
export type LoginResponse = {
  token: string;
  user: User;
};

// Auth context value exposed to components
export type AuthContextValue = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};
