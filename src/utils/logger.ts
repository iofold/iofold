/**
 * Structured Logging Utility
 *
 * Provides consistent logging format for the backend API.
 * Uses Cloudflare Workers-compatible console methods.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  workspaceId?: string;
  method?: string;
  path?: string;
  userId?: string;
  agentId?: string;
  jobId?: string;
  [key: string]: string | number | boolean | undefined;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    cause?: string;
  };
  durationMs?: number;
}

/**
 * Format error object for logging
 */
function formatError(error: unknown): LogEntry['error'] | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: (error as any).cause ? String((error as any).cause) : undefined,
    };
  }

  // Handle non-Error objects
  if (typeof error === 'object') {
    const err = error as Record<string, unknown>;
    return {
      name: String(err.name || 'UnknownError'),
      message: String(err.message || JSON.stringify(error)),
      stack: err.stack ? String(err.stack) : undefined,
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}

/**
 * Create a log entry and output it
 */
function log(level: LogLevel, message: string, context?: LogContext, error?: unknown): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    error: formatError(error),
  };

  // Format as JSON for structured logging in Cloudflare
  const logLine = JSON.stringify(entry);

  switch (level) {
    case 'error':
      console.error(`[ERROR] ${message}`, logLine);
      // Also log stack trace separately for better visibility in wrangler dev
      if (entry.error?.stack) {
        console.error(entry.error.stack);
      }
      break;
    case 'warn':
      console.warn(`[WARN] ${message}`, logLine);
      break;
    case 'info':
      console.log(`[INFO] ${message}`, logLine);
      break;
    case 'debug':
      console.log(`[DEBUG] ${message}`, logLine);
      break;
  }
}

/**
 * Logger instance with convenience methods
 */
export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext, error?: unknown) => log('warn', message, context, error),
  error: (message: string, context?: LogContext, error?: unknown) => log('error', message, context, error),

  /**
   * Log an API error with full context
   */
  apiError: (error: unknown, request: Request, additionalContext?: LogContext) => {
    const url = new URL(request.url);
    const context: LogContext = {
      method: request.method,
      path: url.pathname,
      ...additionalContext,
    };

    // Extract workspace ID from header if present
    const workspaceId = request.headers.get('X-Workspace-Id');
    if (workspaceId) {
      context.workspaceId = workspaceId;
    }

    log('error', `API Error: ${request.method} ${url.pathname}`, context, error);
  },

  /**
   * Log request start (for timing)
   */
  requestStart: (request: Request, context?: LogContext) => {
    const url = new URL(request.url);
    log('info', `→ ${request.method} ${url.pathname}`, {
      method: request.method,
      path: url.pathname,
      ...context,
    });
  },

  /**
   * Log request completion with timing
   */
  requestEnd: (request: Request, status: number, durationMs: number, context?: LogContext) => {
    const url = new URL(request.url);
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      message: `← ${request.method} ${url.pathname} ${status}`,
      context: {
        method: request.method,
        path: url.pathname,
        status,
        ...context,
      },
      durationMs,
    };

    const logLine = JSON.stringify(entry);
    if (status >= 500) {
      console.error(`[ERROR] ← ${request.method} ${url.pathname} ${status} (${durationMs}ms)`, logLine);
    } else if (status >= 400) {
      console.warn(`[WARN] ← ${request.method} ${url.pathname} ${status} (${durationMs}ms)`, logLine);
    } else {
      console.log(`[INFO] ← ${request.method} ${url.pathname} ${status} (${durationMs}ms)`, logLine);
    }
  },
};

export default logger;
