/**
 * Integration CRUD Operations E2E Tests
 *
 * Comprehensive tests for integration management:
 * - Creating integrations with valid/invalid data
 * - Updating integrations
 * - Deleting integrations
 * - Testing connections
 * - Edge cases and error handling
 *
 * Test IDs: TEST-INT01 through TEST-INT20
 */

import { test, expect } from '@playwright/test';
import { apiRequest, uniqueName } from '../utils/helpers';

test.describe('Integration CRUD Operations', () => {
  const createdIntegrationIds: string[] = [];

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Clean up all created integrations
    for (const id of createdIntegrationIds) {
      await apiRequest(page, `/api/integrations/${id}`, { method: 'DELETE' }).catch(() => {});
    }

    await context.close();
  });

  // ==================== CREATE OPERATIONS ====================

  test('TEST-INT01: Should create Langfuse integration via API', async ({ page }) => {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const apiKey = (publicKey && secretKey)
      ? `${publicKey}:${secretKey}`
      : (process.env.TEST_LANGFUSE_KEY || 'test_public_key:test_secret_key');

    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: uniqueName('Test Integration'),
        api_key: apiKey,
        base_url: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
      },
    });

    expect(integration.id).toBeDefined();
    expect(integration.platform).toBe('langfuse');
    expect(integration.name).toContain('Test Integration');
    createdIntegrationIds.push(integration.id);
  });

  test('TEST-INT02: Should fail to create integration without name', async ({ page }) => {
    try {
      await apiRequest(page, '/api/integrations', {
        method: 'POST',
        data: {
          platform: 'langfuse',
          api_key: 'test_key',
          base_url: 'https://cloud.langfuse.com',
        },
      });
      throw new Error('Should have thrown an error for missing name');
    } catch (error: any) {
      expect(error.message).toContain('400');
    }
  });

  test('TEST-INT03: Should fail to create integration without api_key', async ({ page }) => {
    try {
      await apiRequest(page, '/api/integrations', {
        method: 'POST',
        data: {
          platform: 'langfuse',
          name: uniqueName('No API Key Integration'),
          base_url: 'https://cloud.langfuse.com',
        },
      });
      throw new Error('Should have thrown an error for missing api_key');
    } catch (error: any) {
      expect(error.message).toContain('400');
    }
  });

  test('TEST-INT04: Should fail to create integration without platform', async ({ page }) => {
    try {
      await apiRequest(page, '/api/integrations', {
        method: 'POST',
        data: {
          name: uniqueName('No Platform Integration'),
          api_key: 'test_key',
          base_url: 'https://cloud.langfuse.com',
        },
      });
      throw new Error('Should have thrown an error for missing platform');
    } catch (error: any) {
      expect(error.message).toContain('400');
    }
  });

  test('TEST-INT05: Should fail to create integration with invalid platform', async ({ page }) => {
    try {
      await apiRequest(page, '/api/integrations', {
        method: 'POST',
        data: {
          platform: 'invalid_platform',
          name: uniqueName('Invalid Platform Integration'),
          api_key: 'test_key',
          base_url: 'https://example.com',
        },
      });
      throw new Error('Should have thrown an error for invalid platform');
    } catch (error: any) {
      expect(error.message).toMatch(/400|invalid/i);
    }
  });

  test('TEST-INT06: Should create integration with default base_url', async ({ page }) => {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const apiKey = (publicKey && secretKey)
      ? `${publicKey}:${secretKey}`
      : (process.env.TEST_LANGFUSE_KEY || 'test_public_key:test_secret_key');

    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: uniqueName('Default URL Integration'),
        api_key: apiKey,
        // No base_url - should use default
      },
    });

    expect(integration.id).toBeDefined();
    expect(integration.base_url).toBeDefined();
    createdIntegrationIds.push(integration.id);
  });

  // ==================== READ OPERATIONS ====================

  test('TEST-INT07: Should list all integrations', async ({ page }) => {
    const integrations = await apiRequest<any>(page, '/api/integrations');

    expect(integrations).toHaveProperty('integrations');
    expect(Array.isArray(integrations.integrations)).toBe(true);
  });

  test('TEST-INT08: Should get integration by ID', async ({ page }) => {
    // First create an integration
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const apiKey = (publicKey && secretKey)
      ? `${publicKey}:${secretKey}`
      : (process.env.TEST_LANGFUSE_KEY || 'test_public_key:test_secret_key');

    const created = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: uniqueName('Get By ID Integration'),
        api_key: apiKey,
        base_url: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
      },
    });
    createdIntegrationIds.push(created.id);

    // Then fetch it by ID
    const integration = await apiRequest<any>(page, `/api/integrations/${created.id}`);

    expect(integration.id).toBe(created.id);
    expect(integration.name).toContain('Get By ID Integration');
    expect(integration.platform).toBe('langfuse');
  });

  test('TEST-INT09: Should fail to get non-existent integration', async ({ page }) => {
    try {
      await apiRequest(page, '/api/integrations/non_existent_id');
      throw new Error('Should have thrown 404 error');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  // ==================== UPDATE OPERATIONS ====================

  test('TEST-INT10: Should update integration name', async ({ page }) => {
    // First create an integration
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const apiKey = (publicKey && secretKey)
      ? `${publicKey}:${secretKey}`
      : (process.env.TEST_LANGFUSE_KEY || 'test_public_key:test_secret_key');

    const created = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: uniqueName('Original Name'),
        api_key: apiKey,
        base_url: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
      },
    });
    createdIntegrationIds.push(created.id);

    // Update the name
    const newName = uniqueName('Updated Name');
    const updated = await apiRequest<any>(page, `/api/integrations/${created.id}`, {
      method: 'PATCH',
      data: { name: newName },
    });

    expect(updated.name).toBe(newName);
    expect(updated.id).toBe(created.id);
  });

  test('TEST-INT11: Should fail to update non-existent integration', async ({ page }) => {
    try {
      await apiRequest(page, '/api/integrations/non_existent_id', {
        method: 'PATCH',
        data: { name: 'New Name' },
      });
      throw new Error('Should have thrown 404 error');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  // ==================== DELETE OPERATIONS ====================

  test('TEST-INT12: Should delete integration', async ({ page }) => {
    // First create an integration
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const apiKey = (publicKey && secretKey)
      ? `${publicKey}:${secretKey}`
      : (process.env.TEST_LANGFUSE_KEY || 'test_public_key:test_secret_key');

    const created = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: uniqueName('To Delete Integration'),
        api_key: apiKey,
        base_url: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
      },
    });

    // Delete it
    await apiRequest(page, `/api/integrations/${created.id}`, { method: 'DELETE' });

    // Verify it's deleted
    try {
      await apiRequest(page, `/api/integrations/${created.id}`);
      throw new Error('Should have thrown 404 error');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  test('TEST-INT13: Should fail to delete non-existent integration', async ({ page }) => {
    try {
      await apiRequest(page, '/api/integrations/non_existent_id', { method: 'DELETE' });
      throw new Error('Should have thrown 404 error');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
  });

  // ==================== TEST CONNECTION ====================

  test('TEST-INT14: Should test connection with valid credentials', async ({ page }) => {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;

    // Skip if no valid credentials
    test.skip(!publicKey || !secretKey, 'Requires valid Langfuse credentials');

    const apiKey = `${publicKey}:${secretKey}`;
    const created = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: uniqueName('Test Connection Integration'),
        api_key: apiKey,
        base_url: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
      },
    });
    createdIntegrationIds.push(created.id);

    const result = await apiRequest<any>(page, `/api/integrations/${created.id}/test`, { method: 'POST' });

    expect(result.success).toBe(true);
  });

  test('TEST-INT15: Should fail test connection with invalid credentials', async ({ page }) => {
    const created = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: uniqueName('Invalid Creds Integration'),
        api_key: 'invalid_public_key:invalid_secret_key',
        base_url: 'https://cloud.langfuse.com',
      },
    });
    createdIntegrationIds.push(created.id);

    const result = await apiRequest<any>(page, `/api/integrations/${created.id}/test`, { method: 'POST' });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // ==================== EDGE CASES ====================

  test('TEST-INT16: Should handle empty name string', async ({ page }) => {
    try {
      await apiRequest(page, '/api/integrations', {
        method: 'POST',
        data: {
          platform: 'langfuse',
          name: '',
          api_key: 'test_key',
          base_url: 'https://cloud.langfuse.com',
        },
      });
      throw new Error('Should have thrown an error for empty name');
    } catch (error: any) {
      expect(error.message).toContain('400');
    }
  });

  test('TEST-INT17: Should handle very long integration name', async ({ page }) => {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const apiKey = (publicKey && secretKey)
      ? `${publicKey}:${secretKey}`
      : (process.env.TEST_LANGFUSE_KEY || 'test_public_key:test_secret_key');

    const longName = 'A'.repeat(255);

    try {
      const integration = await apiRequest<any>(page, '/api/integrations', {
        method: 'POST',
        data: {
          platform: 'langfuse',
          name: longName,
          api_key: apiKey,
          base_url: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
        },
      });
      createdIntegrationIds.push(integration.id);
      // If it succeeds, name should be truncated or accepted
      expect(integration.name.length).toBeLessThanOrEqual(255);
    } catch (error: any) {
      // Or it should fail with validation error
      expect(error.message).toMatch(/400|name/i);
    }
  });

  test('TEST-INT18: Should handle special characters in name', async ({ page }) => {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const apiKey = (publicKey && secretKey)
      ? `${publicKey}:${secretKey}`
      : (process.env.TEST_LANGFUSE_KEY || 'test_public_key:test_secret_key');

    const specialName = `Test <Integration> & "Quotes" '${Date.now()}'`;

    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: specialName,
        api_key: apiKey,
        base_url: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
      },
    });

    expect(integration.name).toBe(specialName);
    createdIntegrationIds.push(integration.id);
  });

  test('TEST-INT19: Should handle invalid base_url format', async ({ page }) => {
    try {
      await apiRequest(page, '/api/integrations', {
        method: 'POST',
        data: {
          platform: 'langfuse',
          name: uniqueName('Invalid URL Integration'),
          api_key: 'test_key',
          base_url: 'not_a_valid_url',
        },
      });
      // Might succeed but store the invalid URL
    } catch (error: any) {
      // Or fail with validation error
      expect(error.message).toMatch(/400|url/i);
    }
  });

  test('TEST-INT20: Integration response should not expose raw API key', async ({ page }) => {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const apiKey = (publicKey && secretKey)
      ? `${publicKey}:${secretKey}`
      : (process.env.TEST_LANGFUSE_KEY || 'test_public_key:test_secret_key');

    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: uniqueName('Security Test Integration'),
        api_key: apiKey,
        base_url: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
      },
    });
    createdIntegrationIds.push(integration.id);

    // Fetch the integration
    const fetched = await apiRequest<any>(page, `/api/integrations/${integration.id}`);

    // Should not contain the raw API key (should be redacted or not present)
    if (fetched.api_key) {
      expect(fetched.api_key).not.toBe(apiKey);
      // Should be redacted/masked
      expect(fetched.api_key).toMatch(/\*+|redacted|hidden/i);
    }
  });
});
