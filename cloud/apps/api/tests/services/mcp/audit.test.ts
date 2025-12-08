/**
 * MCP Audit Logging Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  logAuditEvent,
  logAuditError,
  createDefinitionAudit,
  createRunAudit,
  createValidationAudit,
} from '../../../src/services/mcp/audit.js';

// Mock the logger
vi.mock('@valuerank/shared', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('MCP Audit Logging Service', () => {
  describe('logAuditEvent', () => {
    it('logs audit entry with all fields', () => {
      const entry = {
        action: 'create_definition' as const,
        userId: 'user-123',
        entityId: 'def-456',
        entityType: 'definition' as const,
        requestId: 'req-789',
      };

      // Should not throw
      expect(() => logAuditEvent(entry)).not.toThrow();
    });

    it('logs audit entry with metadata', () => {
      const entry = {
        action: 'fork_definition' as const,
        userId: 'user-123',
        entityId: 'def-456',
        entityType: 'definition' as const,
        requestId: 'req-789',
        metadata: {
          parentId: 'parent-def',
          definitionName: 'Test Fork',
        },
      };

      expect(() => logAuditEvent(entry)).not.toThrow();
    });

    it('logs audit entry with custom timestamp', () => {
      const entry = {
        action: 'start_run' as const,
        userId: 'user-123',
        entityId: 'run-456',
        entityType: 'run' as const,
        requestId: 'req-789',
        timestamp: new Date('2024-01-15T10:00:00Z'),
      };

      expect(() => logAuditEvent(entry)).not.toThrow();
    });
  });

  describe('logAuditError', () => {
    it('logs error entry with all fields', () => {
      const entry = {
        action: 'create_definition' as const,
        userId: 'user-123',
        requestId: 'req-789',
        error: 'Validation failed: dimension limit exceeded',
      };

      expect(() => logAuditError(entry)).not.toThrow();
    });

    it('logs error entry with metadata', () => {
      const entry = {
        action: 'start_run' as const,
        userId: 'user-123',
        requestId: 'req-789',
        error: 'Definition not found',
        metadata: {
          definitionId: 'missing-def',
          attemptedModels: ['gpt-4', 'claude'],
        },
      };

      expect(() => logAuditError(entry)).not.toThrow();
    });
  });

  describe('createDefinitionAudit', () => {
    it('creates audit entry for create_definition', () => {
      const audit = createDefinitionAudit({
        action: 'create_definition',
        userId: 'user-123',
        definitionId: 'def-456',
        requestId: 'req-789',
        name: 'My Definition',
      });

      expect(audit.action).toBe('create_definition');
      expect(audit.userId).toBe('user-123');
      expect(audit.entityId).toBe('def-456');
      expect(audit.entityType).toBe('definition');
      expect(audit.requestId).toBe('req-789');
      expect(audit.metadata?.definitionName).toBe('My Definition');
    });

    it('creates audit entry for fork_definition with parentId', () => {
      const audit = createDefinitionAudit({
        action: 'fork_definition',
        userId: 'user-123',
        definitionId: 'def-456',
        requestId: 'req-789',
        parentId: 'parent-def',
        name: 'Forked Definition',
      });

      expect(audit.action).toBe('fork_definition');
      expect(audit.metadata?.parentId).toBe('parent-def');
      expect(audit.metadata?.definitionName).toBe('Forked Definition');
    });
  });

  describe('createRunAudit', () => {
    it('creates audit entry for start_run', () => {
      const audit = createRunAudit({
        userId: 'user-123',
        runId: 'run-456',
        definitionId: 'def-789',
        requestId: 'req-000',
        models: ['gpt-4', 'claude-3-sonnet'],
        samplePercentage: 50,
      });

      expect(audit.action).toBe('start_run');
      expect(audit.userId).toBe('user-123');
      expect(audit.entityId).toBe('run-456');
      expect(audit.entityType).toBe('run');
      expect(audit.requestId).toBe('req-000');
      expect(audit.metadata?.definitionId).toBe('def-789');
      expect(audit.metadata?.models).toEqual(['gpt-4', 'claude-3-sonnet']);
      expect(audit.metadata?.samplePercentage).toBe(50);
    });

    it('creates audit entry without optional samplePercentage', () => {
      const audit = createRunAudit({
        userId: 'user-123',
        runId: 'run-456',
        definitionId: 'def-789',
        requestId: 'req-000',
        models: ['gpt-4'],
      });

      expect(audit.metadata?.samplePercentage).toBeUndefined();
    });
  });

  describe('createValidationAudit', () => {
    it('creates audit entry for successful validation', () => {
      const audit = createValidationAudit({
        userId: 'user-123',
        requestId: 'req-789',
        valid: true,
        errorCount: 0,
        warningCount: 2,
      });

      expect(audit.action).toBe('validate_definition');
      expect(audit.userId).toBe('user-123');
      expect(audit.entityId).toBe('validation');
      expect(audit.entityType).toBe('validation');
      expect(audit.requestId).toBe('req-789');
      expect(audit.metadata?.valid).toBe(true);
      expect(audit.metadata?.errorCount).toBe(0);
      expect(audit.metadata?.warningCount).toBe(2);
    });

    it('creates audit entry for failed validation', () => {
      const audit = createValidationAudit({
        userId: 'user-123',
        requestId: 'req-789',
        valid: false,
        errorCount: 3,
        warningCount: 1,
      });

      expect(audit.metadata?.valid).toBe(false);
      expect(audit.metadata?.errorCount).toBe(3);
    });
  });
});
