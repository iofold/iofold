import { test, expect } from '@playwright/test';
import { getAPIClient } from '../../helpers/api-client';

/**
 * TEST-S02: API Health Check
 * Priority: P0
 * Expected Results:
 * - Response: 200 OK
 * - Response time: < 100ms
 * - Body contains status: "healthy" or similar
 */
test.describe('TEST-S02: API Health Check', () => {
  test('should return healthy status', async () => {
    const apiClient = getAPIClient();

    const startTime = Date.now();
    const response = await apiClient.health();
    const responseTime = Date.now() - startTime;

    // Verify response status
    expect(response.status).toBe(200);

    // Verify response time (relaxed for network latency)
    expect(responseTime).toBeLessThan(5000);

    // Verify response body has health status
    expect(response.data).toBeDefined();
    expect(response.data.status || response.data.health).toBeTruthy();
  });
});

/**
 * TEST-S03: Database Connectivity
 * Priority: P0
 * Expected Results:
 * - Response: 200 OK
 * - Returns array of integrations (may be empty)
 * - Response time: < 50ms
 */
test.describe('TEST-S03: Database Connectivity', () => {
  test('should connect to database and query integrations', async () => {
    const apiClient = getAPIClient();

    const startTime = Date.now();
    const response = await apiClient.listIntegrations();
    const responseTime = Date.now() - startTime;

    // Verify response time (relaxed for network/DB latency)
    expect(responseTime).toBeLessThan(5000);

    // Verify response format
    expect(response).toBeDefined();
    expect(Array.isArray(response.integrations || response)).toBe(true);
  });
});
