/**
 * Test Fixtures for Jobs
 *
 * Seed data and setup helpers for job-related tests
 */

import { TestAPIClient } from '../helpers/api-client';
import { waitForJobCompletion } from '../helpers/wait-for';

/**
 * Create a test integration for job tests
 */
export async function seedIntegration(apiClient: TestAPIClient): Promise<any> {
  // Use timestamp to ensure unique name
  const timestamp = Date.now();

  return await apiClient.createIntegration({
    platform: 'langfuse',
    name: `Test Integration ${timestamp}`,
    api_key: process.env.TEST_LANGFUSE_KEY || 'pk_test_mock_key',
    base_url: 'https://cloud.langfuse.com',
  });
}

/**
 * Start a trace import job (for testing job monitoring)
 */
export async function startTraceImportJob(
  apiClient: TestAPIClient,
  integrationId: string,
  limit: number = 5
): Promise<string> {
  const response = await apiClient.importTraces({
    integration_id: integrationId,
    limit,
  });

  return response.job_id;
}

/**
 * Create an eval set with feedback for eval generation
 */
export async function seedEvalSetWithFeedback(
  apiClient: TestAPIClient,
  integrationId: string
): Promise<{ evalSetId: string; traceIds: string[] }> {
  // Import traces
  const jobResponse = await apiClient.importTraces({
    integration_id: integrationId,
    limit: 5,
  });

  // Wait for import to complete
  await waitForJobCompletion(apiClient, jobResponse.job_id);

  // Get imported traces
  const tracesResponse = await apiClient.listTraces({ limit: 5 });
  const traceIds = tracesResponse.traces.map((t: any) => t.id);

  // Create eval set
  const evalSet = await apiClient.createEvalSet({
    name: `Test Eval Set ${Date.now()}`,
    description: 'Test eval set for job monitoring',
  });

  // Submit feedback for traces
  await Promise.all([
    apiClient.submitFeedback({
      trace_id: traceIds[0],
      eval_set_id: evalSet.id,
      rating: 'positive',
    }),
    apiClient.submitFeedback({
      trace_id: traceIds[1],
      eval_set_id: evalSet.id,
      rating: 'positive',
    }),
    apiClient.submitFeedback({
      trace_id: traceIds[2],
      eval_set_id: evalSet.id,
      rating: 'positive',
    }),
    apiClient.submitFeedback({
      trace_id: traceIds[3],
      eval_set_id: evalSet.id,
      rating: 'negative',
    }),
    apiClient.submitFeedback({
      trace_id: traceIds[4],
      eval_set_id: evalSet.id,
      rating: 'negative',
    }),
  ]);

  return { evalSetId: evalSet.id, traceIds };
}

/**
 * Start an eval generation job (for testing job monitoring)
 */
export async function startEvalGenerationJob(
  apiClient: TestAPIClient,
  evalSetId: string
): Promise<string> {
  const response = await apiClient.generateEval(evalSetId, {
    name: `Test Eval ${Date.now()}`,
    description: 'Test eval for job monitoring',
    model: 'claude-3-haiku-20240307',
    instructions: 'Check if response is accurate',
  });

  return response.job_id;
}

/**
 * Clean up test data
 */
export async function cleanupIntegration(
  apiClient: TestAPIClient,
  integrationId: string
): Promise<void> {
  try {
    await apiClient.deleteIntegration(integrationId);
  } catch (error) {
    // Ignore errors during cleanup
    console.log('Cleanup error (ignored):', error);
  }
}
