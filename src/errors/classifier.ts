// src/errors/classifier.ts
/**
 * Error classification for retry logic
 */

export type ErrorCategory =
  | 'transient_network'      // Network timeouts, connection errors
  | 'transient_rate_limit'   // 429 responses
  | 'transient_server'       // 5xx server errors
  | 'transient_db_lock'      // Database lock/busy errors
  | 'permanent_validation'   // Invalid input data
  | 'permanent_auth'         // 401/403 authentication errors
  | 'permanent_not_found'    // 404 resource not found
  | 'permanent_security'     // Security violations (sandbox, imports)
  | 'unknown';               // Unclassified errors

/**
 * Classify an error into a category for retry decisions
 */
export function classifyError(error: unknown): ErrorCategory {
  // Handle error objects with status code
  if (typeof error === 'object' && error !== null) {
    const statusError = error as { status?: number; message?: string; name?: string; code?: string };

    // Check HTTP status codes
    if (statusError.status) {
      if (statusError.status === 429) return 'transient_rate_limit';
      if (statusError.status >= 500 && statusError.status < 600) return 'transient_server';
      if (statusError.status === 401 || statusError.status === 403) return 'permanent_auth';
      if (statusError.status === 404) return 'permanent_not_found';
      if (statusError.status === 400 || statusError.status === 422) return 'permanent_validation';
    }

    // Check error name
    if (statusError.name === 'ValidationError') return 'permanent_validation';
    if (statusError.name === 'SecurityError') return 'permanent_security';

    // Check error code (Node.js style)
    if (statusError.code) {
      const code = statusError.code;
      if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'].includes(code)) {
        return 'transient_network';
      }
    }
  }

  // Check error message patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network patterns
    if (message.includes('timeout') || message.includes('etimedout') ||
        message.includes('econnreset') || message.includes('network')) {
      return 'transient_network';
    }

    // Rate limit patterns
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'transient_rate_limit';
    }

    // Database patterns
    if (message.includes('database is locked') || message.includes('busy') ||
        message.includes('d1') && message.includes('lock')) {
      return 'transient_db_lock';
    }

    // Validation patterns
    if (message.includes('insufficient') || message.includes('invalid') ||
        message.includes('required') || message.includes('validation')) {
      return 'permanent_validation';
    }

    // Auth patterns
    if (message.includes('unauthorized') || message.includes('forbidden') ||
        message.includes('api key') || message.includes('authentication')) {
      return 'permanent_auth';
    }

    // Not found patterns
    if (message.includes('not found') || message.includes('does not exist')) {
      return 'permanent_not_found';
    }

    // Security patterns
    if (message.includes('dangerous import') || message.includes('sandbox') ||
        message.includes('security') || message.includes('not allowed')) {
      return 'permanent_security';
    }
  }

  return 'unknown';
}

/**
 * Check if an error category is retryable
 */
export function isRetryable(category: ErrorCategory): boolean {
  return category.startsWith('transient_') || category === 'unknown';
}

/**
 * Get human-readable description for error category
 */
export function getErrorCategoryDescription(category: ErrorCategory): string {
  const descriptions: Record<ErrorCategory, string> = {
    transient_network: 'Network timeout or connection error',
    transient_rate_limit: 'API rate limit exceeded',
    transient_server: 'Server temporarily unavailable',
    transient_db_lock: 'Database temporarily busy',
    permanent_validation: 'Invalid input or insufficient data',
    permanent_auth: 'Authentication or authorization failed',
    permanent_not_found: 'Resource not found',
    permanent_security: 'Security violation detected',
    unknown: 'Unknown error'
  };
  return descriptions[category];
}
