import type { APIError } from '../types/api';
import { logger, type LogContext } from './logger';

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

export function handleError(error: any, request?: Request, additionalContext?: LogContext): Response {
  // Determine error classification
  let code = 'INTERNAL_ERROR';
  let message = error.message || 'An unexpected error occurred';
  let status = 500;
  let details: any = undefined;

  // Handle our custom AppError
  if (error instanceof AppError) {
    code = error.code;
    message = error.message;
    status = error.status;
    details = error.details;
  }
  // Handle Zod validation errors
  else if (error.name === 'ZodError') {
    code = 'VALIDATION_ERROR';
    message = 'Invalid request parameters';
    status = 400;
    details = error.errors;
  }
  // Handle not found errors
  else if (error.message?.includes('not found')) {
    code = 'NOT_FOUND';
    status = 404;
  }
  // Handle database errors
  else if (error.message?.includes('D1') || error.message?.includes('database') || error.message?.includes('SQLITE')) {
    code = 'DATABASE_ERROR';
    message = 'Database error occurred';
    status = 500;
    details = error.message;
  }
  // Handle external API errors (Claude, etc)
  else if (error.status || error.type === 'api_error') {
    code = 'EXTERNAL_API_ERROR';
    message = 'External service error';
    status = 503;
    details = error.message;
  }

  // Log with full context
  const context: LogContext = {
    errorCode: code,
    errorStatus: status,
    ...additionalContext,
  };

  if (request) {
    logger.apiError(error, request, context);
  } else {
    // Fallback logging without request context
    logger.error(`API Error: ${code}`, context, error);
  }

  return createAPIError(code, message, status, details);
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
