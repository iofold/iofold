/**
 * Eval Set CRUD Operations E2E Tests
 *
 * Comprehensive tests for eval set management:
 * - Creating eval sets with valid/invalid data
 * - Updating eval sets
 * - Deleting eval sets
 * - Adding/removing traces from eval sets
 * - Edge cases and error handling
 *
 * Test IDs: TEST-ES01 through TEST-ES20
 */

import { test, expect } from '@playwright/test';
import { apiRequest, uniqueName, createTestIntegration, createTestTrace } from '../utils/helpers';

test.describe('Eval Set CRUD Operations', () => {
  const createdEvalSetIds: string[] = [];
  let integrationId: string;
  let traceId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Create test integration (no external API needed)
    const integration = await createTestIntegration(page, `Eval Set Test Integration ${Date.now()}`);
    integrationId = integration.id;

    // Create test trace directly (no Langfuse import needed)
    const trace = await createTestTrace(page, integrationId, {
      input_preview: 'Test input for eval set testing',
      output_preview: 'Test output for eval set testing',
      steps: [
        {
          step_id: 'step_1',
          type: 'llm',
          input: { prompt: 'Test prompt' },
          output: { response: 'Test response' },
        },
      ],
    });
    traceId = trace.id;

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Clean up eval sets
    for (const id of createdEvalSetIds) {
      await apiRequest(page, `/api/eval-sets/${id}`, { method: 'DELETE' }).catch(() => {});
    }

    // Clean up integration
    if (integrationId) {
      await apiRequest(page, `/api/integrations/${integrationId}`, { method: 'DELETE' }).catch(() => {});
    }

    await context.close();
  });

  // ==================== CREATE OPERATIONS ====================

  test('TEST-ES01: Should create eval set via API', async ({ page }) => {
    const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: uniqueName('Test Eval Set'),
        description: 'A test eval set for E2E tests',
      },
    });

    expect(evalSet.id).toBeDefined();
    expect(evalSet.name).toContain('Test Eval Set');
    expect(evalSet.description).toBe('A test eval set for E2E tests');
    createdEvalSetIds.push(evalSet.id);
  });

  test('TEST-ES02: Should create eval set without description', async ({ page }) => {
    const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: uniqueName('No Description Eval Set'),
      },
    });

    expect(evalSet.id).toBeDefined();
    expect(evalSet.description).toBeFalsy();
    createdEvalSetIds.push(evalSet.id);
  });

  test('TEST-ES03: Should fail to create eval set without name', async ({ page }) => {
    try {
      await apiRequest(page, '/api/eval-sets', {
        method: 'POST',
        data: {
          description: 'No name provided',
        },
      });
      throw new Error('Should have thrown an error for missing name');
    } catch (error: any) {
      expect(error.message).toContain('400');
    }
  });

  test('TEST-ES04: Should fail to create eval set with empty name', async ({ page }) => {
    try {
      await apiRequest(page, '/api/eval-sets', {
        method: 'POST',
        data: {
          name: '',
          description: 'Empty name',
        },
      });
      throw new Error('Should have thrown an error for empty name');
    } catch (error: any) {
      expect(error.message).toContain('400');
    }
  });

  // ==================== READ OPERATIONS ====================

  test('TEST-ES05: Should list all eval sets', async ({ page }) => {
    const evalSets = await apiRequest<any>(page, '/api/eval-sets');

    expect(evalSets).toHaveProperty('eval_sets');
    expect(Array.isArray(evalSets.eval_sets)).toBe(true);
  });

  test('TEST-ES06: Should get eval set by ID', async ({ page }) => {
    // Create an eval set first
    const created = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: uniqueName('Get By ID Eval Set'),
        description: 'For getting by ID',
      },
    });
    createdEvalSetIds.push(created.id);

    // Fetch by ID
    const evalSet = await apiRequest<any>(page, `/api/eval-sets/${created.id}`);

    expect(evalSet.id).toBe(created.id);
    expect(evalSet.name).toContain('Get By ID Eval Set');
  });

  test('TEST-ES07: Should fail to get non-existent eval set', async ({ page }) => {
    try {
      await apiRequest(page, '/api/eval-sets/non_existent_id');
      throw new Error('Should have thrown 404 error');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  test('TEST-ES08: Should include feedback stats in eval set detail', async ({ page }) => {
    test.skip(!traceId, 'No trace available for feedback');

    // Create eval set
    const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: uniqueName('Feedback Stats Eval Set'),
      },
    });
    createdEvalSetIds.push(evalSet.id);

    // Add feedback
    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        eval_set_id: evalSet.id,
        rating: 'positive',
      },
    });

    // Fetch eval set and check stats
    const detail = await apiRequest<any>(page, `/api/eval-sets/${evalSet.id}`);

    // API returns stats object with positive_count, negative_count, neutral_count, total_count
    expect(detail.stats).toBeDefined();
    expect(detail.stats.positive_count).toBeGreaterThanOrEqual(1);

    // Clean up feedback
    await apiRequest(page, `/api/feedback/${feedback.id}`, { method: 'DELETE' }).catch(() => {});
  });

  // ==================== UPDATE OPERATIONS ====================

  test('TEST-ES09: Should update eval set name', async ({ page }) => {
    const created = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: uniqueName('Original Eval Set Name'),
      },
    });
    createdEvalSetIds.push(created.id);

    const newName = uniqueName('Updated Eval Set Name');
    const updated = await apiRequest<any>(page, `/api/eval-sets/${created.id}`, {
      method: 'PATCH',
      data: { name: newName },
    });

    expect(updated.name).toBe(newName);
  });

  test('TEST-ES10: Should update eval set description', async ({ page }) => {
    const created = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: uniqueName('Update Description Eval Set'),
        description: 'Original description',
      },
    });
    createdEvalSetIds.push(created.id);

    const updated = await apiRequest<any>(page, `/api/eval-sets/${created.id}`, {
      method: 'PATCH',
      data: { description: 'Updated description' },
    });

    expect(updated.description).toBe('Updated description');
  });

  test('TEST-ES11: Should fail to update non-existent eval set', async ({ page }) => {
    try {
      await apiRequest(page, '/api/eval-sets/non_existent_id', {
        method: 'PATCH',
        data: { name: 'New Name' },
      });
      throw new Error('Should have thrown 404 error');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  // ==================== DELETE OPERATIONS ====================

  test('TEST-ES12: Should delete eval set', async ({ page }) => {
    const created = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: uniqueName('To Delete Eval Set'),
      },
    });

    await apiRequest(page, `/api/eval-sets/${created.id}`, { method: 'DELETE' });

    try {
      await apiRequest(page, `/api/eval-sets/${created.id}`);
      throw new Error('Should have thrown 404 error');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  test('TEST-ES13: Should fail to delete non-existent eval set', async ({ page }) => {
    try {
      await apiRequest(page, '/api/eval-sets/non_existent_id', { method: 'DELETE' });
      throw new Error('Should have thrown 404 error');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  test('TEST-ES14: Should cascade delete feedback when eval set is deleted', async ({ page }) => {
    test.skip(!traceId, 'No trace available for feedback');

    // Create eval set
    const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: uniqueName('Cascade Delete Eval Set'),
      },
    });

    // Add feedback
    await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        eval_set_id: evalSet.id,
        rating: 'positive',
      },
    });

    // Delete eval set
    await apiRequest(page, `/api/eval-sets/${evalSet.id}`, { method: 'DELETE' });

    // Verify trace no longer has feedback for this eval set
    const trace = await apiRequest<any>(page, `/api/traces/${traceId}`);
    expect(trace.feedback).toBeUndefined();
  });

  // ==================== EDGE CASES ====================

  test('TEST-ES15: Should handle special characters in name', async ({ page }) => {
    const specialName = `Test <Eval Set> & "Quotes" '${Date.now()}'`;

    const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: specialName,
      },
    });

    expect(evalSet.name).toBe(specialName);
    createdEvalSetIds.push(evalSet.id);
  });

  test('TEST-ES16: Should handle very long name', async ({ page }) => {
    const longName = 'A'.repeat(200);

    try {
      const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
        method: 'POST',
        data: {
          name: longName,
        },
      });
      createdEvalSetIds.push(evalSet.id);
      // Should truncate or accept
      expect(evalSet.name.length).toBeLessThanOrEqual(255);
    } catch (error: any) {
      // Or fail with validation error
      expect(error.message).toMatch(/400|name/i);
    }
  });

  test('TEST-ES17: Should handle very long description', async ({ page }) => {
    const longDescription = 'B'.repeat(5000);

    const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: uniqueName('Long Description Eval Set'),
        description: longDescription,
      },
    });

    expect(evalSet.description.length).toBe(5000);
    createdEvalSetIds.push(evalSet.id);
  });

  test('TEST-ES18: Should include created_at timestamp', async ({ page }) => {
    const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: uniqueName('Timestamp Eval Set'),
      },
    });

    expect(evalSet.created_at).toBeDefined();
    // Should be a valid ISO date
    const date = new Date(evalSet.created_at);
    expect(date.getTime()).toBeGreaterThan(0);
    createdEvalSetIds.push(evalSet.id);
  });

  test('TEST-ES19: Should include feedback stats in list', async ({ page }) => {
    const evalSets = await apiRequest<any>(page, '/api/eval-sets');

    for (const evalSet of evalSets.eval_sets) {
      // API returns stats object with positive_count, negative_count, neutral_count, total_count
      expect(evalSet).toHaveProperty('stats');
      expect(typeof evalSet.stats.total_count).toBe('number');
    }
  });

  test('TEST-ES20: Should return eval sets ordered by created_at', async ({ page }) => {
    const evalSets = await apiRequest<any>(page, '/api/eval-sets');

    if (evalSets.eval_sets.length >= 2) {
      for (let i = 0; i < evalSets.eval_sets.length - 1; i++) {
        const current = new Date(evalSets.eval_sets[i].created_at);
        const next = new Date(evalSets.eval_sets[i + 1].created_at);
        // Newer should come first (desc order)
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    }
  });
});
