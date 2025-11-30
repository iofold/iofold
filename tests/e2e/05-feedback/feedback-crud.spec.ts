/**
 * Feedback CRUD Operations E2E Tests
 *
 * Tests for comprehensive feedback functionality including:
 * - Creating feedback (POST)
 * - Updating feedback (PATCH)
 * - Deleting feedback (DELETE)
 * - Edge cases and error handling
 *
 * Test IDs: TEST-FB01 through TEST-FB15
 */

import { test, expect } from '@playwright/test';
import { apiRequest, createTestIntegration, createTestTrace, deleteTestIntegration, deleteTestTrace } from '../utils/helpers';

test.describe('Feedback CRUD Operations', () => {
  let integrationId: string;
  let traceId: string;
  let agentId: string;
  let feedbackId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Create test integration (no external API needed)
    const integration = await createTestIntegration(page, `Feedback Test Integration ${Date.now()}`);
    integrationId = integration.id;

    // Create test trace directly (no Langfuse import needed)
    const trace = await createTestTrace(page, integrationId, {
      input_preview: 'Test input for feedback testing',
      output_preview: 'Test output for feedback testing',
      steps: [
        {
          step_id: 'step_1',
          type: 'llm',
          input: { prompt: 'What is 2+2?' },
          output: { response: '4' },
        },
      ],
    });
    traceId = trace.id;

    // Create test agent
    const agent = await apiRequest<any>(page, '/api/agents', {
      method: 'POST',
      data: {
        name: `Feedback Test Agent ${Date.now()}`,
        description: 'For testing feedback CRUD operations',
      },
    });
    agentId = agent.id;

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Cleanup in reverse order
    if (agentId) {
      await apiRequest(page, `/api/agents/${agentId}`, { method: 'DELETE' }).catch(() => {});
    }
    if (integrationId) {
      await apiRequest(page, `/api/integrations/${integrationId}`, { method: 'DELETE' }).catch(() => {});
    }

    await context.close();
  });

  test.afterEach(async ({ page }) => {
    // Clean up feedback after each test
    if (feedbackId) {
      await apiRequest(page, `/api/feedback/${feedbackId}`, { method: 'DELETE' }).catch(() => {});
      feedbackId = null;
    }
  });

  test('TEST-FB01: Should create positive feedback via API', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        rating: 'positive',
        notes: 'Test positive feedback',
      },
    });

    expect(feedback.id).toBeDefined();
    expect(feedback.rating).toBe('positive');
    expect(feedback.notes).toBe('Test positive feedback');
    feedbackId = feedback.id;
  });

  test('TEST-FB02: Should create negative feedback via API', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        rating: 'negative',
        notes: 'Test negative feedback',
      },
    });

    expect(feedback.id).toBeDefined();
    expect(feedback.rating).toBe('negative');
    feedbackId = feedback.id;
  });

  test('TEST-FB03: Should create neutral feedback via API', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        rating: 'neutral',
      },
    });

    expect(feedback.id).toBeDefined();
    expect(feedback.rating).toBe('neutral');
    expect(feedback.notes).toBeNull();
    feedbackId = feedback.id;
  });

  test('TEST-FB04: Should update feedback rating via PATCH', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    // Create initial feedback
    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        rating: 'positive',
      },
    });
    feedbackId = feedback.id;

    // Update to negative
    const updated = await apiRequest<any>(page, `/api/feedback/${feedbackId}`, {
      method: 'PATCH',
      data: {
        rating: 'negative',
      },
    });

    expect(updated.rating).toBe('negative');
    expect(updated.id).toBe(feedbackId);
  });

  test('TEST-FB05: Should update feedback notes via PATCH', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    // Create initial feedback
    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        rating: 'positive',
        notes: 'Original notes',
      },
    });
    feedbackId = feedback.id;

    // Update notes
    const updated = await apiRequest<any>(page, `/api/feedback/${feedbackId}`, {
      method: 'PATCH',
      data: {
        notes: 'Updated notes',
      },
    });

    expect(updated.notes).toBe('Updated notes');
    expect(updated.rating).toBe('positive'); // Rating unchanged
  });

  test('TEST-FB06: Should delete feedback via DELETE', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    // Create feedback
    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        rating: 'positive',
      },
    });
    const tempFeedbackId = feedback.id;

    // Delete feedback
    await apiRequest(page, `/api/feedback/${tempFeedbackId}`, {
      method: 'DELETE',
    });

    // Verify deletion - trying to get should fail or return not found
    // The trace should no longer have feedback
    const trace = await apiRequest<any>(page, `/api/traces/${traceId}`);
    expect(trace.feedback).toBeUndefined();
  });

  test('TEST-FB07: Should upsert when submitting duplicate feedback', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    // Create initial feedback
    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        rating: 'positive',
      },
    });
    feedbackId = feedback.id;

    // Submit again with different rating - should update (upsert) instead of failing
    const updated = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        rating: 'negative',
      },
    });

    // Should return same ID with updated rating
    expect(updated.id).toBe(feedbackId);
    expect(updated.rating).toBe('negative');
    expect(updated.updated).toBe(true);
  });

  test('TEST-FB08: Should fail with missing trace_id', async ({ page }) => {
    test.skip(!agentId, 'No test data available');

    try {
      await apiRequest(page, '/api/feedback', {
        method: 'POST',
        data: {
          agent_id: agentId,
          rating: 'positive',
        },
      });
      throw new Error('Should have thrown an error for missing trace_id');
    } catch (error: any) {
      expect(error.message).toContain('400');
    }
  });

  test('TEST-FB09: Should fail with missing agent_id', async ({ page }) => {
    test.skip(!traceId, 'No test data available');

    try {
      await apiRequest(page, '/api/feedback', {
        method: 'POST',
        data: {
          trace_id: traceId,
          rating: 'positive',
        },
      });
      throw new Error('Should have thrown an error for missing agent_id');
    } catch (error: any) {
      expect(error.message).toContain('400');
    }
  });

  test('TEST-FB10: Should fail with invalid rating value', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    try {
      await apiRequest(page, '/api/feedback', {
        method: 'POST',
        data: {
          trace_id: traceId,
          agent_id: agentId,
          rating: 'invalid_rating',
        },
      });
      throw new Error('Should have thrown an error for invalid rating');
    } catch (error: any) {
      expect(error.message).toContain('400');
    }
  });

  test('TEST-FB11: Should fail with non-existent trace_id', async ({ page }) => {
    test.skip(!agentId, 'No test data available');

    try {
      await apiRequest(page, '/api/feedback', {
        method: 'POST',
        data: {
          trace_id: 'non_existent_trace_id',
          agent_id: agentId,
          rating: 'positive',
        },
      });
      throw new Error('Should have thrown an error for non-existent trace');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  test('TEST-FB12: Should fail with non-existent agent_id', async ({ page }) => {
    test.skip(!traceId, 'No test data available');

    try {
      await apiRequest(page, '/api/feedback', {
        method: 'POST',
        data: {
          trace_id: traceId,
          agent_id: 'non_existent_agent_id',
          rating: 'positive',
        },
      });
      throw new Error('Should have thrown an error for non-existent agent');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  test('TEST-FB13: Should update feedback shown on trace detail', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    // Create feedback via API
    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        rating: 'positive',
        notes: 'Visible on trace detail',
      },
    });
    feedbackId = feedback.id;

    // Verify trace includes feedback
    const trace = await apiRequest<any>(page, `/api/traces/${traceId}`);
    expect(trace.feedback).toBeDefined();
    expect(trace.feedback.rating).toBe('positive');
    expect(trace.feedback.notes).toBe('Visible on trace detail');
  });

  test('TEST-FB14: Should handle empty notes as null', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        rating: 'positive',
        notes: '',
      },
    });

    expect(feedback.notes).toBeNull();
    feedbackId = feedback.id;
  });

  test('TEST-FB15: Should handle very long notes', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    const longNotes = 'A'.repeat(5000);

    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        rating: 'positive',
        notes: longNotes,
      },
    });

    expect(feedback.notes.length).toBe(5000);
    feedbackId = feedback.id;
  });
});

// Helper function to wait for job completion
async function waitForJob(page: any, jobId: string, timeout: number = 60000): Promise<void> {
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
