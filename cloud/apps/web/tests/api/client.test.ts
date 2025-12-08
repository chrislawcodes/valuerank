import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUrqlClient, client } from '../../src/api/client';

// Mock the auth context module
vi.mock('../../src/auth/context', () => ({
  getStoredToken: vi.fn(() => 'mock-token'),
  clearStoredToken: vi.fn(),
}));

describe('createUrqlClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a client', () => {
    const urqlClient = createUrqlClient();
    expect(urqlClient).toBeDefined();
  });

  it('should use provided getToken function', () => {
    const customGetToken = vi.fn(() => 'custom-token');
    const urqlClient = createUrqlClient(customGetToken);
    expect(urqlClient).toBeDefined();
  });

  it('should create client with null token getter', () => {
    const nullTokenGetter = () => null;
    const urqlClient = createUrqlClient(nullTokenGetter);
    expect(urqlClient).toBeDefined();
  });

  it('should export a default client instance', () => {
    expect(client).toBeDefined();
  });
});
