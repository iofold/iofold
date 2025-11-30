/**
 * Trace CRUD Operations E2E Tests
 *
 * Comprehensive tests for trace management:
 * - Importing traces with various filters
 * - Listing traces with filters
 * - Viewing trace details
 * - Deleting single and bulk traces
 *
 * Test IDs: TEST-TC01 through TEST-TC20
 */

import { test, expect } from '@playwright/test';
import { apiRequest, createTestIntegration, createTestTrace } from '../utils/helpers';

// Check if valid Langfuse credentials are available for import tests
const hasLangfuseCredentials = !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);

test.describe('Trace CRUD Operations', () => {
  let integrationId: string;
  const createdTraceIds: string[] = [];

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Create test integration (no external API needed for basic CRUD)
    const integration = await createTestIntegration(page, `Trace CRUD Test Integration ${Date.now()}`);
    integrationId = integration.id;

    // Pre-create some traces for CRUD tests that don't require Langfuse
    for (let i = 0; i < 5; i++) {
      const trace = await createTestTrace(page, integrationId, {
        input_preview: `Pre-created input ${i + 1}`,
        output_preview: `Pre-created output ${i + 1}`,
      });
      createdTraceIds.push(trace.id);
    }

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Clean up created traces
    for (const traceId of createdTraceIds) {
      await apiRequest(page, `/api/traces/${traceId}`, { method: 'DELETE' }).catch(() => {});
    }

    // Clean up integration
    if (integrationId) {
      await apiRequest(page, `/api/integrations/${integrationId}`, { method: 'DELETE' }).catch(() => {});
    }

    await context.close();
  });

  test('TEST-TC01: Should import traces with default limit', async ({ page }) => {
    test.skip(!integrationId, 'No integration available');

    const result = await apiRequest<any>(page, '/api/traces/import', {
      method: 'POST',
      data: {
        integration_id: integrationId,
      },
    });

    expect(result.job_id).toBeDefined();
    expect(result.status).toMatch(/queued|running|completed|failed/);

    // Wait for completion
    if (result.job_id) {
      await waitForJob(page, result.job_id);
    }

    // Verify traces were imported
    const traces = await apiRequest<any>(page, '/api/traces');
    expect(traces.traces.length).toBeGreaterThan(0);
  });

  test('TEST-TC02: Should import traces with limit filter', async ({ page }) => {
    test.skip(!integrationId, 'No integration available');

    const result = await apiRequest<any>(page, '/api/traces/import', {
      method: 'POST',
      data: {
        integration_id: integrationId,
        filters: { limit: 3 },
      },
    });

    expect(result.job_id).toBeDefined();

    // Wait for completion
    if (result.job_id) {
      await waitForJob(page, result.job_id);
    }
  });

  test('TEST-TC03: Should fail import with non-existent integration', async ({ page }) => {
    try {
      await apiRequest(page, '/api/traces/import', {
        method: 'POST',
        data: {
          integration_id: 'non_existent_integration',
        },
      });
      throw new Error('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  test('TEST-TC04: Should fail import without integration_id', async ({ page }) => {
    try {
      await apiRequest(page, '/api/traces/import', {
        method: 'POST',
        data: {},
      });
      throw new Error('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toContain('400');
    }
  });

  test('TEST-TC05: Should fail import with invalid limit (negative)', async ({ page }) => {
    test.skip(!integrationId, 'No integration available');

    try {
      await apiRequest(page, '/api/traces/import', {
        method: 'POST',
        data: {
          integration_id: integrationId,
          filters: { limit: -1 },
        },
      });
      throw new Error('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toMatch(/400|422/);
    }
  });

  test('TEST-TC06: Should fail import with invalid limit (too large)', async ({ page }) => {
    test.skip(!integrationId, 'No integration available');

    try {
      await apiRequest(page, '/api/traces/import', {
        method: 'POST',
        data: {
          integration_id: integrationId,
          filters: { limit: 10000 },
        },
      });
      throw new Error('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toMatch(/400|422/);
    }
  });

  test('TEST-TC07: Should list traces', async ({ page }) => {
    const traces = await apiRequest<any>(page, '/api/traces');

    expect(traces).toHaveProperty('traces');
    expect(Array.isArray(traces.traces)).toBe(true);
    // API returns flat structure with has_more and total_count
    expect(traces).toHaveProperty('has_more');
  });

  test('TEST-TC08: Should list traces with limit', async ({ page }) => {
    const traces = await apiRequest<any>(page, '/api/traces?limit=5');

    expect(traces.traces.length).toBeLessThanOrEqual(5);
  });

  test('TEST-TC09: Should get trace by ID', async ({ page }) => {
    // First get a trace ID
    const traces = await apiRequest<any>(page, '/api/traces');
    test.skip(traces.traces.length === 0, 'No traces available');

    const traceId = traces.traces[0].id;
    const trace = await apiRequest<any>(page, `/api/traces/${traceId}`);

    expect(trace.id).toBe(traceId);
    expect(trace).toHaveProperty('trace_id');
    expect(trace).toHaveProperty('source');
    expect(trace).toHaveProperty('timestamp');
    expect(trace).toHaveProperty('steps');
  });

  test('TEST-TC10: Should fail to get non-existent trace', async ({ page }) => {
    try {
      await apiRequest(page, '/api/traces/non_existent_trace_id');
      throw new Error('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  test('TEST-TC11: Should delete trace by ID', async ({ page }) => {
    // First get a trace ID to delete
    const traces = await apiRequest<any>(page, '/api/traces');
    test.skip(traces.traces.length === 0, 'No traces available');

    const traceId = traces.traces[0].id;

    // Delete the trace
    await apiRequest(page, `/api/traces/${traceId}`, { method: 'DELETE' });

    // Verify it's deleted
    try {
      await apiRequest(page, `/api/traces/${traceId}`);
      throw new Error('Should have thrown 404');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  test('TEST-TC12: Should fail to delete non-existent trace', async ({ page }) => {
    try {
      await apiRequest(page, '/api/traces/non_existent_trace_id', { method: 'DELETE' });
      throw new Error('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  test('TEST-TC13: Trace detail should include steps array', async ({ page }) => {
    const traces = await apiRequest<any>(page, '/api/traces');
    test.skip(traces.traces.length === 0, 'No traces available');

    const trace = await apiRequest<any>(page, `/api/traces/${traces.traces[0].id}`);

    expect(Array.isArray(trace.steps)).toBe(true);
  });

  test('TEST-TC14: Trace list should include pagination info', async ({ page }) => {
    const traces = await apiRequest<any>(page, '/api/traces?limit=2');

    // API returns flat structure: { traces, has_more, next_cursor, total_count }
    expect(traces).toHaveProperty('has_more');
    expect(traces).toHaveProperty('total_count');
  });

  test('TEST-TC15: Should paginate through traces using cursor', async ({ page }) => {
    // Get first page
    const page1 = await apiRequest<any>(page, '/api/traces?limit=2');

    // Verify pagination metadata exists
    expect(page1).toHaveProperty('has_more');
    expect(page1.traces).toBeDefined();
    expect(Array.isArray(page1.traces)).toBe(true);

    // Only test pagination if there are more results
    if (page1.has_more && page1.next_cursor) {
      // Get second page
      const page2 = await apiRequest<any>(page, `/api/traces?limit=2&cursor=${page1.next_cursor}`);

      expect(page2.traces.length).toBeGreaterThan(0);

      // Ensure no overlap
      const page1Ids = page1.traces.map((t: any) => t.id);
      const page2Ids = page2.traces.map((t: any) => t.id);
      const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    } else {
      // If no more pages, verify has_more is false
      expect(page1.has_more).toBe(false);
    }
  });

  test('TEST-TC16: Trace list summary should have input/output previews', async ({ page }) => {
    const traces = await apiRequest<any>(page, '/api/traces');
    test.skip(traces.traces.length === 0, 'No traces available');

    const trace = traces.traces[0];
    expect(trace.summary).toBeDefined();
    expect(trace.summary).toHaveProperty('input_preview');
    expect(trace.summary).toHaveProperty('output_preview');
    expect(trace.summary).toHaveProperty('has_errors');
  });

  test('TEST-TC17: Should filter traces by source', async ({ page }) => {
    const traces = await apiRequest<any>(page, '/api/traces?source=langfuse');

    for (const trace of traces.traces) {
      expect(trace.source).toBe('langfuse');
    }
  });

  test('TEST-TC18: Should filter traces by has_feedback=true', async ({ page }) => {
    const traces = await apiRequest<any>(page, '/api/traces?has_feedback=true');

    for (const trace of traces.traces) {
      expect(trace.feedback).toBeDefined();
    }
  });

  test('TEST-TC19: Should filter traces by has_feedback=false', async ({ page }) => {
    const traces = await apiRequest<any>(page, '/api/traces?has_feedback=false');

    for (const trace of traces.traces) {
      expect(trace.feedback).toBeUndefined();
    }
  });

  test('TEST-TC20: Should include step_count in trace list', async ({ page }) => {
    const traces = await apiRequest<any>(page, '/api/traces');
    test.skip(traces.traces.length === 0, 'No traces available');

    for (const trace of traces.traces) {
      expect(typeof trace.step_count).toBe('number');
      expect(trace.step_count).toBeGreaterThanOrEqual(0);
    }
  });
});

// Helper function to wait for job completion
async function waitForJob(page: any, jobId: string, timeout: number = 120000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const job = await apiRequest<any>(page, `/api/jobs/${jobId}`);

    if (job.status === 'completed') {
      return;
    }
    if (job.status === 'failed') {
      throw new Error(`Job failed: ${job.error || 'Unknown error'}`);
    }

    await page.waitForTimeout(2000);
  }

  throw new Error(`Job ${jobId} did not complete within ${timeout}ms`);
}
