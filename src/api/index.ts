/**
 * API Router
 *
 * Main router that dispatches requests to appropriate endpoint handlers.
 */

/// <reference types="@cloudflare/workers-types" />

import { createErrorResponse } from './utils';

// Import endpoint handlers
import {
  importTraces,
  listTraces,
  getTraceById,
  deleteTrace,
} from './traces';

import {
  createEvalSet,
  listEvalSets,
  getEvalSetById,
  updateEvalSet,
  deleteEvalSet,
} from './eval-sets';

import {
  submitFeedback,
  updateFeedback,
  deleteFeedback,
} from './feedback';

import {
  createIntegration,
  listIntegrations,
  testIntegration,
  deleteIntegration,
} from './integrations';

import { JobsAPI } from './jobs';

export interface Env {
  DB: D1Database;
}

/**
 * Route HTTP request to appropriate handler
 */
export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // ============================================================================
  // Trace Management Endpoints
  // ============================================================================

  // POST /api/traces/import
  if (path === '/api/traces/import' && method === 'POST') {
    return importTraces(request, env);
  }

  // GET /api/traces
  if (path === '/api/traces' && method === 'GET') {
    return listTraces(request, env);
  }

  // GET /api/traces/:id
  const traceMatch = path.match(/^\/api\/traces\/([^\/]+)$/);
  if (traceMatch && method === 'GET') {
    return getTraceById(request, env, traceMatch[1]);
  }

  // DELETE /api/traces/:id
  if (traceMatch && method === 'DELETE') {
    return deleteTrace(request, env, traceMatch[1]);
  }

  // ============================================================================
  // Eval Sets Endpoints
  // ============================================================================

  // POST /api/eval-sets
  if (path === '/api/eval-sets' && method === 'POST') {
    return createEvalSet(request, env);
  }

  // GET /api/eval-sets
  if (path === '/api/eval-sets' && method === 'GET') {
    return listEvalSets(request, env);
  }

  // GET /api/eval-sets/:id
  const evalSetMatch = path.match(/^\/api\/eval-sets\/([^\/]+)$/);
  if (evalSetMatch && method === 'GET') {
    return getEvalSetById(request, env, evalSetMatch[1]);
  }

  // PATCH /api/eval-sets/:id
  if (evalSetMatch && method === 'PATCH') {
    return updateEvalSet(request, env, evalSetMatch[1]);
  }

  // DELETE /api/eval-sets/:id
  if (evalSetMatch && method === 'DELETE') {
    return deleteEvalSet(request, env, evalSetMatch[1]);
  }

  // ============================================================================
  // Feedback Endpoints
  // ============================================================================

  // POST /api/feedback
  if (path === '/api/feedback' && method === 'POST') {
    return submitFeedback(request, env);
  }

  // PATCH /api/feedback/:id
  const feedbackMatch = path.match(/^\/api\/feedback\/([^\/]+)$/);
  if (feedbackMatch && method === 'PATCH') {
    return updateFeedback(request, env, feedbackMatch[1]);
  }

  // DELETE /api/feedback/:id
  if (feedbackMatch && method === 'DELETE') {
    return deleteFeedback(request, env, feedbackMatch[1]);
  }

  // ============================================================================
  // Integrations Endpoints
  // ============================================================================

  // POST /api/integrations
  if (path === '/api/integrations' && method === 'POST') {
    return createIntegration(request, env);
  }

  // GET /api/integrations
  if (path === '/api/integrations' && method === 'GET') {
    return listIntegrations(request, env);
  }

  // POST /api/integrations/:id/test
  const integrationTestMatch = path.match(/^\/api\/integrations\/([^\/]+)\/test$/);
  if (integrationTestMatch && method === 'POST') {
    return testIntegration(request, env, integrationTestMatch[1]);
  }

  // DELETE /api/integrations/:id
  const integrationMatch = path.match(/^\/api\/integrations\/([^\/]+)$/);
  if (integrationMatch && method === 'DELETE') {
    return deleteIntegration(request, env, integrationMatch[1]);
  }

  // ============================================================================
  // Jobs Endpoints
  // ============================================================================

  const jobsAPI = new JobsAPI(env.DB);

  // GET /api/jobs/:id - Get job status
  const jobMatch = path.match(/^\/api\/jobs\/([^\/]+)$/);
  if (jobMatch && method === 'GET') {
    return jobsAPI.getJob(jobMatch[1]);
  }

  // GET /api/jobs/:id/stream - Stream job progress
  const jobStreamMatch = path.match(/^\/api\/jobs\/([^\/]+)\/stream$/);
  if (jobStreamMatch && method === 'GET') {
    return jobsAPI.streamJob(jobStreamMatch[1]);
  }

  // POST /api/jobs/:id/cancel - Cancel job
  const jobCancelMatch = path.match(/^\/api\/jobs\/([^\/]+)\/cancel$/);
  if (jobCancelMatch && method === 'POST') {
    return jobsAPI.cancelJob(jobCancelMatch[1]);
  }

  // GET /api/jobs - List recent jobs
  if (path === '/api/jobs' && method === 'GET') {
    // Get workspace ID from header (for now using default)
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return jobsAPI.listJobs(workspaceId, url.searchParams);
  }

  // ============================================================================
  // Not Found
  // ============================================================================

  return createErrorResponse(
    'NOT_FOUND',
    `Endpoint ${method} ${path} not found`,
    404
  );
}
