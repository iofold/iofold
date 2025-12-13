export interface Taskset {
  id: string;
  workspace_id: string;
  agent_id: string;
  name: string;
  description: string | null;
  task_count: number;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface TasksetTask {
  id: string;
  user_message: string;
  expected_output: string | null;
  source: 'trace' | 'manual' | 'imported';
  source_trace_id: string | null;
  created_at: string;
}

export interface TasksetWithTasks extends Taskset {
  tasks: TasksetTask[];
}

export interface CreateTasksetRequest {
  name: string;
  description?: string;
}

export interface CreateTasksetFromTracesRequest {
  name: string;
  description?: string;
  filter?: {
    rating?: 'positive' | 'negative' | 'any';
    limit?: number;
  };
}

export interface AddTasksRequest {
  tasks: Array<{
    user_message: string;
    expected_output?: string;
    source?: 'manual' | 'imported';
  }>;
}

export interface CreateTasksetFromTracesResponse {
  id: string;
  name: string;
  task_count: number;
  skipped_duplicates: number;
  message: string;
}

export interface AddTasksResponse {
  inserted: number;
  skipped_duplicates: number;
  total_tasks: number;
}

export interface ListTasksetsResponse {
  tasksets: Taskset[];
}

export interface TasksetRun {
  id: string;
  taskset_id: string;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
  task_count: number;
  completed_count: number;
  failed_count: number;
  model_provider: string;
  model_id: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface TasksetRunResult {
  id: string;
  task_id: string;
  status: 'pending' | 'completed' | 'failed' | 'timeout';
  response?: string;
  expected_output?: string;
  score?: number;
  score_reason?: string;
  trace_id?: string;
  execution_time_ms?: number;
  error?: string;
}

export interface RunTasksetRequest {
  model_provider?: string;
  model_id?: string;
  config?: {
    parallelism?: number;
    timeout_per_task_ms?: number;
  };
}

export interface ListTasksetRunsResponse {
  runs: TasksetRun[];
}

export interface TasksetRunStatusResponse {
  run: TasksetRun;
  results: TasksetRunResult[];
}
