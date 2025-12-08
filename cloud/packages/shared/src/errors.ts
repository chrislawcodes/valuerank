export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404, { resource, id });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, { details });
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Unauthorized', context?: Record<string, unknown>) {
    super(message, 'UNAUTHORIZED', 401, context);
    this.name = 'AuthenticationError';
  }
}

// Queue-specific errors
export class QueueError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'QUEUE_ERROR', 500, context);
    this.name = 'QueueError';
  }
}

export class JobValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'JOB_VALIDATION_ERROR', 400, { details });
    this.name = 'JobValidationError';
  }
}

export class RunStateError extends AppError {
  constructor(runId: string, currentState: string, action: string) {
    super(
      `Cannot ${action} run in ${currentState} state`,
      'RUN_STATE_ERROR',
      400,
      { runId, currentState, action }
    );
    this.name = 'RunStateError';
  }
}
