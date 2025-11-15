import { Page } from '@playwright/test';
import { apiRequest, uniqueName } from '../e2e/utils/helpers';

export interface TestEvalSet {
  id: string;
  name: string;
  description?: string;
}

/**
 * Create a test eval set via API
 */
export async function createTestEvalSet(
  page: Page,
  options: { name?: string; description?: string } = {}
): Promise<TestEvalSet> {
  const name = options.name || uniqueName('Test Eval Set');
  const description = options.description || 'Test eval set for automated testing';

  const evalSet = await apiRequest<TestEvalSet>(page, '/api/eval-sets', {
    method: 'POST',
    data: {
      name,
      description,
    },
  });

  return evalSet;
}

/**
 * Delete a test eval set via API
 */
export async function deleteTestEvalSet(page: Page, evalSetId: string): Promise<void> {
  await apiRequest(page, `/api/eval-sets/${evalSetId}`, {
    method: 'DELETE',
  });
}

/**
 * Add traces to eval set via feedback
 */
export async function addTracesToEvalSet(
  page: Page,
  evalSetId: string,
  traceIds: string[],
  ratings: ('positive' | 'negative' | 'neutral')[]
): Promise<void> {
  if (traceIds.length !== ratings.length) {
    throw new Error('traceIds and ratings arrays must have the same length');
  }

  for (let i = 0; i < traceIds.length; i++) {
    await apiRequest(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceIds[i],
        eval_set_id: evalSetId,
        rating: ratings[i],
      },
    });
  }
}
