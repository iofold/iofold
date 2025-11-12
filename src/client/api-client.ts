/**
 * iofold.com API Client SDK
 *
 * Type-safe TypeScript client for the iofold.com API.
 * Supports all endpoints, SSE streaming, pagination, and optimistic feedback queuing.
 *
 * @example
 * ```typescript
 * const client = new IofoldClient('https://api.iofold.com/v1', 'your_jwt_token', 'workspace_id');
 *
 * // List traces
 * const traces = await client.traces.list({ limit: 50 });
 *
 * // Create eval set and submit feedback
 * const evalSet = await client.evalSets.create({ name: 'quality-check' });
 * await client.feedback.submit({ trace_id: 'trace_1', eval_set_id: evalSet.id, rating: 'positive' });
 *
 * // Generate eval with SSE progress
 * const job = await client.evals.generate(evalSet.id, { name: 'quality_check' });
 * for await (const event of client.jobs.stream(job.job_id)) {
 *   console.log('Progress:', event.progress);
 * }
 * ```
 */

// ============================================================================
// Core Types (from API spec)
// ============================================================================

interface Trace {
  id: string;
  trace_id: string;
  source: 'langfuse' | 'langsmith' | 'openai';
  timestamp: string; // ISO 8601
  metadata: Record<string, any>;
  steps: ExecutionStep[];
  feedback?: Feedback;
}

interface TraceSummary {
  id: string;
  trace_id: string;
  source: string;
  timestamp: string;
  step_count: number;
  feedback?: Feedback;
  summary: {
    input_preview: string;
    output_preview: string;
    has_errors: boolean;
  };
}

interface ExecutionStep {
  step_id: string;
  timestamp: string;
  messages_added: Message[];
  tool_calls: ToolCall[];
  input: any;
  output: any;
  error?: string;
  metadata: Record<string, any>;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
}

interface ToolCall {
  tool_name: string;
  arguments: Record<string, any>;
  result?: any;
  error?: string;
}

interface EvalSet {
  id: string;
  name: string;
  description: string | null;
  minimum_examples: number;
  stats: {
    positive_count: number;
    negative_count: number;
    neutral_count: number;
    total_count: number;
  };
  created_at: string;
  updated_at: string;
}

interface EvalSetWithEvals extends EvalSet {
  evals: EvalSummary[];
}

interface EvalSummary {
  id: string;
  name: string;
  accuracy: number;
  created_at: string;
}

interface Feedback {
  id: string;
  trace_id: string;
  eval_set_id: string;
  rating: 'positive' | 'negative' | 'neutral';
  notes: string | null;
  created_at: string;
}

interface Eval {
  id: string;
  name: string;
  description: string | null;
  eval_set_id: string;
  code: string;
  model_used: string;
  accuracy: number;
  test_results: TestResults;
  execution_count: number;
  contradiction_count: number;
  created_at: string;
  updated_at: string;
}

interface TestResults {
  correct: number;
  incorrect: number;
  errors: number;
  total: number;
  details: TestCaseResult[];
}

interface TestCaseResult {
  trace_id: string;
  expected: boolean;
  predicted: boolean;
  match: boolean;
  reason: string;
  execution_time_ms: number;
  error?: string;
}

interface EvalExecution {
  trace_id: string;
  eval_id: string;
  result: boolean;
  reason: string;
  execution_time_ms: number;
  error?: string;
  stdout?: string;
  stderr?: string;
  executed_at: string;
}

interface EvalExecutionWithContext extends EvalExecution {
  human_feedback?: Feedback;
  is_contradiction: boolean;
}

interface MatrixRow {
  trace_id: string;
  trace_summary: {
    timestamp: string;
    input_preview: string;
    output_preview: string;
    source: string;
  };
  human_feedback: {
    rating: 'positive' | 'negative' | 'neutral';
    notes: string | null;
  } | null;
  predictions: {
    [eval_id: string]: {
      result: boolean;
      reason: string;
      execution_time_ms: number;
      error?: string;
      is_contradiction: boolean;
    } | null;
  };
}

