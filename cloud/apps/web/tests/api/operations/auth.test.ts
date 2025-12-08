import { describe, it, expect } from 'vitest';
import { ME_QUERY, type MeQueryResult } from '../../../src/api/operations/auth';

describe('Auth Operations', () => {
  it('should export ME_QUERY', () => {
    expect(ME_QUERY).toBeDefined();
    expect(ME_QUERY.kind).toBe('Document');
  });

  it('should have correct type for MeQueryResult', () => {
    // Type check - this validates the type is correctly defined
    const result: MeQueryResult = {
      me: {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        lastLoginAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
      },
    };
    expect(result.me).toBeDefined();
    expect(result.me?.id).toBe('1');
  });

  it('should allow null me in MeQueryResult', () => {
    const result: MeQueryResult = { me: null };
    expect(result.me).toBeNull();
  });
});
