/**
 * iofold.com API Client SDK - Main Entry Point
 *
 * @example
 * ```typescript
 * import { IofoldClient, IofoldAPIError } from '@/client';
 *
 * const client = new IofoldClient(
 *   'https://api.iofold.com/v1',
 *   'your_token',
 *   'workspace_id'
 * );
 * ```
 */

export {
  IofoldClient,
  IofoldAPIError,
  FeedbackQueue,
  // Types
  type Trace,
  type TraceSummary,
  type ExecutionStep,
  type Message,
  type ToolCall,
  type Agent,
  type EvalSummary,
  type Feedback,
  type Eval,
  type TestResults,
  type TestCaseResult,
  type EvalExecution,
  type EvalExecutionWithContext,
  type MatrixRow,
  type MatrixStats,
  type Job,
  type Integration,
  type PaginatedResponse,
  type PaginatedResponseWithCount,
  type SSEEvent,
  // Request types
  type CreateIntegrationRequest,
  type ImportTracesRequest,
  type SubmitFeedbackRequest,
  type UpdateFeedbackRequest,
  type GenerateEvalRequest,
  type UpdateEvalRequest,
  type ExecuteEvalRequest,
} from './api-client';
