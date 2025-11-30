import { Page } from '@playwright/test';
import { apiRequest, uniqueName } from '../e2e/utils/helpers';

export interface TestAgent {
  id: string;
  name: string;
  description?: string;
  workspace_id: string;
  status: string;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestAgentVersion {
  id: string;
  agent_id: string;
  version: number;
  prompt_template: string;
  variables: string[];
  source: string;
  parent_version_id: string | null;
  accuracy: number | null;
  status: string;
  created_at: string;
}

/**
 * Create a test agent via API
 */
export async function createTestAgent(
  page: Page,
  options: { name?: string; description?: string | null; status?: string } = {}
): Promise<TestAgent> {
  const name = options.name || uniqueName('Test Agent');
  // If description is explicitly null, don't send it. Otherwise use provided or default.
  const description = options.description === null ? undefined :
                     (options.description !== undefined ? options.description : 'Test agent for automated testing');

  const data: any = {
    name,
    status: options.status,
  };

  // Only include description if it's not undefined
  if (description !== undefined) {
    data.description = description;
  }

  const agent = await apiRequest<TestAgent>(page, '/api/agents', {
    method: 'POST',
    data,
  });

  return agent;
}

/**
 * Delete a test agent via API
 */
export async function deleteTestAgent(page: Page, agentId: string): Promise<void> {
  await apiRequest(page, `/api/agents/${agentId}`, {
    method: 'DELETE',
  }).catch(() => {
    // Ignore errors if agent doesn't exist
  });
}

/**
 * Create a test agent version via API
 */
export async function createTestAgentVersion(
  page: Page,
  agentId: string,
  options: {
    prompt_template?: string;
    variables?: string[];
  } = {}
): Promise<TestAgentVersion> {
  const promptTemplate = options.prompt_template || 'You are a helpful assistant. {input}';
  const variables = options.variables || ['input'];

  const version = await apiRequest<TestAgentVersion>(page, `/api/agents/${agentId}/versions`, {
    method: 'POST',
    data: {
      prompt_template: promptTemplate,
      variables,
    },
  });

  return version;
}

/**
 * Promote a test agent version via API
 */
export async function promoteTestAgentVersion(
  page: Page,
  agentId: string,
  versionNumber: number
): Promise<TestAgentVersion> {
  const version = await apiRequest<TestAgentVersion>(
    page,
    `/api/agents/${agentId}/versions/${versionNumber}/promote`,
    {
      method: 'POST',
    }
  );

  return version;
}

/**
 * Reject a test agent version via API
 */
export async function rejectTestAgentVersion(
  page: Page,
  agentId: string,
  versionNumber: number
): Promise<TestAgentVersion> {
  const version = await apiRequest<TestAgentVersion>(
    page,
    `/api/agents/${agentId}/versions/${versionNumber}/reject`,
    {
      method: 'POST',
    }
  );

  return version;
}

/**
 * Add feedback for traces to an agent via API
 * This submits feedback for each trace with the given agent_id
 */
export async function addTracesToAgent(
  page: Page,
  agentId: string,
  traceIds: string[],
  ratings: ('positive' | 'negative' | 'neutral')[]
): Promise<void> {
  for (let i = 0; i < traceIds.length; i++) {
    await apiRequest(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceIds[i],
        agent_id: agentId,
        rating: ratings[i] || 'positive',
      },
    });
  }
}
