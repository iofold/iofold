/**
 * API Router
 *
 * Main router that dispatches requests to appropriate endpoint handlers.
 */

/// <reference types="@cloudflare/workers-types" />

import { createErrorResponse } from './utils';
import type { Queue } from '../queue/producer';
import { logger } from '../utils/logger';
import { handleError } from '../utils/errors';

// Import endpoint handlers
import {
  importTraces,
  listTraces,
  getTraceById,
  deleteTrace,
  deleteTraces,
  createTrace,
} from './traces';

import {
  submitFeedback,
  updateFeedback,
  deleteFeedback,
  listFeedback,
} from './feedback';

import {
  createIntegration,
  listIntegrations,
  getIntegrationById,
  updateIntegration,
  testIntegration,
  deleteIntegration,
} from './integrations';

import { JobsAPI } from './jobs';
import { EvalsAPI } from './evals';
import {
  getEvalMetrics,
  getPerformanceTrend,
  getEvalAlerts,
  acknowledgeAlert,
  resolveAlert,
  updateEvalSettings,
  getRefinementHistory,
} from './monitoring';

import {
  getComparisonMatrix,
  getEvalExecutions,
  getTraceExecutions,
  getEvalExecutionDetail
} from './matrix';

import {
  createAgent,
  listAgents,
  getAgentById,
  confirmAgent,
  deleteAgent,
  updateAgent,
  getAgentPrompt,
  improveAgent,
  discoverAgents,
} from './agents';

import {
  listAgentVersions,
  getAgentVersion,
  createAgentVersion,
  promoteAgentVersion,
  rejectAgentVersion,
} from './agent-versions';

import {
  playgroundChat,
  getPlaygroundSession,
  deletePlaygroundSession,
  listPlaygroundSessions,
  listAllPlaygroundSessions,
} from './playground';

import {
  extractTasks,
  listTasks,
  generateEvals,
  testEvalCandidates,
  selectWinner,
  activateEval,
  getActiveEval,
} from './eval-generation';

import {
  listTools,
  getToolById,
  getAgentTools,
  attachToolToAgent,
  detachToolFromAgent,
} from './tools';

import {
  createBatchRollout,
  getBatchStatus,
  listRolloutBatches,
} from './internal/rollouts';

import {
  startGEPAOptimization,
  listGEPARuns,
  getGEPARunStatus,
  streamGEPAProgress,
} from './gepa';

import {
  createTaskset,
  createTasksetFromTraces,
  listTasksets,
  getTaskset,
  addTasksToTaskset,
  archiveTaskset,
  runTaskset,
  listTasksetRuns,
  getTasksetRun,
} from './tasksets';

export interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID?: string;
  CF_AI_GATEWAY_ID?: string;
  CF_AI_GATEWAY_TOKEN?: string;
  SANDBOX?: any;
  ENCRYPTION_KEY?: string;
  /** Cloudflare Queue binding for job processing */
  JOB_QUEUE?: Queue;
}

/**
 * Route HTTP request to appropriate handler
 */
