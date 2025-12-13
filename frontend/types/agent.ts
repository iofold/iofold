// ============================================================================
// Agent Types
// ============================================================================

export type AgentStatus = 'discovered' | 'confirmed' | 'archived';
export type AgentVersionStatus = 'candidate' | 'active' | 'rejected' | 'archived';
export type AgentVersionSource = 'discovered' | 'manual' | 'ai_improved';

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  status: AgentStatus;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentVersion {
  id: string;
  agent_id: string;
  version: number;
  prompt_template: string;
  variables: string[];
  source: AgentVersionSource;
  parent_version_id: string | null;
  accuracy: number | null;
  status: AgentVersionStatus;
  created_at: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters_schema: string; // JSON Schema as string
  handler_key: string;
  category: 'general' | 'code' | 'filesystem' | 'email';
  created_at: string;
  config?: Record<string, unknown> | null; // Agent-specific config
}

export interface AgentCounts {
  traces: number;
  evals: number;
  feedback: number;
  tasks: number;
}

export interface AgentWithVersion extends Agent {
  active_version: AgentVersion | null;
  counts?: AgentCounts;
}

export interface AgentWithDetails extends AgentWithVersion {
  versions: AgentVersion[];
  tools?: Tool[];
  metrics: {
    trace_count: number;
    feedback_count: number;
    positive_feedback_count: number;
    negative_feedback_count: number;
    eval_count: number;
    accuracy: number | null;
    contradiction_rate: number | null;
  };
}

export interface ListAgentsResponse {
  agents: AgentWithVersion[];
  pending_discoveries: number;
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
}

export interface CreateAgentVersionRequest {
  prompt_template: string;
  variables?: string[];
}

export interface ConfirmAgentRequest {
  name?: string;
}

export interface AgentPromptResponse {
  template: string;
  version: number;
  version_id: string;
  variables: string[];
  updated_at: string;
}