interface MatrixStats {
  total_traces: number;
  traces_with_feedback: number;
  per_eval: {
    [eval_id: string]: {
      eval_name: string;
      accuracy: number | null;
      contradiction_count: number;
      error_count: number;
      avg_execution_time_ms: number | null;
    };
  };
}

interface Job {
  id: string;
  type: 'import' | 'generate' | 'execute';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result?: any;
  error?: string;
}

interface Integration {
  id: string;
  platform: 'langfuse' | 'langsmith' | 'openai';
  name: string;
  status: 'active' | 'error';
  error_message?: string;
  last_synced_at: string | null;
  created_at: string;
}

interface PaginatedResponse<T> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
}

interface PaginatedResponseWithCount<T> extends PaginatedResponse<T> {
  total_count: number;
}

interface APIError {
  error: {
    code: string;
    message: string;
    details?: any;
    request_id: string;
  };
}

type SSEEvent =
  | { type: 'job_progress'; job_id: string; status: string; progress: number; [key: string]: any }
  | { type: 'job_completed'; job_id: string; result: any }
  | { type: 'job_failed'; job_id: string; error: string }
  | { type: 'feedback_added'; trace_id: string; rating: string; stats: any }
  | { type: 'threshold_reached'; ready_to_generate: boolean }
  | { type: 'eval_generated'; eval_id: string; accuracy: number }
  | { type: 'execution_completed'; eval_id: string; trace_id: string };

// Request types
interface CreateIntegrationRequest {
  platform: 'langfuse' | 'langsmith' | 'openai';
  api_key: string;
  base_url?: string;
  name?: string;
}

interface ImportTracesRequest {
  integration_id: string;
  filters?: {
    date_from?: string;
    date_to?: string;
    tags?: string[];
    user_ids?: string[];
    limit?: number;
  };
}

interface CreateEvalSetRequest {
  name: string;
  description?: string;
  minimum_examples?: number;
}

interface UpdateEvalSetRequest {
  name?: string;
  description?: string;
  minimum_examples?: number;
}

interface SubmitFeedbackRequest {
  trace_id: string;
  eval_set_id: string;
  rating: 'positive' | 'negative' | 'neutral';
  notes?: string;
}

interface UpdateFeedbackRequest {
  rating?: 'positive' | 'negative' | 'neutral';
  notes?: string;
}

interface GenerateEvalRequest {
  name: string;
  description?: string;
  model?: string;
  custom_instructions?: string;
}

interface UpdateEvalRequest {
  name?: string;
  description?: string;
  code?: string;
}

interface ExecuteEvalRequest {
  trace_ids?: string[];
  force?: boolean;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Custom error class for API errors
 */
export class IofoldAPIError extends Error {
  public readonly code: string;
  public readonly details?: any;
  public readonly requestId: string;
  public readonly status: number;

  constructor(status: number, response: APIError) {
    super(response.error.message);
    this.name = 'IofoldAPIError';
    this.code = response.error.code;
    this.details = response.error.details;
    this.requestId = response.error.request_id;
    this.status = status;
  }

  /**
   * Check if error is retryable (network, rate limit, service unavailable)
   */
  isRetryable(): boolean {
    return this.status === 429 || this.status === 503 || this.code === 'ECONNREFUSED';
  }
}

// ============================================================================
// SSE Helper
// ============================================================================

/**
 * SSE connection manager with auto-reconnection
 */
class SSEConnection {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  constructor(
    private url: string,
    private headers: Record<string, string>
  ) {}

  /**
   * Connect to SSE endpoint
   */
  connect(): void {
    // Note: EventSource doesn't support custom headers in browsers
    // For auth, token must be in URL or use polyfill
    // This implementation assumes token in URL query param
    const urlWithAuth = new URL(this.url);

    this.eventSource = new EventSource(urlWithAuth.toString());

    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0;
      console.log('[SSE] Connected to', this.url);
    };

    this.eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
      this.eventSource?.close();
      this.attemptReconnect();
    };

    // Register listeners
    this.listeners.forEach((callbacks, eventType) => {
      this.eventSource!.addEventListener(eventType, (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        callbacks.forEach(cb => cb(data));
      });
    });
  }

  /**
   * Add event listener
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);

    // If already connected, add listener to existing connection
    if (this.eventSource) {
      this.eventSource.addEventListener(event, (e: MessageEvent) => {
        callback(JSON.parse(e.data));
      });
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SSE] Max reconnection attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }

  /**
   * Close connection
   */
  close(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }
}

