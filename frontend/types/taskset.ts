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
