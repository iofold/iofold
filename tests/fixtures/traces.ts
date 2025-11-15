import { TestAPIClient } from '../helpers/api-client';
import { waitForJobCompletion } from '../helpers/wait-for';

export async function seedTraces(
  apiClient: TestAPIClient,
  integrationId: string,
  count: number = 10
): Promise<string[]> {
  const jobResponse = await apiClient.importTraces({
    integration_id: integrationId,
    limit: count,
  });

  await waitForJobCompletion(apiClient, jobResponse.job_id);

  const tracesResponse = await apiClient.listTraces({ limit: count });
  return tracesResponse.traces.map(t => t.id);
}