// ============================================================================
// Pagination Helper
// ============================================================================

/**
 * Async iterator for paginated results
 */
class PaginatedIterator<T> implements AsyncIterable<T> {
  constructor(
    private fetchFn: (cursor?: string) => Promise<PaginatedResponse<T>>
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.fetchFn(cursor);

      for (const item of response.data) {
        yield item;
      }

      hasMore = response.has_more;
      cursor = response.next_cursor || undefined;
    }
  }

  /**
   * Fetch all items into array (use with caution for large datasets)
   */
  async toArray(): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) {
      items.push(item);
    }
    return items;
  }
}

// ============================================================================
// Optimistic Feedback Queue
// ============================================================================

/**
 * Queue for optimistic feedback submission with auto-retry
 */
export class FeedbackQueue {
  private queue: SubmitFeedbackRequest[] = [];
  private processing = false;
  private onUpdate?: (feedback: SubmitFeedbackRequest, status: 'pending' | 'synced' | 'error') => void;

  constructor(
    private submitFn: (feedback: SubmitFeedbackRequest) => Promise<Feedback>,
    onUpdate?: (feedback: SubmitFeedbackRequest, status: 'pending' | 'synced' | 'error') => void
  ) {
    this.onUpdate = onUpdate;
  }

  /**
   * Submit feedback (optimistically updates UI immediately)
   */
  async submit(feedback: SubmitFeedbackRequest): Promise<void> {
    // Update UI immediately
    this.onUpdate?.(feedback, 'pending');

    // Add to queue
    this.queue.push(feedback);

    // Start processing if not already
    if (!this.processing) {
      this.process();
    }
  }

  /**
   * Process queue with retry logic
   */
  private async process(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const feedback = this.queue[0];

      try {
        await this.submitFn(feedback);
        this.queue.shift(); // Remove on success
        this.onUpdate?.(feedback, 'synced');
      } catch (error) {
        if (error instanceof IofoldAPIError && error.isRetryable()) {
          // Wait and retry
          await this.sleep(2000);
          continue;
        } else {
          // Permanent failure, remove from queue
          console.error('[FeedbackQueue] Failed to submit:', error);
          this.onUpdate?.(feedback, 'error');
          this.queue.shift();
        }
      }
    }

    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get pending count
   */
  getPendingCount(): number {
    return this.queue.length;
  }
}

// ============================================================================
// Main API Client
// ============================================================================

/**
 * iofold.com API Client
 *
 * @example
 * ```typescript
 * const client = new IofoldClient(
 *   'https://api.iofold.com/v1',
 *   'your_jwt_token',
 *   'workspace_abc123'
 * );
 *
 * // Use resource methods
 * const traces = await client.traces.list();
 * const evalSet = await client.evalSets.create({ name: 'quality' });
 * ```
 */
