import type {
  CreateEvalSetRequest,
  CreateIntegrationRequest,
  Eval,
  EvalSet,
  EvalSetWithEvals,
  ExecuteEvalRequest,
  Feedback,
  GenerateEvalRequest,
  ImportTracesRequest,
  Integration,
  Job,
  JobResponse,
  ListEvalsResponse,
  ListIntegrationsResponse,
  ListTracesResponse,
  MatrixResponse,
  SubmitFeedbackRequest,
  Trace,
  UpdateEvalRequest,
  UpdateEvalSetRequest,
  UpdateFeedbackRequest,
} from '@/types/api'

class APIClient {
  private baseURL: string
  private token: string | null = null
  private workspaceId: string | null = null

  constructor(baseURL?: string) {
    this.baseURL = baseURL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/v1'
  }

  setAuth(token: string, workspaceId: string) {
    this.token = token
    this.workspaceId = workspaceId
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    if (this.workspaceId) {
      headers['X-Workspace-Id'] = this.workspaceId
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new APIError(error, response.status)
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T
    }

    return response.json()
  }

  // ============================================================================
  // Integrations
  // ============================================================================

  async createIntegration(data: CreateIntegrationRequest): Promise<Integration> {
    return this.request('/api/integrations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listIntegrations(): Promise<ListIntegrationsResponse> {
    return this.request('/api/integrations')
  }

  async testIntegration(id: string): Promise<{ status: string; error_message?: string }> {
    return this.request(`/api/integrations/${id}/test`, {
      method: 'POST',
    })
  }

  async deleteIntegration(id: string): Promise<void> {
    return this.request(`/api/integrations/${id}`, {
      method: 'DELETE',
    })
  }

  // ============================================================================
  // Traces
  // ============================================================================

  async importTraces(data: ImportTracesRequest): Promise<JobResponse> {
    return this.request('/api/traces/import', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listTraces(params?: {
    eval_set_id?: string
    source?: string
    rating?: string
    has_feedback?: boolean
    date_from?: string
    date_to?: string
    cursor?: string
    limit?: number
  }): Promise<ListTracesResponse> {
    const query = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          query.append(key, String(value))
        }
      })
    }
    return this.request(`/api/traces?${query.toString()}`)
  }

  async getTrace(id: string): Promise<Trace> {
    return this.request(`/api/traces/${id}`)
  }

  async deleteTrace(id: string): Promise<void> {
    return this.request(`/api/traces/${id}`, {
      method: 'DELETE',
    })
  }

  async deleteTraces(trace_ids: string[]): Promise<{ deleted_count: number }> {
    return this.request('/api/traces', {
      method: 'DELETE',
      body: JSON.stringify({ trace_ids }),
    })
  }

  // ============================================================================
  // Eval Sets
  // ============================================================================

  async createEvalSet(data: CreateEvalSetRequest): Promise<EvalSet> {
    return this.request('/api/eval-sets', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listEvalSets(): Promise<{ eval_sets: EvalSet[] }> {
    return this.request('/api/eval-sets')
  }

  async getEvalSet(id: string): Promise<EvalSetWithEvals> {
    return this.request(`/api/eval-sets/${id}`)
  }

  async updateEvalSet(id: string, data: UpdateEvalSetRequest): Promise<EvalSet> {
    return this.request(`/api/eval-sets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteEvalSet(id: string): Promise<void> {
    return this.request(`/api/eval-sets/${id}`, {
      method: 'DELETE',
    })
  }

  // ============================================================================
  // Feedback
  // ============================================================================

  async submitFeedback(data: SubmitFeedbackRequest): Promise<Feedback> {
    return this.request('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateFeedback(id: string, data: UpdateFeedbackRequest): Promise<Feedback> {
    return this.request(`/api/feedback/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteFeedback(id: string): Promise<void> {
    return this.request(`/api/feedback/${id}`, {
      method: 'DELETE',
    })
  }

  // ============================================================================
  // Evals
  // ============================================================================

  async generateEval(evalSetId: string, data: GenerateEvalRequest): Promise<JobResponse> {
    return this.request(`/api/eval-sets/${evalSetId}/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listEvals(params?: {
    eval_set_id?: string
    cursor?: string
    limit?: number
  }): Promise<ListEvalsResponse> {
    const query = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          query.append(key, String(value))
        }
      })
    }
    return this.request(`/api/evals?${query.toString()}`)
  }

  async getEval(id: string): Promise<Eval> {
    return this.request(`/api/evals/${id}`)
  }

  async updateEval(id: string, data: UpdateEvalRequest): Promise<Eval> {
    return this.request(`/api/evals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteEval(id: string): Promise<void> {
    return this.request(`/api/evals/${id}`, {
      method: 'DELETE',
    })
  }

  async executeEval(evalId: string, data?: ExecuteEvalRequest): Promise<JobResponse> {
    return this.request(`/api/evals/${evalId}/execute`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    })
  }

  // ============================================================================
  // Matrix
  // ============================================================================

  async getMatrix(
    evalSetId: string,
    params: {
      eval_ids: string
      filter?: 'contradictions_only' | 'errors_only' | 'all'
      rating?: string
      date_from?: string
      date_to?: string
      cursor?: string
      limit?: number
    }
  ): Promise<MatrixResponse> {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        query.append(key, String(value))
      }
    })
    return this.request(`/api/eval-sets/${evalSetId}/matrix?${query.toString()}`)
  }

  // ============================================================================
  // Jobs
  // ============================================================================

  async getJob(jobId: string): Promise<Job> {
    return this.request(`/api/jobs/${jobId}`)
  }

  async cancelJob(jobId: string): Promise<Job> {
    return this.request(`/api/jobs/${jobId}/cancel`, {
      method: 'POST',
    })
  }

  async listJobs(params?: {
    type?: 'import' | 'generate' | 'execute'
    status?: string
    limit?: number
  }): Promise<{ jobs: Job[] }> {
    const query = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          query.append(key, String(value))
        }
      })
    }
    return this.request(`/api/jobs?${query.toString()}`)
  }

  // ============================================================================
  // SSE Streaming
  // ============================================================================

  streamJob(jobId: string): EventSource {
    const url = `${this.baseURL}/api/jobs/${jobId}/stream`
    return new EventSource(url)
  }

  streamEvalSet(evalSetId: string): EventSource {
    const url = `${this.baseURL}/api/eval-sets/${evalSetId}/stream`
    return new EventSource(url)
  }
}

export class APIError extends Error {
  status: number
  code: string
  details?: any
  requestId?: string

  constructor(error: any, status: number) {
    super(error.error?.message || 'API Error')
    this.status = status
    this.code = error.error?.code || 'UNKNOWN_ERROR'
    this.details = error.error?.details
    this.requestId = error.error?.request_id
  }
}

// Singleton instance
export const apiClient = new APIClient()
