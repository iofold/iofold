// src/db/schema/enums.ts
// Shared enum values used across multiple tables

// Agent-related enums
export const agentStatus = ['discovered', 'confirmed', 'archived'] as const;
export type AgentStatus = (typeof agentStatus)[number];

export const agentVersionStatus = ['candidate', 'active', 'rejected', 'archived'] as const;
export type AgentVersionStatus = (typeof agentVersionStatus)[number];

export const agentVersionSource = ['discovered', 'manual', 'ai_improved'] as const;
export type AgentVersionSource = (typeof agentVersionSource)[number];

// Job-related enums
export const jobType = [
  'import', 'generate', 'execute', 'monitor', 'auto_refine',
  'agent_discovery', 'taskset_run'
] as const;
export type JobType = (typeof jobType)[number];

export const jobStatus = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const;
export type JobStatus = (typeof jobStatus)[number];

// Feedback-related enums
export const feedbackRating = ['positive', 'negative', 'neutral'] as const;
export type FeedbackRating = (typeof feedbackRating)[number];

// Eval-related enums
// Consolidated status: draft (manual), candidate (generated), testing (being tested), active (in use), archived
export const evalStatus = ['draft', 'candidate', 'testing', 'active', 'archived'] as const;
export type EvalStatus = (typeof evalStatus)[number];

// Deprecated: keeping for migration compatibility, use evalStatus instead
export const evalCandidateStatus = evalStatus;
export type EvalCandidateStatus = EvalStatus;

// Taskset-related enums
export const tasksetStatus = ['active', 'archived'] as const;
export type TasksetStatus = (typeof tasksetStatus)[number];

export const tasksetRunStatus = ['queued', 'running', 'completed', 'partial', 'failed', 'cancelled'] as const;
export type TasksetRunStatus = (typeof tasksetRunStatus)[number];

export const tasksetTaskSource = ['trace', 'manual', 'imported'] as const;
export type TasksetTaskSource = (typeof tasksetTaskSource)[number];

export const tasksetRunResultStatus = ['pending', 'completed', 'failed', 'timeout'] as const;
export type TasksetRunResultStatus = (typeof tasksetRunResultStatus)[number];

// Function-related enums
export const functionType = ['template_extractor', 'template_injector', 'eval'] as const;
export type FunctionType = (typeof functionType)[number];

export const functionStatus = ['active', 'archived', 'failed'] as const;
export type FunctionStatus = (typeof functionStatus)[number];

export const functionRole = ['extractor', 'injector'] as const;
export type FunctionRole = (typeof functionRole)[number];

// Trace-related enums
export const traceSource = ['langfuse', 'langsmith', 'openai', 'playground', 'taskset'] as const;
export type TraceSource = (typeof traceSource)[number];

export const traceAssignmentStatus = ['unassigned', 'assigned', 'orphaned'] as const;
export type TraceAssignmentStatus = (typeof traceAssignmentStatus)[number];

// Integration-related enums
export const integrationPlatform = ['langfuse', 'langsmith', 'openai', 'playground', 'taskset'] as const;
export type IntegrationPlatform = (typeof integrationPlatform)[number];

export const integrationStatus = ['active', 'error'] as const;
export type IntegrationStatus = (typeof integrationStatus)[number];

// Tool-related enums
export const toolCategory = ['general', 'code', 'filesystem', 'email'] as const;
export type ToolCategory = (typeof toolCategory)[number];

// GEPA-related enums
export const gepaSplit = ['train', 'val', 'test'] as const;
export type GepaSplit = (typeof gepaSplit)[number];

export const gepaRunStatus = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;
export type GepaRunStatus = (typeof gepaRunStatus)[number];