export class IofoldClient {
  public readonly integrations: IntegrationsAPI;
  public readonly traces: TracesAPI;
  public readonly evalSets: EvalSetsAPI;
  public readonly feedback: FeedbackAPI;
  public readonly evals: EvalsAPI;
  public readonly matrix: MatrixAPI;
  public readonly jobs: JobsAPI;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly workspaceId: string
  ) {
    this.integrations = new IntegrationsAPI(this);
    this.traces = new TracesAPI(this);
    this.evalSets = new EvalSetsAPI(this);
    this.feedback = new FeedbackAPI(this);
    this.evals = new EvalsAPI(this);
    this.matrix = new MatrixAPI(this);
    this.jobs = new JobsAPI(this);
  }

  /**
   * Make authenticated API request
   */
  async request<T>(
    method: string,
    path: string,
    body?: any,
    params?: Record<string, any>
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    // Add query params
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      'X-Workspace-Id': this.workspaceId,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle error responses
    if (!response.ok) {
      const errorData: APIError = await response.json();
      throw new IofoldAPIError(response.status, errorData);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  /**
   * Create SSE connection (used internally by job streaming)
   */
  createSSEConnection(path: string): SSEConnection {
    const url = new URL(path, this.baseUrl);
    // Add auth token to URL (EventSource doesn't support headers)
    url.searchParams.append('token', this.token);
    url.searchParams.append('workspace_id', this.workspaceId);

    return new SSEConnection(url.toString(), {
      'Authorization': `Bearer ${this.token}`,
      'X-Workspace-Id': this.workspaceId,
    });
  }
}

// ============================================================================
// Integrations API
// ============================================================================

class IntegrationsAPI {
  constructor(private client: IofoldClient) {}

  /**
   * Connect external platform (Langfuse, Langsmith, OpenAI)
   *
   * @example
   * ```typescript
   * const integration = await client.integrations.create({
   *   platform: 'langfuse',
   *   api_key: 'sk_lf_...',
   *   name: 'Production'
   * });
   * ```
   */
  async create(request: CreateIntegrationRequest): Promise<Integration> {
    return this.client.request<Integration>('POST', '/api/integrations', request);
  }

  /**
   * List all integrations for workspace
   */
  async list(): Promise<{ integrations: Integration[] }> {
    return this.client.request<{ integrations: Integration[] }>('GET', '/api/integrations');
  }

  /**
   * Test integration connection
   */
  async test(id: string): Promise<{ status: 'success' | 'error'; error_message?: string }> {
    return this.client.request('POST', `/api/integrations/${id}/test`);
  }

  /**
   * Delete integration
   */
  async delete(id: string): Promise<void> {
    return this.client.request('DELETE', `/api/integrations/${id}`);
  }
}

// ============================================================================
// Traces API
// ============================================================================

class TracesAPI {
  constructor(private client: IofoldClient) {}

  /**
   * Import traces from external platform (async job)
   *
   * @example
   * ```typescript
   * const job = await client.traces.import({
   *   integration_id: 'int_abc',
   *   filters: { date_from: '2025-11-01T00:00:00Z', limit: 100 }
   * });
   *
   * // Monitor progress
   * for await (const event of client.jobs.stream(job.job_id)) {
   *   console.log('Imported:', event.imported, '/', event.total);
   * }
   * ```
   */
  async import(request: ImportTracesRequest): Promise<{ job_id: string; status: string; estimated_count: number }> {
    return this.client.request('POST', '/api/traces/import', request);
  }

  /**
   * List traces with pagination
   *
   * @example
   * ```typescript
   * // Single page
   * const result = await client.traces.list({ limit: 50 });
   *
   * // All pages (async iteration)
   * for await (const trace of client.traces.iterate({ eval_set_id: 'set_abc' })) {
   *   console.log(trace.id);
   * }
   * ```
   */
  async list(params?: {
    eval_set_id?: string;
    source?: string;
    rating?: string;
    has_feedback?: boolean;
    date_from?: string;
    date_to?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    traces: TraceSummary[];
    next_cursor: string | null;
    has_more: boolean;
    total_count: number;
  }> {
    return this.client.request('GET', '/api/traces', undefined, params);
  }

  /**
   * Iterate through all traces (auto-pagination)
   */
  iterate(params?: Omit<Parameters<typeof this.list>[0], 'cursor'>): PaginatedIterator<TraceSummary> {
    return new PaginatedIterator(async (cursor) => {
      const result = await this.list({ ...params, cursor });
      return {
        data: result.traces,
        next_cursor: result.next_cursor,
        has_more: result.has_more,
      };
    });
  }

  /**
   * Get trace details with all steps
   */
  async get(id: string): Promise<Trace> {
    return this.client.request<Trace>('GET', `/api/traces/${id}`);
  }

  /**
   * Delete single trace
   */
  async delete(id: string): Promise<void> {
    return this.client.request('DELETE', `/api/traces/${id}`);
  }

  /**
   * Bulk delete traces
   */
  async bulkDelete(trace_ids: string[]): Promise<{ deleted_count: number }> {
    return this.client.request('DELETE', '/api/traces', { trace_ids });
  }

  /**
   * Get all eval executions for a trace
   */
  async getExecutions(trace_id: string): Promise<{
    executions: Array<{
      eval_id: string;
      eval_name: string;
      result: boolean;
      reason: string;
      execution_time_ms: number;
      error?: string;
      executed_at: string;
    }>;
  }> {
    return this.client.request('GET', `/api/traces/${trace_id}/executions`);
  }
}

// ============================================================================
// Eval Sets API
// ============================================================================

class EvalSetsAPI {
  constructor(private client: IofoldClient) {}

  /**
   * Create new eval set
   *
   * @example
   * ```typescript
   * const evalSet = await client.evalSets.create({
   *   name: 'response-quality',
   *   description: 'Checks if responses are helpful',
   *   minimum_examples: 5
   * });
   * ```
   */
  async create(request: CreateEvalSetRequest): Promise<EvalSet> {
    return this.client.request<EvalSet>('POST', '/api/eval-sets', request);
  }

  /**
   * List all eval sets
   */
  async list(): Promise<{ eval_sets: EvalSet[] }> {
    return this.client.request('GET', '/api/eval-sets');
  }

  /**
   * Get eval set details with associated evals
   */
  async get(id: string): Promise<EvalSetWithEvals> {
    return this.client.request<EvalSetWithEvals>('GET', `/api/eval-sets/${id}`);
  }

  /**
   * Update eval set
   */
  async update(id: string, request: UpdateEvalSetRequest): Promise<EvalSet> {
    return this.client.request<EvalSet>('PATCH', `/api/eval-sets/${id}`, request);
  }

  /**
   * Delete eval set and associated feedback
   */
  async delete(id: string): Promise<void> {
    return this.client.request('DELETE', `/api/eval-sets/${id}`);
  }

  /**
   * Stream real-time updates for eval set (SSE)
   *
   * @example
   * ```typescript
   * const stream = client.evalSets.stream('set_abc');
   *
   * stream.on('feedback_added', (data) => {
   *   console.log('New feedback:', data);
   * });
   *
   * stream.on('threshold_reached', (data) => {
   *   console.log('Ready to generate!');
   * });
   *
   * stream.connect();
   * ```
   */
  stream(id: string): SSEConnection {
    return this.client.createSSEConnection(`/api/eval-sets/${id}/stream`);
  }
}

// ============================================================================
// Feedback API
// ============================================================================

class FeedbackAPI {
  constructor(private client: IofoldClient) {}

  /**
   * Submit feedback for trace
   *
   * @example
   * ```typescript
   * const feedback = await client.feedback.submit({
   *   trace_id: 'trace_abc',
   *   eval_set_id: 'set_xyz',
   *   rating: 'positive',
   *   notes: 'Good response quality'
   * });
   * ```
   */
  async submit(request: SubmitFeedbackRequest): Promise<Feedback> {
    return this.client.request<Feedback>('POST', '/api/feedback', request);
  }

  /**
   * Update existing feedback
   */
  async update(id: string, request: UpdateFeedbackRequest): Promise<Feedback> {
    return this.client.request<Feedback>('PATCH', `/api/feedback/${id}`, request);
  }

  /**
   * Delete feedback
   */
  async delete(id: string): Promise<void> {
    return this.client.request('DELETE', `/api/feedback/${id}`);
  }

  /**
   * Create optimistic feedback queue for batch submission
   *
   * @example
   * ```typescript
   * const queue = client.feedback.createQueue((feedback, status) => {
   *   console.log('Feedback status:', status);
   * });
   *
   * // Submit multiple feedbacks optimistically
   * await queue.submit({ trace_id: 'trace_1', eval_set_id: 'set_1', rating: 'positive' });
   * await queue.submit({ trace_id: 'trace_2', eval_set_id: 'set_1', rating: 'negative' });
   * ```
   */
  createQueue(onUpdate?: (feedback: SubmitFeedbackRequest, status: 'pending' | 'synced' | 'error') => void): FeedbackQueue {
    return new FeedbackQueue((feedback) => this.submit(feedback), onUpdate);
  }
}

// ============================================================================
// Evals API
// ============================================================================

class EvalsAPI {
  constructor(private client: IofoldClient) {}

  /**
   * Generate eval from eval set (async job)
   *
   * @example
   * ```typescript
   * const job = await client.evals.generate('set_abc', {
   *   name: 'response_quality_check',
   *   description: 'Checks response quality'
   * });
   *
   * // Monitor progress
   * for await (const event of client.jobs.stream(job.job_id)) {
   *   if (event.status === 'completed') {
   *     console.log('Eval created:', event.result.eval_id);
   *     console.log('Accuracy:', event.result.accuracy);
   *   }
   * }
   * ```
   */
  async generate(eval_set_id: string, request: GenerateEvalRequest): Promise<{ job_id: string; status: string }> {
    return this.client.request('POST', `/api/eval-sets/${eval_set_id}/generate`, request);
  }

  /**
   * List evals with pagination
   */
  async list(params?: {
    eval_set_id?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    evals: Array<{
      id: string;
      name: string;
      description: string | null;
      eval_set_id: string;
      accuracy: number;
      execution_count: number;
      contradiction_count: number;
      created_at: string;
      updated_at: string;
    }>;
    next_cursor: string | null;
    has_more: boolean;
  }> {
    return this.client.request('GET', '/api/evals', undefined, params);
  }

  /**
   * Iterate through all evals (auto-pagination)
   */
  iterate(params?: Omit<Parameters<typeof this.list>[0], 'cursor'>): PaginatedIterator<any> {
    return new PaginatedIterator(async (cursor) => {
      const result = await this.list({ ...params, cursor });
      return {
        data: result.evals,
        next_cursor: result.next_cursor,
        has_more: result.has_more,
      };
    });
  }

  /**
   * Get eval details including code and test results
   */
  async get(id: string): Promise<Eval> {
    return this.client.request<Eval>('GET', `/api/evals/${id}`);
  }

  /**
   * Update eval (name, description, or code)
   */
  async update(id: string, request: UpdateEvalRequest): Promise<Eval> {
    return this.client.request<Eval>('PATCH', `/api/evals/${id}`, request);
  }

  /**
   * Execute eval against traces (async job)
   *
   * @example
   * ```typescript
   * const job = await client.evals.execute('eval_abc', {
   *   trace_ids: ['trace_1', 'trace_2'],
   *   force: false
   * });
   *
   * // Monitor execution
   * for await (const event of client.jobs.stream(job.job_id)) {
   *   console.log('Progress:', event.completed, '/', event.total);
   * }
   * ```
   */
  async execute(eval_id: string, request?: ExecuteEvalRequest): Promise<{ job_id: string; status: string; estimated_count: number }> {
    return this.client.request('POST', `/api/evals/${eval_id}/execute`, request);
  }

  /**
   * Delete eval and all execution results
   */
  async delete(id: string): Promise<void> {
    return this.client.request('DELETE', `/api/evals/${id}`);
  }

  /**
   * List all executions for eval (paginated)
   */
  async getExecutions(eval_id: string, params?: {
    result?: boolean;
    has_error?: boolean;
    cursor?: string;
    limit?: number;
  }): Promise<{
    executions: Array<{
      id: string;
      trace_id: string;
      result: boolean;
      reason: string;
      execution_time_ms: number;
      error?: string;
      executed_at: string;
      trace_summary: {
        timestamp: string;
        input_preview: string;
        output_preview: string;
      };
    }>;
    next_cursor: string | null;
    has_more: boolean;
  }> {
    return this.client.request('GET', `/api/evals/${eval_id}/executions`, undefined, params);
  }
}

// ============================================================================
// Matrix API
// ============================================================================

class MatrixAPI {
  constructor(private client: IofoldClient) {}

  /**
   * Get comparison matrix for eval set
   *
   * @example
   * ```typescript
   * const matrix = await client.matrix.get('set_abc', {
   *   eval_ids: ['eval_1', 'eval_2', 'eval_3'],
   *   filter: 'contradictions_only',
   *   limit: 50
   * });
   *
   * matrix.rows.forEach(row => {
   *   console.log('Trace:', row.trace_id);
   *   console.log('Human:', row.human_feedback?.rating);
   *   Object.entries(row.predictions).forEach(([evalId, pred]) => {
   *     if (pred?.is_contradiction) {
   *       console.log('Contradiction in', evalId);
   *     }
   *   });
   * });
   * ```
   */
  async get(eval_set_id: string, params: {
    eval_ids: string | string[];
    filter?: 'contradictions_only' | 'errors_only' | 'all';
    rating?: 'positive' | 'negative' | 'neutral';
    date_from?: string;
    date_to?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    rows: MatrixRow[];
    stats: MatrixStats;
    next_cursor: string | null;
    has_more: boolean;
  }> {
    const evalIds = Array.isArray(params.eval_ids) ? params.eval_ids.join(',') : params.eval_ids;
    return this.client.request('GET', `/api/eval-sets/${eval_set_id}/matrix`, undefined, {
      ...params,
      eval_ids: evalIds,
    });
  }

  /**
   * Get specific eval execution result
   */
  async getExecution(trace_id: string, eval_id: string): Promise<EvalExecutionWithContext> {
    return this.client.request<EvalExecutionWithContext>('GET', `/api/eval-executions/${trace_id}/${eval_id}`);
  }
}

// ============================================================================
// Jobs API
// ============================================================================

class JobsAPI {
  constructor(private client: IofoldClient) {}

  /**
   * Get job status
   */
  async get(job_id: string): Promise<Job> {
    return this.client.request<Job>('GET', `/api/jobs/${job_id}`);
  }

  /**
   * Stream job progress (SSE)
   *
   * @example
   * ```typescript
   * // Async iteration
   * for await (const event of client.jobs.stream('job_abc')) {
   *   console.log('Status:', event.status, 'Progress:', event.progress);
   *   if (event.status === 'completed') break;
   * }
   *
   * // Event-based
   * const stream = client.jobs.streamEvents('job_abc');
   * stream.on('progress', (data) => console.log('Progress:', data.progress));
   * stream.on('completed', (data) => console.log('Done:', data.result));
   * stream.connect();
   * ```
   */
  async *stream(job_id: string): AsyncIterableIterator<any> {
    const sse = this.client.createSSEConnection(`/api/jobs/${job_id}/stream`);

    const events: any[] = [];
    let resolveNext: ((value: any) => void) | null = null;
    let isCompleted = false;

    sse.on('progress', (data) => {
      if (resolveNext) {
        resolveNext(data);
        resolveNext = null;
      } else {
        events.push(data);
      }
    });

    sse.on('completed', (data) => {
      isCompleted = true;
      if (resolveNext) {
        resolveNext(data);
        resolveNext = null;
      } else {
        events.push(data);
      }
    });

    sse.on('failed', (data) => {
      isCompleted = true;
      if (resolveNext) {
        resolveNext(data);
        resolveNext = null;
      } else {
        events.push(data);
      }
    });

    sse.connect();

    try {
      while (!isCompleted) {
        if (events.length > 0) {
          yield events.shift();
        } else {
          yield await new Promise<any>((resolve) => {
            resolveNext = resolve;
          });
        }
      }

      // Yield remaining events
      while (events.length > 0) {
        yield events.shift();
      }
    } finally {
      sse.close();
    }
  }

  /**
   * Stream job progress with event-based API (alternative to async iteration)
   */
  streamEvents(job_id: string): SSEConnection {
    return this.client.createSSEConnection(`/api/jobs/${job_id}/stream`);
  }

  /**
   * Cancel running job
   */
  async cancel(job_id: string): Promise<{ id: string; status: string }> {
    return this.client.request('POST', `/api/jobs/${job_id}/cancel`);
  }

  /**
   * List recent jobs
   */
  async list(params?: {
    type?: 'import' | 'generate' | 'execute';
    status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    limit?: number;
  }): Promise<{ jobs: Job[] }> {
    return this.client.request('GET', '/api/jobs', undefined, params);
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  IofoldClient,
  // Types
  type Trace,
  type TraceSummary,
  type ExecutionStep,
  type Message,
  type ToolCall,
  type EvalSet,
  type EvalSetWithEvals,
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
  type CreateEvalSetRequest,
  type UpdateEvalSetRequest,
  type SubmitFeedbackRequest,
  type UpdateFeedbackRequest,
  type GenerateEvalRequest,
  type UpdateEvalRequest,
  type ExecuteEvalRequest,
};
