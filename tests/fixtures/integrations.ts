import { TestAPIClient } from '../helpers/api-client';

export async function seedIntegration(apiClient: TestAPIClient) {
  const name = `Test Integration ${Date.now()}`;
  const integration = await apiClient.createIntegration({
    platform: 'langfuse',
    name,
    api_key: process.env.TEST_LANGFUSE_KEY || 'test_key',
    base_url: 'https://cloud.langfuse.com',
  });

  return integration;
}

export async function cleanupIntegration(apiClient: TestAPIClient, integrationId: string) {
  try {
    await apiClient.deleteIntegration(integrationId);
  } catch (error) {
    console.error(`Failed to cleanup integration ${integrationId}:`, error);
  }
}

// Alias for compatibility
export const createTestIntegration = seedIntegration;
