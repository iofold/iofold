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
  options: { name?: string; description?: string } = {}
): Promise<TestAgent> {
  const name = options.name || uniqueName('Test Agent');
  const description = options.description || 'Test agent for automated testing';

  const agent = await apiRequest<TestAgent>(page, '/api/agents', {
    method: 'POST',
    data: {
      name,
      description,
    },
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
