import type {
  CreateIntegrationRequest,
  Eval,
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
  PlaygroundRunRequest,
  PlaygroundRunResponse,
  SubmitFeedbackRequest,
  Trace,
  UpdateEvalRequest,
  UpdateFeedbackRequest,
} from '@/types/api'
import type {
  Agent,
  AgentVersion,
  AgentWithVersion,
  AgentWithDetails,
  ListAgentsResponse,
  CreateAgentRequest,
  CreateAgentVersionRequest,
  ConfirmAgentRequest,
  AgentPromptResponse,
} from '@/types/agent'

class APIClient {
  private baseURL: string
  private token: string | null = null
  private workspaceId: string | null = null

  constructor(baseURL?: string) {
    this.baseURL = baseURL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
    // For MVP development, use default workspace
    this.workspaceId = 'workspace_default'
  }

  setAuth(token: string, workspaceId: string) {
    this.token = token
    this.workspaceId = workspaceId
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    if (this.workspaceId) {
      headers['X-Workspace-Id'] = this.workspaceId
    }

    // Destructure to exclude headers from options to avoid overwriting our headers
    const { headers: _, ...restOptions } = options

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...restOptions,
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
    agent_id?: string
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

  async listFeedback(params?: {
    trace_id?: string
    agent_id?: string
    rating?: 'positive' | 'negative' | 'neutral'
    cursor?: string
    limit?: number
  }): Promise<{ feedback: Feedback[]; next_cursor: string | null; has_more: boolean }> {
    const query = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          query.append(key, String(value))
        }
      })
    }
    return this.request(`/api/feedback?${query.toString()}`)
  }

  // ============================================================================
  // Evals
  // ============================================================================

  async generateEval(agentId: string, data: GenerateEvalRequest): Promise<JobResponse> {
    return this.request(`/api/agents/${agentId}/generate-eval`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listEvals(params?: {
    agent_id?: string
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

  async getEvalExecutions(
    evalId: string,
    params?: {
      filter?: 'contradictions_only' | 'errors_only' | 'all'
      cursor?: string
      limit?: number
    }
  ): Promise<{ executions: any[] }> {
    const query = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          query.append(key, String(value))
        }
      })
    }
    return this.request(`/api/evals/${evalId}/executions?${query.toString()}`)
  }

  async playgroundRun(
    evalId: string,
    data: PlaygroundRunRequest
  ): Promise<PlaygroundRunResponse> {
    return this.request(`/api/evals/${evalId}/playground`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
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

  // ============================================================================
  // Agents
  // ============================================================================

  async createAgent(data: CreateAgentRequest): Promise<AgentWithVersion> {
    return this.request('/api/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listAgents(status?: string): Promise<ListAgentsResponse> {
    const params = status ? `?status=${status}` : ''
    return this.request(`/api/agents${params}`)
  }

  async getAgent(id: string): Promise<AgentWithDetails> {
    return this.request(`/api/agents/${id}`)
  }

  async confirmAgent(id: string, data?: ConfirmAgentRequest): Promise<AgentWithDetails> {
    return this.request(`/api/agents/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    })
  }

  async deleteAgent(id: string): Promise<void> {
    return this.request(`/api/agents/${id}`, {
      method: 'DELETE',
    })
  }

  async getAgentPrompt(id: string): Promise<AgentPromptResponse> {
    return this.request(`/api/agents/${id}/prompt`)
  }

  // ============================================================================
  // Agent Versions
  // ============================================================================

  async listAgentVersions(agentId: string): Promise<{ versions: AgentVersion[]; active_version_id: string | null }> {
    return this.request(`/api/agents/${agentId}/versions`)
  }

  async createAgentVersion(agentId: string, data: CreateAgentVersionRequest): Promise<AgentVersion> {
    return this.request(`/api/agents/${agentId}/versions`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async promoteAgentVersion(agentId: string, version: number): Promise<{ success: boolean; previous_version_id: string | null }> {
    return this.request(`/api/agents/${agentId}/versions/${version}/promote`, {
      method: 'POST',
    })
  }

  async rejectAgentVersion(agentId: string, version: number, reason?: string): Promise<{ success: boolean }> {
    return this.request(`/api/agents/${agentId}/versions/${version}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  // ============================================================================
  // Matrix / Comparison
  // ============================================================================

  async getMatrix(
    agentId: string,
    params?: {
      eval_ids?: string
      filter?: 'all' | 'contradictions_only' | 'errors_only'
      cursor?: string
      limit?: number
    }
  ): Promise<MatrixResponse> {
    const query = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          query.append(key, String(value))
        }
      })
    }
    return this.request(`/api/agents/${agentId}/matrix?${query.toString()}`)
  }

  // ============================================================================
  // Playground Sessions
  // ============================================================================

  async listPlaygroundSessions(agentId: string): Promise<{
    sessions: Array<{
      id: string
      agentVersionId: string
      modelProvider: string
      modelId: string
      createdAt: string
      updatedAt: string
    }>
  }> {
    return this.request(`/api/agents/${agentId}/playground/sessions`)
  }

  async getPlaygroundSession(agentId: string, sessionId: string): Promise<{
    id: string
    workspaceId: string
    agentId: string
    agentVersionId: string
    messages: Array<{ role: string; content: string }>
    variables: Record<string, string>
    files: Record<string, string>
    modelProvider: string
    modelId: string
    createdAt: string
    updatedAt: string
  }> {
    return this.request(`/api/agents/${agentId}/playground/sessions/${sessionId}`)
  }

  async deletePlaygroundSession(agentId: string, sessionId: string): Promise<void> {
    return this.request(`/api/agents/${agentId}/playground/sessions/${sessionId}`, {
      method: 'DELETE',
    })
  }

  async listAllPlaygroundSessions(): Promise<{
    sessions: Array<{
      id: string
      agentId: string
      agentName: string
      agentVersionId: string
      modelProvider: string
      modelId: string
      messageCount: number
      createdAt: string
      updatedAt: string
    }>
    pagination: {
      total: number
      limit: number
      offset: number
      hasMore: boolean
    }
  }> {
    return this.request('/api/playground/sessions')
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
