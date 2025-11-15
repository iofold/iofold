export class TestAPIClient {
  private baseURL: string;
  private workspaceId: string;

  constructor() {
    this.baseURL = process.env.API_URL || 'http://localhost:8787/v1';
    this.workspaceId = 'workspace_default';
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': this.workspaceId,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`API Error: ${error.error?.message || response.statusText}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // Health check
  async health() {
    // Note: health endpoint is at /health (not /v1/api/health or /api/health)
    // baseURL is http://localhost:8787/v1, so we need to get the origin
    const baseUrl = new URL(this.baseURL);
    const url = `${baseUrl.origin}/health`;
    const response = await fetch(url, {
      headers: {
        'X-Workspace-Id': this.workspaceId,
      },
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    // Health endpoint returns plain text "OK", not JSON
    const text = await response.text();
    return { status: response.status, data: { status: text } };
  }

  // Integrations
  async createIntegration(data: {
    platform: string;
    name: string;
    api_key: string;
    base_url?: string;
  }) {
    return this.request('/api/integrations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteIntegration(id: string) {
    return this.request(`/api/integrations/${id}`, { method: 'DELETE' });
  }

  async listIntegrations() {
    return this.request('/api/integrations');
  }

  // Traces
  async importTraces(data: {
    integration_id: string;
    limit?: number;
    date_from?: string;
    date_to?: string;
  }) {
    return this.request('/api/traces/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getJob(jobId: string) {
    return this.request(`/api/jobs/${jobId}`);
  }

  async listTraces(params?: { limit?: number }) {
    const query = params?.limit ? `?limit=${params.limit}` : '';
    return this.request(`/api/traces${query}`);
  }

  // Feedback
  async submitFeedback(data: {
    trace_id: string;
    eval_set_id: string;
    rating: 'positive' | 'negative' | 'neutral';
    notes?: string;
  }) {
    return this.request('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Eval Sets
  async createEvalSet(data: { name: string; description?: string }) {
    return this.request('/api/eval-sets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Evals
  async generateEval(evalSetId: string, data: {
    name: string;
    description?: string;
    model: string;
    instructions?: string;
  }) {
    return this.request(`/api/eval-sets/${evalSetId}/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async executeEval(evalId: string, data?: { trace_ids?: string[] }) {
    return this.request(`/api/evals/${evalId}/execute`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }
}

export function getAPIClient(): TestAPIClient {
  return new TestAPIClient();
}
