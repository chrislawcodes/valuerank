import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  QueueError,
  JobValidationError,
  RunStateError,
} from '../src/errors.js';

describe('error classes', () => {
  describe('AppError', () => {
    it('creates error with all properties', () => {
      const error = new AppError('Test error', 'TEST_ERROR', 400, { key: 'value' });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.context).toEqual({ key: 'value' });
      expect(error.name).toBe('AppError');
    });

    it('defaults statusCode to 500', () => {
      const error = new AppError('Test', 'TEST');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('NotFoundError', () => {
    it('creates 404 error with resource info', () => {
      const error = new NotFoundError('User', '123');

      expect(error.message).toBe('User not found: 123');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.context).toEqual({ resource: 'User', id: '123' });
    });
  });

  describe('ValidationError', () => {
    it('creates 400 error with details', () => {
      const details = { field: 'email', error: 'invalid' };
      const error = new ValidationError('Invalid input', details);

      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.context).toEqual({ details });
    });

    it('creates error without details', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.context).toEqual({ details: undefined });
    });
  });

  describe('AuthenticationError', () => {
    it('creates 401 error with default message', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('AuthenticationError');
    });

    it('creates 401 error with custom message', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
    });

    it('creates 401 error with context', () => {
      const error = new AuthenticationError('Token expired', { tokenId: '123' });

      expect(error.message).toBe('Token expired');
      expect(error.context).toEqual({ tokenId: '123' });
    });
  });

  describe('QueueError', () => {
    it('creates 500 error for queue failures', () => {
      const error = new QueueError('Queue connection failed');

      expect(error.message).toBe('Queue connection failed');
      expect(error.code).toBe('QUEUE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('QueueError');
    });

    it('creates error with context', () => {
      const error = new QueueError('Job failed', { jobId: 'abc123', queue: 'probes' });

      expect(error.message).toBe('Job failed');
      expect(error.context).toEqual({ jobId: 'abc123', queue: 'probes' });
    });
  });

  describe('JobValidationError', () => {
    it('creates 400 error for invalid job data', () => {
      const error = new JobValidationError('Invalid job payload');

      expect(error.message).toBe('Invalid job payload');
      expect(error.code).toBe('JOB_VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('JobValidationError');
    });

    it('creates error with details', () => {
      const details = { field: 'modelId', error: 'required' };
      const error = new JobValidationError('Missing required field', details);

      expect(error.context).toEqual({ details });
    });
  });

  describe('RunStateError', () => {
    it('creates 400 error for invalid state transitions', () => {
      const error = new RunStateError('run-123', 'completed', 'cancel');

      expect(error.message).toBe('Cannot cancel run in completed state');
      expect(error.code).toBe('RUN_STATE_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('RunStateError');
      expect(error.context).toEqual({
        runId: 'run-123',
        currentState: 'completed',
        action: 'cancel',
      });
    });

    it('creates error for pause action', () => {
      const error = new RunStateError('run-456', 'pending', 'pause');

      expect(error.message).toBe('Cannot pause run in pending state');
      expect(error.context?.runId).toBe('run-456');
    });
  });
});
