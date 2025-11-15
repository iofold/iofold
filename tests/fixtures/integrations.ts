import { TestAPIClient } from '../helpers/api-client';
import { Page } from '@playwright/test';
import { apiRequest } from '../e2e/utils/helpers';

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

/**
 * Create a test integration using Playwright Page object
 * This is a wrapper that works with page.request for E2E tests
 */
export async function createTestIntegration(page: Page) {
  const name = `Test Integration ${Date.now()}`;

  // Use environment variable for Langfuse API key
  const apiKey = process.env.TEST_LANGFUSE_KEY || 'test_key';
  const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';

  const integration = await apiRequest<any>(page, '/api/integrations', {
    method: 'POST',
    data: {
      platform: 'langfuse',
      name,
      api_key: apiKey,
      base_url: baseUrl,
    },
  });

  return integration;
}

/**
 * Delete a test integration using Playwright Page object
 * This is a wrapper that works with page.request for E2E tests
 */
export async function deleteTestIntegration(page: Page, integrationId: string) {
  try {
    await apiRequest(page, `/api/integrations/${integrationId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.error(`Failed to delete integration ${integrationId}:`, error);
    throw error;
  }
}
