// src/types/agent.ts
// Type definitions for agent management

export type AgentStatus = 'discovered' | 'confirmed' | 'archived';
export type AgentVersionStatus = 'candidate' | 'active' | 'rejected' | 'archived';
export type AgentVersionSource = 'discovered' | 'manual' | 'ai_improved';
export type FunctionType = 'template_extractor' | 'template_injector' | 'eval';
export type FunctionStatus = 'active' | 'archived' | 'failed';
export type FunctionRole = 'extractor' | 'injector';
export type TraceAssignmentStatus = 'unassigned' | 'assigned' | 'orphaned';
export type BestPracticeSource = 'openai' | 'anthropic' | 'google';
export type BestPracticeCategory = 'structure' | 'clarity' | 'safety' | 'reasoning' | 'general';

export interface Agent {
  id: string;
  workspace_id: string;
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
  variables: string[]; // JSON parsed
  source: AgentVersionSource;
  parent_version_id: string | null;
  accuracy: number | null;
  status: AgentVersionStatus;
  created_at: string;
}

export interface Function {
  id: string;
  workspace_id: string;
  type: FunctionType;
  name: string;
  code: string;
  input_schema: object | null; // JSON parsed
  output_schema: object | null; // JSON parsed
  model_used: string | null;
  parent_function_id: string | null;
  status: FunctionStatus;
  created_at: string;
}

export interface AgentFunction {
  agent_id: string;
  function_id: string;
  role: FunctionRole;
}

export interface PromptBestPractice {
  id: string;
  source: BestPracticeSource;
  category: BestPracticeCategory;
  title: string;
  content: string;
  url: string | null;
  created_at: string;
}

// API Request/Response types
export interface CreateAgentRequest {
  name: string;
  description?: string;
}

export interface ConfirmAgentRequest {
  name?: string; // Optional rename
}

export interface CreateAgentVersionRequest {
  prompt_template: string;
  variables?: string[];
}

export interface AgentWithVersion extends Agent {
  active_version: AgentVersion | null;
}

export interface AgentWithDetails extends AgentWithVersion {
  versions: AgentVersion[];
  functions: {
    extractor: Function | null;
    injector: Function | null;
  };
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

export interface AgentPromptResponse {
  template: string;
  version: number;
  version_id: string;
  variables: string[];
  updated_at: string;
}

export interface TriggerImprovementRequest {
  custom_instructions?: string;
  include_traces?: string[];
}

// Job types for agent operations
export type AgentJobType = 'agent_discovery';

export interface AgentDiscoveryJobResult {
  discovered_agents: string[];
  assigned_traces: number;
  orphaned_traces: number;
}
