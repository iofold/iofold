/**
 * Shared utilities for API endpoints
 */

/**
 * Standard API error response format
 */
export interface APIError {
  error: {
    code: string;
    message: string;
    details?: any;
    request_id: string;
  };
}

/**
 * Generate a unique request ID for error tracking
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: any
): Response {
  const requestId = generateRequestId();
  const errorBody: APIError = {
    error: {
      code,
      message,
      details,
      request_id: requestId,
    },
  };

  return new Response(JSON.stringify(errorBody), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Create a success response
 */
export function createSuccessResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Pagination cursor encoding/decoding
 * Cursor format: base64(timestamp:id)
 */
export function encodeCursor(timestamp: string, id: string): string {
  return Buffer.from(`${timestamp}:${id}`).toString('base64');
}

export function decodeCursor(cursor: string): { timestamp: string; id: string } {
  const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
  const [timestamp, id] = decoded.split(':');
  return { timestamp, id };
}

/**
 * Parse pagination parameters from query string
 */
export interface PaginationParams {
  cursor?: string;
  limit: number;
}

export function parsePaginationParams(url: URL, defaultLimit: number = 50, maxLimit: number = 200): PaginationParams {
  const cursor = url.searchParams.get('cursor') || undefined;
  const limitStr = url.searchParams.get('limit');
  let limit = defaultLimit;

  if (limitStr) {
    const parsed = parseInt(limitStr, 10);
    if (!isNaN(parsed)) {
      limit = Math.min(Math.max(1, parsed), maxLimit);
    }
  }

  return { cursor, limit };
}

/**
 * Extract workspace ID from request headers
 */
export function getWorkspaceId(request: Request): string | null {
  return request.headers.get('X-Workspace-Id');
}

/**
 * Validate workspace access (stub for now, assumes env.user is available)
 */
export function validateWorkspaceAccess(workspaceId: string | null): void {
  if (!workspaceId) {
    throw new Error('Missing X-Workspace-Id header');
  }
}

/**
 * Parse and validate JSON request body
 */
export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }
}

/**
 * Generic paginated response builder
 */
export interface PaginatedResponse<T> {
  data?: T[];
  traces?: T[];
  eval_sets?: T[];
  next_cursor: string | null;
  has_more: boolean;
  total_count?: number;
}

export function buildPaginatedResponse<T>(
  data: T[],
  limit: number,
  getTimestamp: (item: T) => string,
  getId: (item: T) => string,
  dataKey?: string,
  totalCount?: number
): PaginatedResponse<T> {
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = encodeCursor(getTimestamp(lastItem), getId(lastItem));
  }

  const response: any = {
    next_cursor: nextCursor,
    has_more: hasMore,
  };

  // Use the specified key or default to 'data'
  if (dataKey) {
    response[dataKey] = items;
  } else {
    response.data = items;
  }

  if (totalCount !== undefined) {
    response.total_count = totalCount;
  }

  return response;
}