export async function handleApiRequest(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const startTime = Date.now();
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';

  try {
    // ============================================================================
    // Health Check Endpoint
    // ============================================================================

    // GET /api/health - Health check endpoint (no auth required)
    if (path === '/api/health' && method === 'GET') {
    return new Response(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ============================================================================
  // Trace Management Endpoints
  // ============================================================================

  // POST /api/traces/import
  if (path === '/api/traces/import' && method === 'POST') {
    return importTraces(request, env);
  }

  // POST /api/traces (create trace directly, for testing)
  if (path === '/api/traces' && method === 'POST') {
    return createTrace(request, env);
  }

  // GET /api/traces
  if (path === '/api/traces' && method === 'GET') {
    return listTraces(request, env);
  }

  // DELETE /api/traces (bulk) - must come BEFORE the :id pattern match
  if (path === '/api/traces' && method === 'DELETE') {
    return deleteTraces(request, env);
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

  // GET /api/traces/:id/executions - List eval executions for trace
  const traceExecutionsMatch = path.match(/^\/api\/traces\/([^\/]+)\/executions$/);
  if (traceExecutionsMatch && method === 'GET') {
    return getTraceExecutions(env.DB, traceExecutionsMatch[1]);
  }

  // ============================================================================
  // Feedback Endpoints
  // ============================================================================

  // GET /api/feedback
  if (path === '/api/feedback' && method === 'GET') {
    return listFeedback(request, env);
  }

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

  // GET /api/integrations/:id
  const integrationMatch = path.match(/^\/api\/integrations\/([^\/]+)$/);
  if (integrationMatch && method === 'GET') {
    return getIntegrationById(request, env, integrationMatch[1]);
  }

  // PATCH /api/integrations/:id
  if (integrationMatch && method === 'PATCH') {
    return updateIntegration(request, env, integrationMatch[1]);
  }

  // DELETE /api/integrations/:id
  if (integrationMatch && method === 'DELETE') {
    return deleteIntegration(request, env, integrationMatch[1]);
  }

  // ============================================================================
  // Jobs Endpoints
  // ============================================================================

  const jobsAPI = new JobsAPI({
    db: env.DB,
    cfAccountId: env.CF_ACCOUNT_ID || '',
    cfGatewayId: env.CF_AI_GATEWAY_ID || '',
    cfGatewayToken: env.CF_AI_GATEWAY_TOKEN,
    sandboxBinding: env.SANDBOX,
    encryptionKey: env.ENCRYPTION_KEY || 'default-dev-key'
  });

  // POST /api/jobs/process - Process queued jobs (for local development)
  if (path === '/api/jobs/process' && method === 'POST') {
    return jobsAPI.processQueuedJobs();
  }

  // GET /api/jobs/:id - Get job status
  const jobMatch = path.match(/^\/api\/jobs\/([^\/]+)$/);
  if (jobMatch && method === 'GET') {
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return jobsAPI.getJob(jobMatch[1], workspaceId);
  }

  // GET /api/jobs/:id/stream - Stream job progress
  const jobStreamMatch = path.match(/^\/api\/jobs\/([^\/]+)\/stream$/);
  if (jobStreamMatch && method === 'GET') {
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return jobsAPI.streamJob(jobStreamMatch[1], workspaceId);
  }

  // POST /api/jobs/:id/cancel - Cancel job
  const jobCancelMatch = path.match(/^\/api\/jobs\/([^\/]+)\/cancel$/);
  if (jobCancelMatch && method === 'POST') {
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return jobsAPI.cancelJob(jobCancelMatch[1], workspaceId);
  }

  // GET /api/jobs/:id/retries - Get retry history for a job
  const jobRetriesMatch = path.match(/^\/api\/jobs\/([^\/]+)\/retries$/);
  if (jobRetriesMatch && method === 'GET') {
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return jobsAPI.getJobRetries(jobRetriesMatch[1], workspaceId);
  }

  // POST /api/jobs/:id/retry - Manually retry a failed job
  const jobRetryMatch = path.match(/^\/api\/jobs\/([^\/]+)\/retry$/);
  if (jobRetryMatch && method === 'POST') {
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return jobsAPI.retryJob(jobRetryMatch[1], workspaceId);
  }

  // GET /api/jobs - List recent jobs
  if (path === '/api/jobs' && method === 'GET') {
    // Get workspace ID from header (for now using default)
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return jobsAPI.listJobs(workspaceId, url.searchParams);
  }

  // ============================================================================
  // Evals Endpoints
  // ============================================================================

  const evalsAPI = new EvalsAPI(
    env.DB,
    {
      cfAccountId: env.CF_ACCOUNT_ID || '',
      cfGatewayId: env.CF_AI_GATEWAY_ID || '',
      cfGatewayToken: env.CF_AI_GATEWAY_TOKEN
    },
    env.SANDBOX,
    ctx
  );

  // POST /api/evals - Create eval directly
  if (path === '/api/evals' && method === 'POST') {
    const body = await request.json();
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return evalsAPI.createEval(body, workspaceId);
  }

  // GET /api/evals - List evals
  if (path === '/api/evals' && method === 'GET') {
    const workspaceId = request.headers.get('X-Workspace-Id') || undefined;
    return evalsAPI.listEvals(url.searchParams, workspaceId);
  }

  // GET /api/evals/:id - Get eval details
  const evalMatch = path.match(/^\/api\/evals\/([^\/]+)$/);
  if (evalMatch && method === 'GET') {
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return evalsAPI.getEval(evalMatch[1], workspaceId);
  }

  // PATCH /api/evals/:id - Update eval
  if (evalMatch && method === 'PATCH') {
    const body = await request.json();
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return evalsAPI.updateEval(evalMatch[1], body, workspaceId);
  }

  // DELETE /api/evals/:id - Delete eval
  if (evalMatch && method === 'DELETE') {
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return evalsAPI.deleteEval(evalMatch[1], workspaceId);
  }

  // GET /api/evals/:id/executions - List executions for eval
  const evalExecutionsMatch = path.match(/^\/api\/evals\/([^\/]+)\/executions$/);
  if (evalExecutionsMatch && method === 'GET') {
    return getEvalExecutions(env.DB, evalExecutionsMatch[1], url.searchParams);
  }

  // POST /api/evals/:id/execute - Execute eval
  const evalExecuteMatch = path.match(/^\/api\/evals\/([^\/]+)\/execute$/);
  if (evalExecuteMatch && method === 'POST') {
    const body = await request.json();
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return evalsAPI.executeEval(evalExecuteMatch[1], workspaceId, body);
  }

  // POST /api/evals/:id/playground - Run eval in playground
  const evalPlaygroundMatch = path.match(/^\/api\/evals\/([^\/]+)\/playground$/);
  if (evalPlaygroundMatch && method === 'POST') {
    const body = await request.json();
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return evalsAPI.playgroundRun(evalPlaygroundMatch[1], workspaceId, body);
  }

  // POST /api/agents/:id/generate-eval - Generate eval from agent traces
  const generateEvalMatch = path.match(/^\/api\/agents\/([^\/]+)\/generate-eval$/);
  if (generateEvalMatch && method === 'POST') {
    const body = await request.json();
    const workspaceId = request.headers.get('X-Workspace-Id') || 'workspace_default';
    return evalsAPI.generateEval(generateEvalMatch[1], workspaceId, body);
  }

  // ============================================================================
  // Eval Execution Endpoints
  // ============================================================================

  // GET /api/eval-executions/:trace_id/:eval_id - Get specific execution detail
  const evalExecutionDetailMatch = path.match(/^\/api\/eval-executions\/([^\/]+)\/([^\/]+)$/);
  if (evalExecutionDetailMatch && method === 'GET') {
    return getEvalExecutionDetail(env.DB, evalExecutionDetailMatch[1], evalExecutionDetailMatch[2]);
  }

  // ============================================================================
  // Monitoring Endpoints
  // ============================================================================

  // GET /api/evals/:id/metrics - Get current performance metrics
  const metricsMatch = path.match(/^\/api\/evals\/([^\/]+)\/metrics$/);
  if (metricsMatch && method === 'GET') {
    return getEvalMetrics(request, env, metricsMatch[1]);
  }

  // GET /api/evals/:id/performance-trend - Get historical snapshots
  const trendMatch = path.match(/^\/api\/evals\/([^\/]+)\/performance-trend$/);
  if (trendMatch && method === 'GET') {
    return getPerformanceTrend(request, env, trendMatch[1]);
  }

  // GET /api/evals/:id/alerts - Get performance alerts
  const alertsMatch = path.match(/^\/api\/evals\/([^\/]+)\/alerts$/);
  if (alertsMatch && method === 'GET') {
    return getEvalAlerts(request, env, alertsMatch[1]);
  }

  // POST /api/evals/:id/alerts/:alertId/acknowledge - Acknowledge alert
  const acknowledgeMatch = path.match(/^\/api\/evals\/([^\/]+)\/alerts\/([^\/]+)\/acknowledge$/);
  if (acknowledgeMatch && method === 'POST') {
    return acknowledgeAlert(request, env, acknowledgeMatch[1], acknowledgeMatch[2]);
  }

  // POST /api/evals/:id/alerts/:alertId/resolve - Resolve alert
  const resolveMatch = path.match(/^\/api\/evals\/([^\/]+)\/alerts\/([^\/]+)\/resolve$/);
  if (resolveMatch && method === 'POST') {
    return resolveAlert(request, env, resolveMatch[1], resolveMatch[2]);
  }

  // PATCH /api/evals/:id/settings - Update monitoring settings
  const settingsMatch = path.match(/^\/api\/evals\/([^\/]+)\/settings$/);
  if (settingsMatch && method === 'PATCH') {
    return updateEvalSettings(request, env, settingsMatch[1]);
  }

  // GET /api/evals/:id/refinement-history - Get auto-refinement audit log
  const refinementMatch = path.match(/^\/api\/evals\/([^\/]+)\/refinement-history$/);
  if (refinementMatch && method === 'GET') {
    return getRefinementHistory(request, env, refinementMatch[1]);
  }

  // ============================================================================
  // Agents Endpoints
  // ============================================================================

  // POST /api/agents/discover - must come BEFORE /api/agents POST
  if (path === '/api/agents/discover' && method === 'POST') {
    return discoverAgents(request, env);
  }

  // POST /api/agents
  if (path === '/api/agents' && method === 'POST') {
    return createAgent(request, env);
  }

  // GET /api/agents
  if (path === '/api/agents' && method === 'GET') {
    return listAgents(request, env);
  }

  // GET /api/agents/:id/prompt (must come before generic :id match)
  const agentPromptMatch = path.match(/^\/api\/agents\/([^\/]+)\/prompt$/);
  if (agentPromptMatch && method === 'GET') {
    return getAgentPrompt(request, env, agentPromptMatch[1]);
  }

  // POST /api/agents/:id/confirm
  const agentConfirmMatch = path.match(/^\/api\/agents\/([^\/]+)\/confirm$/);
  if (agentConfirmMatch && method === 'POST') {
    return confirmAgent(request, env, agentConfirmMatch[1]);
  }

  // POST /api/agents/:id/improve
  const agentImproveMatch = path.match(/^\/api\/agents\/([^\/]+)\/improve$/);
  if (agentImproveMatch && method === 'POST') {
    return improveAgent(request, env, agentImproveMatch[1]);
  }

  // GET /api/agents/:id/versions
  const agentVersionsMatch = path.match(/^\/api\/agents\/([^\/]+)\/versions$/);
  if (agentVersionsMatch && method === 'GET') {
    return listAgentVersions(request, env, agentVersionsMatch[1]);
  }

  // POST /api/agents/:id/versions
  if (agentVersionsMatch && method === 'POST') {
    return createAgentVersion(request, env, agentVersionsMatch[1]);
  }

  // GET /api/agents/:id/versions/:version
  const agentVersionMatch = path.match(/^\/api\/agents\/([^\/]+)\/versions\/([^\/]+)$/);
  if (agentVersionMatch && method === 'GET') {
    return getAgentVersion(request, env, agentVersionMatch[1], agentVersionMatch[2]);
  }

  // POST /api/agents/:id/versions/:version/promote
  const agentVersionPromoteMatch = path.match(/^\/api\/agents\/([^\/]+)\/versions\/([^\/]+)\/promote$/);
  if (agentVersionPromoteMatch && method === 'POST') {
    return promoteAgentVersion(request, env, agentVersionPromoteMatch[1], agentVersionPromoteMatch[2]);
  }

  // POST /api/agents/:id/versions/:version/reject
  const agentVersionRejectMatch = path.match(/^\/api\/agents\/([^\/]+)\/versions\/([^\/]+)\/reject$/);
  if (agentVersionRejectMatch && method === 'POST') {
    return rejectAgentVersion(request, env, agentVersionRejectMatch[1], agentVersionRejectMatch[2]);
  }

  // GET /api/agents/:id/matrix - Get comparison matrix
  const agentMatrixMatch = path.match(/^\/api\/agents\/([^\/]+)\/matrix$/);
  if (agentMatrixMatch && method === 'GET') {
    return getComparisonMatrix(env.DB, agentMatrixMatch[1], url.searchParams);
  }

  // GET /api/agents/:id
  const agentMatch = path.match(/^\/api\/agents\/([^\/]+)$/);
  if (agentMatch && method === 'GET') {
    return getAgentById(request, env, agentMatch[1]);
  }

  // PATCH /api/agents/:id
  if (agentMatch && method === 'PATCH') {
    return updateAgent(request, env, agentMatch[1]);
  }

  // DELETE /api/agents/:id
  if (agentMatch && method === 'DELETE') {
    return deleteAgent(request, env, agentMatch[1]);
  }

  // ============================================================================
  // Playground Endpoints
  // ============================================================================

  // POST /api/agents/:id/playground/chat - Stream chat responses
  const playgroundChatMatch = path.match(/^\/api\/agents\/([^\/]+)\/playground\/chat$/);
  if (playgroundChatMatch && method === 'POST') {
    return playgroundChat(request, env, playgroundChatMatch[1]);
  }

  // GET /api/agents/:id/playground/sessions - List sessions
  const playgroundSessionsMatch = path.match(/^\/api\/agents\/([^\/]+)\/playground\/sessions$/);
  if (playgroundSessionsMatch && method === 'GET') {
    return listPlaygroundSessions(request, env, playgroundSessionsMatch[1]);
  }

  // GET /api/agents/:id/playground/sessions/:sessionId - Get session
  const playgroundSessionMatch = path.match(/^\/api\/agents\/([^\/]+)\/playground\/sessions\/([^\/]+)$/);
  if (playgroundSessionMatch && method === 'GET') {
    return getPlaygroundSession(request, env, playgroundSessionMatch[1], playgroundSessionMatch[2]);
  }

  // DELETE /api/agents/:id/playground/sessions/:sessionId - Delete session
  if (playgroundSessionMatch && method === 'DELETE') {
    return deletePlaygroundSession(request, env, playgroundSessionMatch[1], playgroundSessionMatch[2]);
  }

  // GET /api/playground/sessions - List all sessions across all agents
  if (path === '/api/playground/sessions' && method === 'GET') {
    return listAllPlaygroundSessions(request, env);
  }

  // ============================================================================
  // Eval Generation Endpoints (GEPA Flow)
  // ============================================================================

  // POST /api/agents/:id/tasks/extract - Extract tasks from traces
  const extractTasksMatch = path.match(/^\/api\/agents\/([^\/]+)\/tasks\/extract$/);
  if (extractTasksMatch && method === 'POST') {
    return extractTasks(request, env, extractTasksMatch[1]);
  }

  // GET /api/agents/:id/tasks - List extracted tasks
  const listTasksMatch = path.match(/^\/api\/agents\/([^\/]+)\/tasks$/);
  if (listTasksMatch && method === 'GET') {
    return listTasks(request, env, listTasksMatch[1]);
  }

  // POST /api/agents/:id/evals/generate - Generate candidate evals
  const generateEvalsMatch = path.match(/^\/api\/agents\/([^\/]+)\/evals\/generate$/);
  if (generateEvalsMatch && method === 'POST') {
    return generateEvals(request, env, generateEvalsMatch[1]);
  }

  // POST /api/agents/:id/evals/test - Test candidate evals
  const testEvalsMatch = path.match(/^\/api\/agents\/([^\/]+)\/evals\/test$/);
  if (testEvalsMatch && method === 'POST') {
    return testEvalCandidates(request, env, testEvalsMatch[1]);
  }

  // POST /api/agents/:id/evals/select-winner - Select and activate winner
  const selectWinnerMatch = path.match(/^\/api\/agents\/([^\/]+)\/evals\/select-winner$/);
  if (selectWinnerMatch && method === 'POST') {
    return selectWinner(request, env, selectWinnerMatch[1]);
  }

  // POST /api/agents/:id/evals/:evalId/activate - Activate specific eval
  const activateEvalMatch = path.match(/^\/api\/agents\/([^\/]+)\/evals\/([^\/]+)\/activate$/);
  if (activateEvalMatch && method === 'POST') {
    return activateEval(request, env, activateEvalMatch[1], activateEvalMatch[2]);
  }

  // GET /api/agents/:id/evals/active - Get active eval
  const activeEvalMatch = path.match(/^\/api\/agents\/([^\/]+)\/evals\/active$/);
  if (activeEvalMatch && method === 'GET') {
    return getActiveEval(request, env, activeEvalMatch[1]);
  }

  // ============================================================================
  // Tools Endpoints
  // ============================================================================

  // GET /api/tools - List all available tools
  if (path === '/api/tools' && method === 'GET') {
    return listTools(request, env);
  }

  // GET /api/tools/:id - Get tool details
  const toolMatch = path.match(/^\/api\/tools\/([^\/]+)$/);
  if (toolMatch && method === 'GET') {
    return getToolById(request, env, toolMatch[1]);
  }

  // GET /api/agents/:agentId/tools - Get tools for agent
  const agentToolsMatch = path.match(/^\/api\/agents\/([^\/]+)\/tools$/);
  if (agentToolsMatch && method === 'GET') {
    return getAgentTools(request, env, agentToolsMatch[1]);
  }

  // POST /api/agents/:agentId/tools - Attach tool to agent
  if (agentToolsMatch && method === 'POST') {
    return attachToolToAgent(request, env, agentToolsMatch[1]);
  }

  // DELETE /api/agents/:agentId/tools/:toolId - Detach tool from agent
  const agentToolDetachMatch = path.match(/^\/api\/agents\/([^\/]+)\/tools\/([^\/]+)$/);
  if (agentToolDetachMatch && method === 'DELETE') {
    return detachToolFromAgent(request, env, agentToolDetachMatch[1], agentToolDetachMatch[2]);
  }

  // ============================================================================
  // Tasksets Endpoints
  // ============================================================================

  // POST /api/agents/:agentId/tasksets/from-traces - Create taskset from labeled traces
  const tasksetFromTracesMatch = path.match(/^\/api\/agents\/([^\/]+)\/tasksets\/from-traces$/);
  if (tasksetFromTracesMatch && method === 'POST') {
    return createTasksetFromTraces(request, env, tasksetFromTracesMatch[1]);
  }

  // GET /api/agents/:agentId/tasksets - List tasksets for agent
  const tasksetsListMatch = path.match(/^\/api\/agents\/([^\/]+)\/tasksets$/);
  if (tasksetsListMatch && method === 'GET') {
    return listTasksets(request, env, tasksetsListMatch[1]);
  }

  // POST /api/agents/:agentId/tasksets - Create new taskset
  if (tasksetsListMatch && method === 'POST') {
    return createTaskset(request, env, tasksetsListMatch[1]);
  }

  // POST /api/agents/:agentId/tasksets/:tasksetId/tasks - Add tasks to taskset
  const tasksetTasksMatch = path.match(/^\/api\/agents\/([^\/]+)\/tasksets\/([^\/]+)\/tasks$/);
  if (tasksetTasksMatch && method === 'POST') {
    return addTasksToTaskset(request, env, tasksetTasksMatch[1], tasksetTasksMatch[2]);
  }

  // GET /api/agents/:agentId/tasksets/:tasksetId - Get taskset with tasks
  const tasksetDetailMatch = path.match(/^\/api\/agents\/([^\/]+)\/tasksets\/([^\/]+)$/);
  if (tasksetDetailMatch && method === 'GET') {
    return getTaskset(request, env, tasksetDetailMatch[1], tasksetDetailMatch[2]);
  }

  // DELETE /api/agents/:agentId/tasksets/:tasksetId - Archive taskset
  if (tasksetDetailMatch && method === 'DELETE') {
    return archiveTaskset(request, env, tasksetDetailMatch[1], tasksetDetailMatch[2]);
  }

  // POST /api/agents/:agentId/tasksets/:tasksetId/run - Start taskset run
  const tasksetRunMatch = path.match(/^\/api\/agents\/([^\/]+)\/tasksets\/([^\/]+)\/run$/);
  if (tasksetRunMatch && method === 'POST') {
    return runTaskset(request, env, tasksetRunMatch[1], tasksetRunMatch[2]);
  }

  // GET /api/agents/:agentId/tasksets/:tasksetId/runs - List runs for taskset
  const tasksetRunsListMatch = path.match(/^\/api\/agents\/([^\/]+)\/tasksets\/([^\/]+)\/runs$/);
  if (tasksetRunsListMatch && method === 'GET') {
    return listTasksetRuns(request, env, tasksetRunsListMatch[1], tasksetRunsListMatch[2]);
  }

  // GET /api/agents/:agentId/tasksets/:tasksetId/runs/:runId - Get run status with results
  const tasksetRunDetailMatch = path.match(/^\/api\/agents\/([^\/]+)\/tasksets\/([^\/]+)\/runs\/([^\/]+)$/);
  if (tasksetRunDetailMatch && method === 'GET') {
    return getTasksetRun(request, env, tasksetRunDetailMatch[1], tasksetRunDetailMatch[2], tasksetRunDetailMatch[3]);
  }

  // ============================================================================
  // GEPA Optimization Endpoints
  // ============================================================================

  // POST /api/agents/:id/gepa/start - Start GEPA optimization
  const gepaStartMatch = path.match(/^\/api\/agents\/([^\/]+)\/gepa\/start$/);
  if (gepaStartMatch && method === 'POST') {
    return startGEPAOptimization(request, env, gepaStartMatch[1]);
  }

  // GET /api/agents/:id/gepa/runs - List GEPA runs for agent
  const gepaRunsListMatch = path.match(/^\/api\/agents\/([^\/]+)\/gepa\/runs$/);
  if (gepaRunsListMatch && method === 'GET') {
    return listGEPARuns(request, env, gepaRunsListMatch[1]);
  }

  // GET /api/agents/:id/gepa/runs/:runId/stream - Stream GEPA run progress
  const gepaRunStreamMatch = path.match(/^\/api\/agents\/([^\/]+)\/gepa\/runs\/([^\/]+)\/stream$/);
  if (gepaRunStreamMatch && method === 'GET') {
    return streamGEPAProgress(request, env, gepaRunStreamMatch[1], gepaRunStreamMatch[2]);
  }

  // GET /api/agents/:id/gepa/runs/:runId - Get GEPA run status
  const gepaRunStatusMatch = path.match(/^\/api\/agents\/([^\/]+)\/gepa\/runs\/([^\/]+)$/);
  if (gepaRunStatusMatch && method === 'GET') {
    return getGEPARunStatus(request, env, gepaRunStatusMatch[1], gepaRunStatusMatch[2]);
  }

  // ============================================================================
  // Internal APIs (GEPA Integration)
  // ============================================================================

  // GET /api/internal/rollouts/batches - List rollout batches
  if (path === '/api/internal/rollouts/batches' && method === 'GET') {
    return listRolloutBatches(request, env);
  }

  // POST /api/internal/rollouts/batch - Create batch rollout request
  if (path === '/api/internal/rollouts/batch' && method === 'POST') {
    return createBatchRollout(request, env);
  }

  // GET /api/internal/rollouts/batch/:batchId - Get batch status
  const batchStatusMatch = path.match(/^\/api\/internal\/rollouts\/batch\/([^\/]+)$/);
  if (batchStatusMatch && method === 'GET') {
    return getBatchStatus(request, env, batchStatusMatch[1]);
  }

    // ============================================================================
    // Not Found
    // ============================================================================

    return createErrorResponse(
      'NOT_FOUND',
      `Endpoint ${method} ${path} not found`,
      404
    );
  } catch (error) {
    // Log the error with full context and stack trace
    const durationMs = Date.now() - startTime;
    logger.error(
      `Unhandled error in API router: ${method} ${path}`,
      { method, path, workspaceId, durationMs },
      error
    );

    // Return a proper error response
    return handleError(error, request, { workspaceId });
  }
}
