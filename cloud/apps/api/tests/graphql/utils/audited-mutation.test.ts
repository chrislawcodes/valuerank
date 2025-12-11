/**
 * Unit tests for audited mutation wrapper
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditedMutation, type AuditMutationConfig } from '../../../src/graphql/utils/audited-mutation.js';
import type { Context } from '../../../src/graphql/context.js';

// Mock the audit service
vi.mock('../../../src/services/audit/index.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-log-id' }),
}));

import { createAuditLog } from '../../../src/services/audit/index.js';

describe('auditedMutation', () => {
  let mockContext: Context;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      loaders: {},
    } as unknown as Context;
  });

  describe('basic functionality', () => {
    it('executes the original resolver and returns its result', async () => {
      const mockResolver = vi.fn().mockResolvedValue({ id: 'result-123', name: 'Test' });

      const config: AuditMutationConfig<{ input: string }, { id: string; name: string }> = {
        action: 'CREATE',
        entityType: 'Definition',
      };

      const wrappedResolver = auditedMutation(config, mockResolver);
      const result = await wrappedResolver({ input: 'test' }, mockContext);

      expect(mockResolver).toHaveBeenCalledWith({ input: 'test' }, mockContext);
      expect(result).toEqual({ id: 'result-123', name: 'Test' });
    });

    it('creates an audit log with default entity id extraction', async () => {
      const mockResolver = vi.fn().mockResolvedValue({ id: 'entity-123' });

      const config: AuditMutationConfig<{}, { id: string }> = {
        action: 'CREATE',
        entityType: 'Definition',
      };

      const wrappedResolver = auditedMutation(config, mockResolver);
      await wrappedResolver({}, mockContext);

      // Wait for non-blocking audit call
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(createAuditLog).toHaveBeenCalledWith({
        action: 'CREATE',
        entityType: 'Definition',
        entityId: 'entity-123',
        userId: 'test-user-id',
        metadata: undefined,
      });
    });

    it('uses custom extractEntityId when provided', async () => {
      const mockResolver = vi.fn().mockResolvedValue({ customId: 'custom-456', data: 'test' });

      const config: AuditMutationConfig<{}, { customId: string; data: string }> = {
        action: 'UPDATE',
        entityType: 'Run',
        extractEntityId: (_args, result) => result.customId,
      };

      const wrappedResolver = auditedMutation(config, mockResolver);
      await wrappedResolver({}, mockContext);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'custom-456',
        })
      );
    });

    it('includes metadata when metadata function is provided', async () => {
      const mockResolver = vi.fn().mockResolvedValue({ id: 'entity-789' });

      const config: AuditMutationConfig<{ input: { name: string } }, { id: string }> = {
        action: 'CREATE',
        entityType: 'Definition',
        metadata: (args, result) => ({
          inputName: args.input.name,
          resultId: result.id,
        }),
      };

      const wrappedResolver = auditedMutation(config, mockResolver);
      await wrappedResolver({ input: { name: 'Test Name' } }, mockContext);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            inputName: 'Test Name',
            resultId: 'entity-789',
          },
        })
      );
    });
  });

  describe('edge cases', () => {
    it('handles missing user gracefully', async () => {
      const contextWithoutUser = {
        ...mockContext,
        user: null,
      } as unknown as Context;

      const mockResolver = vi.fn().mockResolvedValue({ id: 'entity-123' });

      const config: AuditMutationConfig<{}, { id: string }> = {
        action: 'CREATE',
        entityType: 'Definition',
      };

      const wrappedResolver = auditedMutation(config, mockResolver);
      await wrappedResolver({}, contextWithoutUser);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null,
        })
      );
    });

    it('warns and returns result when entity id cannot be extracted', async () => {
      const mockResolver = vi.fn().mockResolvedValue({ noIdField: 'test' });

      const config: AuditMutationConfig<{}, { noIdField: string }> = {
        action: 'CREATE',
        entityType: 'Definition',
      };

      const wrappedResolver = auditedMutation(config, mockResolver);
      const result = await wrappedResolver({}, mockContext);

      expect(result).toEqual({ noIdField: 'test' });
      expect(mockContext.log.warn).toHaveBeenCalledWith(
        {
          action: 'CREATE',
          entityType: 'Definition',
        },
        'Could not extract entity ID for audit log'
      );
      expect(createAuditLog).not.toHaveBeenCalled();
    });

    it('handles null result gracefully', async () => {
      const mockResolver = vi.fn().mockResolvedValue(null);

      const config: AuditMutationConfig<{}, null> = {
        action: 'DELETE',
        entityType: 'Definition',
      };

      const wrappedResolver = auditedMutation(config, mockResolver);
      const result = await wrappedResolver({}, mockContext);

      expect(result).toBeNull();
      expect(mockContext.log.warn).toHaveBeenCalled();
    });

    it('logs error when audit log creation fails', async () => {
      vi.mocked(createAuditLog).mockRejectedValueOnce(new Error('Database error'));

      const mockResolver = vi.fn().mockResolvedValue({ id: 'entity-123' });

      const config: AuditMutationConfig<{}, { id: string }> = {
        action: 'CREATE',
        entityType: 'Definition',
      };

      const wrappedResolver = auditedMutation(config, mockResolver);
      const result = await wrappedResolver({}, mockContext);

      // Should still return result even if audit fails
      expect(result).toEqual({ id: 'entity-123' });

      // Wait for async error handling
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockContext.log.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Audit log creation failed'
      );
    });

    it('propagates resolver errors', async () => {
      const mockResolver = vi.fn().mockRejectedValue(new Error('Resolver failed'));

      const config: AuditMutationConfig<{}, { id: string }> = {
        action: 'CREATE',
        entityType: 'Definition',
      };

      const wrappedResolver = auditedMutation(config, mockResolver);

      await expect(wrappedResolver({}, mockContext)).rejects.toThrow('Resolver failed');
      expect(createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe('action types', () => {
    const actions = ['CREATE', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'START_RUN', 'STOP_RUN'] as const;

    for (const action of actions) {
      it(`handles ${action} action`, async () => {
        const mockResolver = vi.fn().mockResolvedValue({ id: 'test-id' });

        const config: AuditMutationConfig<{}, { id: string }> = {
          action,
          entityType: 'Definition',
        };

        const wrappedResolver = auditedMutation(config, mockResolver);
        await wrappedResolver({}, mockContext);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({ action })
        );
      });
    }
  });

  describe('entity types', () => {
    const entityTypes = ['Definition', 'Run', 'Scenario', 'Transcript', 'Tag', 'ApiKey'] as const;

    for (const entityType of entityTypes) {
      it(`handles ${entityType} entity type`, async () => {
        const mockResolver = vi.fn().mockResolvedValue({ id: 'test-id' });

        const config: AuditMutationConfig<{}, { id: string }> = {
          action: 'CREATE',
          entityType,
        };

        const wrappedResolver = auditedMutation(config, mockResolver);
        await wrappedResolver({}, mockContext);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({ entityType })
        );
      });
    }
  });
});
