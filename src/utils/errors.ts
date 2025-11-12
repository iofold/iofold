import type { APIError } from '../types/api';

export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function createAPIError(
  code: string,
  message: string,
  status: number = 500,
  details?: any
): Response {
  const requestId = crypto.randomUUID();
  const error: APIError = {
    error: {
      code,
      message,
      details,
      request_id: requestId
    }
  };

  return new Response(JSON.stringify(error), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleError(error: any): Response {
  console.error('API Error:', error);

  // Handle our custom AppError
  if (error instanceof AppError) {
    return createAPIError(error.code, error.message, error.status, error.details);
  }

  // Handle Zod validation errors
  if (error.name === 'ZodError') {
    return createAPIError('VALIDATION_ERROR', 'Invalid request parameters', 400, error.errors);
  }

  // Handle not found errors
  if (error.message?.includes('not found')) {
    return createAPIError('NOT_FOUND', error.message, 404);
  }

  // Handle database errors
  if (error.message?.includes('D1') || error.message?.includes('database')) {
    return createAPIError('DATABASE_ERROR', 'Database error occurred', 500, error.message);
  }

  // Handle external API errors (Claude, etc)
  if (error.status || error.type === 'api_error') {
    return createAPIError(
      'EXTERNAL_API_ERROR',
      'External service error',
      503,
      error.message
    );
  }

  // Generic error
  return createAPIError(
    'INTERNAL_ERROR',
    error.message || 'An unexpected error occurred',
    500
  );
}

// Specific error helpers
export function notFoundError(resource: string, id: string): Response {
  return createAPIError('NOT_FOUND', `${resource} with id ${id} not found`, 404);
}

export function validationError(message: string, details?: any): Response {
  return createAPIError('VALIDATION_ERROR', message, 400, details);
}

export function insufficientExamplesError(current: number, required: number): Response {
  return createAPIError(
    'INSUFFICIENT_EXAMPLES',
    `Insufficient examples for eval generation. Required: ${required}, Current: ${current}`,
    422,
    { current, required }
  );
}

export function conflictError(message: string): Response {
  return createAPIError('ALREADY_EXISTS', message, 409);
}

export function unauthorizedError(): Response {
  return createAPIError('UNAUTHORIZED', 'Authentication required', 401);
}
