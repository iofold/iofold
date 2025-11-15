import { test, expect } from '@playwright/test'
import { createTestIntegration, deleteTestIntegration } from '../fixtures/integrations'

test('Test createTestIntegration fixture', async ({ page }) => {
  const integration = await createTestIntegration(page)
  console.log('Created integration:', integration)
  expect(integration).toHaveProperty('id')
  expect(integration.platform).toBe('langfuse')
  
  // Cleanup
  await deleteTestIntegration(page, integration.id)
})
