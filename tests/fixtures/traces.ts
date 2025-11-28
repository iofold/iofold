import { TestAPIClient } from '../helpers/api-client';
import { waitForJobCompletion as waitForJobCompletionApiClient } from '../helpers/wait-for';
import { Page } from '@playwright/test';
import { apiRequest, waitForJobCompletion } from '../e2e/utils/helpers';

export async function seedTraces(
  apiClient: TestAPIClient,
  integrationId: string,
  count: number = 10
): Promise<string[]> {
  const jobResponse = await apiClient.importTraces({
    integration_id: integrationId,
    limit: count,
  });

  await waitForJobCompletionApiClient(apiClient, jobResponse.job_id);

  const tracesResponse = await apiClient.listTraces({ limit: count });
  return tracesResponse.traces.map(t => t.id);
}

/**
 * Import test traces using Playwright Page object
 * This creates traces directly rather than importing from external service
 * to ensure tests work without real Langfuse credentials
 */
export async function importTestTraces(
  page: Page,
  integrationId: string,
  options: { limit?: number } = {}
): Promise<string[]> {
  const limit = options.limit || 10;
  const traceIds: string[] = [];

  try {
    // Create traces directly instead of importing from Langfuse
    // This ensures tests work without external API dependencies
    for (let i = 0; i < limit; i++) {
      const trace = await apiRequest<any>(page, '/api/traces', {
        method: 'POST',
        data: {
          integration_id: integrationId,
          trace_id: `trace_test_${Date.now()}_${i}`,
          input_preview: `Test input ${i + 1}`,
          output_preview: `Test output ${i + 1}`,
          has_errors: false,
          steps: [
            {
              step_id: `step_${i}_1`,
              type: 'llm',
              input: { prompt: `Test prompt ${i + 1}` },
              output: { response: `Test response ${i + 1}` },
            },
          ],
        },
      });
      if (trace?.id) {
        traceIds.push(trace.id);
      }
    }
    return traceIds;
  } catch (error) {
    console.error('Error creating test traces:', error);
    return traceIds; // Return whatever was created
  }
}

/**
 * Delete test traces using Playwright Page object
 */
export async function deleteTestTraces(page: Page, traceIds: string[]): Promise<void> {
  for (const traceId of traceIds) {
    try {
      await apiRequest(page, `/api/traces/${traceId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error(`Failed to delete trace ${traceId}:`, error);
      // Continue deleting other traces
    }
  }
}

/**
 * Delete a single test trace
 */
export async function deleteTestTrace(page: Page, traceId: string): Promise<void> {
  try {
    await apiRequest(page, `/api/traces/${traceId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.error(`Failed to delete trace ${traceId}:`, error);
  }
}

/**
 * Create a test trace directly without importing from Langfuse
 * Useful for tests that don't need real trace data
 */
export async function createTestTrace(
  page: Page,
  integrationId: string,
  data: {
    input_preview?: string;
    output_preview?: string;
    steps?: any[];
  } = {}
): Promise<any> {
  const trace = await apiRequest<any>(page, '/api/traces', {
    method: 'POST',
    data: {
      integration_id: integrationId,
      trace_id: `trace_test_${Date.now()}`,
      input_preview: data.input_preview || 'Test input',
      output_preview: data.output_preview || 'Test output',
      has_errors: false,
      steps: data.steps || [],
    },
  });

  return trace;
}
