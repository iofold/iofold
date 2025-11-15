import { test, expect } from '@playwright/test'
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations'

test.describe('Integration Fixtures', () => {
  test('TEST-FIX-01: createTestIntegration and deleteTestIntegration', async ({ page }) => {
    // Create an integration using the fixture
    const integration = await createTestIntegration(page)

    // Verify the integration was created
    expect(integration).toHaveProperty('id')
    expect(integration).toHaveProperty('name')
    expect(integration.platform).toBe('langfuse')
    expect(integration.status).toBe('active')

    // Cleanup - delete the integration
    await deleteTestIntegration(page, integration.id)
  })
})
