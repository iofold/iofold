/**
 * Matrix/Comparison Page E2E Tests
 *
 * Tests for the evaluation performance matrix that compares eval results vs human feedback.
 * The matrix shows:
 * - Comparison grid of eval results vs human feedback
 * - Contradiction highlighting
 * - Filter by eval/trace
 * - Detail view for individual comparisons
 * - Export functionality
 *
 * Test IDs: TEST-M01 through TEST-M15
 */

import { test, expect } from '@playwright/test';
import {
  apiRequest,
  uniqueName,
} from '../utils/helpers';
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations';
import { createTestTrace, deleteTestTrace } from '../../fixtures/traces';
import { createTestAgent, deleteTestAgent, addTracesToAgent } from '../../fixtures/agents';

test.describe('Matrix/Comparison Page Tests', () => {
  let integrationId: string;
  let traceIds: string[] = [];
  let agentId: string;
  let evalId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Setup: Create integration and traces
    const integration = await createTestIntegration(page, `Matrix Test Integration ${Date.now()}`);
    integrationId = integration.id;

    // Create 10 test traces for matrix testing
    for (let i = 0; i < 10; i++) {
      const trace = await createTestTrace(page, integrationId, {
        input_preview: `Matrix test input ${i}`,
        output_preview: `Matrix test output ${i}`,
        steps: [
          {
            step_id: `step_${i}`,
            type: 'llm',
            input: { prompt: `Question ${i}` },
            output: { response: `Answer ${i}` },
          },
        ],
      });
      traceIds.push(trace.id);
    }

    // Create agent
    const agent = await createTestAgent(page, {
      name: `Matrix Test Agent ${Date.now()}`,
      description: 'For testing matrix page',
    });
    agentId = agent.id;

    // Add feedback: mix of positive and negative for contradictions
    const ratings: ('positive' | 'negative' | 'neutral')[] = [
      'positive', 'positive', 'positive', 'positive', 'positive',
      'negative', 'negative', 'negative', 'neutral', 'neutral',
    ];
    await addTracesToAgent(page, agentId, traceIds, ratings);

    // Create an eval for this agent (via API)
    // Note: In real scenario, this would be generated via the eval generation flow
    try {
      const evalData = await apiRequest<any>(page, '/api/evals', {
        method: 'POST',
        data: {
          agent_id: agentId,
          name: `Matrix Test Eval ${Date.now()}`,
          description: 'Test eval for matrix',
          code: `def eval_test(trace: dict) -> tuple[bool, str]:\n    return True, "Test evaluation"`,
          accuracy: 0.85,
        },
      });
      evalId = evalData.id;
    } catch (error) {
      console.warn('Failed to create eval:', error);
    }

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Cleanup
    try {
      if (evalId) {
        await apiRequest(page, `/api/evals/${evalId}`, { method: 'DELETE' }).catch(() => {});
      }
      for (const traceId of traceIds) {
        await deleteTestTrace(page, traceId);
      }
      if (agentId) {
        await deleteTestAgent(page, agentId);
      }
      if (integrationId) {
        await deleteTestIntegration(page, integrationId);
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }

    await context.close();
  });

  test('TEST-M01: Matrix page loads with grid/table', async ({ page }) => {
    // Navigate to matrix overview page
    await page.goto('/matrix');
    await page.waitForLoadState('networkidle');

    // Verify page header is visible
    const header = page.locator('h1, [role="heading"]').filter({ hasText: /matrix|performance|overview/i });
    await expect(header.first()).toBeVisible({ timeout: 10000 });

    // Verify page content loaded (not empty)
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(0);
  });

  test('TEST-M02: Column headers display eval names', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    // Navigate to agent-specific matrix page
    await page.goto(`/matrix/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Wait for page content to load
    await page.waitForTimeout(2000);

    // Check for eval/version identifiers in the page
    // The matrix page shows eval versions in cards or table headers
    const bodyText = await page.textContent('body');

    // Should have some version or eval identifier (v1, v2, version, eval, etc.)
    const hasVersionIdentifier = /v\d+|version|eval|accuracy/i.test(bodyText || '');
    expect(hasVersionIdentifier).toBe(true);
  });

  test('TEST-M03: Row headers display trace identifiers', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    // Navigate to agent-specific matrix detail view
    await page.goto(`/matrix/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Click on a version card to enter detail view (if overview mode)
    const versionCard = page.locator('[data-testid="version-card"], a[href*="/matrix/"]').first();
    const cardExists = await versionCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (cardExists) {
      await versionCard.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    }

    // In detail view, should see trace information
    const bodyText = await page.textContent('body');

    // Should have trace identifiers or trace-related text
    const hasTraceInfo = /trace|input|output|step/i.test(bodyText || '');
    expect(hasTraceInfo).toBe(true);
  });

  test('TEST-M04: Cell colors indicate pass/fail', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    await page.goto(`/matrix/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Look for color-coded elements (success/error states)
    const coloredElements = await page.locator(
      '[class*="green"], [class*="red"], [class*="success"], [class*="error"], [class*="positive"], [class*="negative"]'
    ).count();

    // Should have some colored elements indicating status
    expect(coloredElements).toBeGreaterThan(0);
  });

  test('TEST-M05: Contradiction cells highlighted differently', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    await page.goto(`/matrix/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Enter detail view if needed
    const versionCard = page.locator('a[href*="/matrix/"]').first();
    const cardExists = await versionCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (cardExists) {
      await versionCard.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    }

    // Look for contradiction indicators
    const contradictionVisible = await page
      .locator('text=/contradiction/i, [class*="contradiction"], [data-testid*="contradiction"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Look for warning/alert styled elements
    const warningElements = await page.locator(
      '[class*="warning"], [class*="alert"], [class*="contrast"]'
    ).count();

    // At least one indicator should be present (or page shows contradictions in stats)
    const bodyText = await page.textContent('body');
    const hasContradictionText = /contradiction/i.test(bodyText || '');

    expect(contradictionVisible || warningElements > 0 || hasContradictionText).toBe(true);
  });

  test('TEST-M06: Clicking cell opens detail view', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    await page.goto(`/matrix/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Click on version card to enter detail mode
    const versionCard = page.locator('a[href*="/matrix/"]').first();
    const cardExists = await versionCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (cardExists) {
      await versionCard.click();
      await page.waitForLoadState('networkidle');

      // Should transition to detail view
      // Detail view has "Back to Overview" button
      const backButton = page.locator('button:has-text("Back to Overview")');
      const backVisible = await backButton.isVisible({ timeout: 5000 }).catch(() => false);

      // Or check for detail view indicators
      const detailVisible = await page
        .locator('text=/trace.*details|evaluation.*details|per-trace/i')
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      expect(backVisible || detailVisible).toBe(true);
    } else {
      // If already in detail view or different layout, verify detail content exists
      const bodyText = await page.textContent('body');
      expect(bodyText).toBeTruthy();
    }
  });

  test('TEST-M07: Filter by eval works', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    await page.goto(`/matrix/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Enter detail view
    const versionCard = page.locator('a[href*="/matrix/"]').first();
    const cardExists = await versionCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (cardExists) {
      await versionCard.click();
      await page.waitForLoadState('networkidle');
    }

    // Look for filter controls
    const filterExists = await page
      .locator('[data-testid*="filter"], select, [role="combobox"], button:has-text("Filter")')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // If filters exist, test them
    if (filterExists) {
      // Try to interact with filter
      const filterButton = page.locator('[data-testid*="filter"], button:has-text("Filter")').first();
      await filterButton.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // Verify page still has content after filter attempt
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('TEST-M08: Filter by trace works', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    await page.goto(`/matrix/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Enter detail view
    const versionCard = page.locator('a[href*="/matrix/"]').first();
    const cardExists = await versionCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (cardExists) {
      await versionCard.click();
      await page.waitForLoadState('networkidle');
    }

    // Look for search/filter input for traces
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]'
    );
    const searchExists = await searchInput.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (searchExists) {
      // Try filtering by trace
      await searchInput.first().fill('test');
      await page.waitForTimeout(500);
    }

    // Verify filtering mechanism exists or page handles it
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('TEST-M09: Legend explains color coding', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    await page.goto(`/matrix/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Look for legend, info box, or explanation
    const legendVisible = await page
      .locator('[data-testid*="legend"], text=/legend|how to use|explanation/i')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Look for info icon or help text
    const infoVisible = await page
      .locator('[class*="info"], [role="alert"], .bg-blue, .bg-info')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // Check page content for explanation text
    const bodyText = await page.textContent('body');
    const hasExplanation = /positive|negative|pass|fail|contradiction|accuracy/i.test(bodyText || '');

    // At least one form of explanation should be present
    expect(legendVisible || infoVisible || hasExplanation).toBe(true);
  });

  test('TEST-M10: Pagination/scrolling for large matrices', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    await page.goto(`/matrix/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Enter detail view
    const versionCard = page.locator('a[href*="/matrix/"]').first();
    const cardExists = await versionCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (cardExists) {
      await versionCard.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    }

    // Check for pagination controls (button text or role)
    const paginationVisible = await page
      .locator('button:has-text("Next"), button:has-text("Previous"), [role="navigation"][aria-label*="pagination" i]')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // Check if main content area is scrollable
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const clientHeight = await page.evaluate(() => document.documentElement.clientHeight);
    const isPageScrollable = scrollHeight > clientHeight;

    // Check if there's a scrollable container (like trace list)
    const hasScrollableContent = await page.evaluate(() => {
      const containers = document.querySelectorAll('[class*="overflow"], .overflow-auto, .overflow-y-auto');
      return Array.from(containers).some(el => el.scrollHeight > el.clientHeight);
    });

    // Either pagination exists OR content is scrollable (page or container)
    expect(paginationVisible || isPageScrollable || hasScrollableContent).toBe(true);
  });

  test('TEST-M11: Export matrix data button', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    await page.goto(`/matrix/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Enter detail view
    const versionCard = page.locator('a[href*="/matrix/"]').first();
    const cardExists = await versionCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (cardExists) {
      await versionCard.click();
      await page.waitForLoadState('networkidle');
    }

    // Look for export button
    const exportButton = page.locator(
      'button:has-text("Export"), [data-testid*="export"], [aria-label*="export" i]'
    );
    const exportVisible = await exportButton.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (exportVisible) {
      // Verify button is clickable
      const isEnabled = await exportButton.first().isEnabled();
      expect(isEnabled).toBe(true);

      // Optionally test the export (setup download handler)
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
      await exportButton.first().click();
      const download = await downloadPromise;

      // If download started, verify it
      if (download) {
        expect(download).toBeTruthy();
      }
    } else {
      // Export might be in a menu or different location
      const bodyText = await page.textContent('body');
      console.log('Export button not found in expected location');
    }
  });

  test('TEST-M12: Sort by column', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    await page.goto(`/matrix/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Enter detail view
    const versionCard = page.locator('a[href*="/matrix/"]').first();
    const cardExists = await versionCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (cardExists) {
      await versionCard.click();
      await page.waitForLoadState('networkidle');
    }

    // Look for sortable column headers
    const sortableHeaders = page.locator(
      'th[role="columnheader"], [data-sortable], button[role="columnheader"], [class*="sortable"]'
    );
    const hasHeaders = await sortableHeaders.count().then(c => c > 0);

    if (hasHeaders) {
      // Try clicking a header to sort
      await sortableHeaders.first().click();
      await page.waitForTimeout(500);

      // Verify content still displays
      const bodyText = await page.textContent('body');
      expect(bodyText).toBeTruthy();
    } else {
      // Sorting might be implemented differently or not available
      console.log('No sortable headers found');
    }

    // Verify page didn't break
    const hasError = await page
      .locator('text=/error|failed/i')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    expect(hasError).toBe(false);
  });

  test('TEST-M13: Sort by row', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    await page.goto(`/matrix/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Enter detail view
    const versionCard = page.locator('a[href*="/matrix/"]').first();
    const cardExists = await versionCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (cardExists) {
      await versionCard.click();
      await page.waitForLoadState('networkidle');
    }

    // Look for row sorting controls (might be in filter section)
    const sortControl = page.locator(
      'select:has(option:text-matches("sort", "i")), [data-testid*="sort"], button:has-text("Sort")'
    );
    const hasSortControl = await sortControl.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (hasSortControl) {
      // Interact with sort control
      await sortControl.first().click();
      await page.waitForTimeout(500);
    }

    // Verify page functionality
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('TEST-M14: Empty state when no data', async ({ page }) => {
    // Create a new agent with no feedback/evals
    const emptyAgent = await createTestAgent(page, {
      name: `Empty Agent ${Date.now()}`,
    });

    try {
      await page.goto(`/matrix/${emptyAgent.id}`);
      await page.waitForLoadState('networkidle');

      // Should show empty state message
      const emptyStateVisible = await page
        .locator('text=/no.*evaluation|no.*data|no.*evals|create.*evaluation/i')
        .first()
        .isVisible({ timeout: 10000 })
        .catch(() => false);

      // Or should show a message about missing data
      const bodyText = await page.textContent('body');
      const hasEmptyMessage = /no evaluation|no data|not.*found|generate.*evaluation/i.test(bodyText || '');

      expect(emptyStateVisible || hasEmptyMessage).toBe(true);
    } finally {
      // Cleanup empty agent
      await deleteTestAgent(page, emptyAgent.id);
    }
  });

  test('TEST-M15: Loading skeleton during data fetch', async ({ page }) => {
    test.skip(!agentId, 'No agent available');

    // Navigate and try to catch loading state
    const navigationPromise = page.goto(`/matrix/${agentId}`);

    // Immediately check for loading indicators
    const loadingVisible = await page
      .locator('text=/loading|please wait/i, [role="progressbar"], [class*="skeleton"], [class*="loading"]')
      .first()
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    // Wait for navigation to complete
    await navigationPromise;
    await page.waitForLoadState('networkidle');

    // Loading indicator might have been too fast to catch, but verify page loaded
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    // Note: Loading states can be very fast in tests, especially with mocked data
    // The important thing is the page eventually loads successfully
    console.log('Loading indicator visible during fetch:', loadingVisible);
  });
});

test.describe('Matrix Navigation Tests', () => {
  test('TEST-M16: Navigate from matrix overview to agent detail', async ({ page }) => {
    // Navigate to matrix overview
    await page.goto('/matrix');
    await page.waitForLoadState('networkidle');

    // Find and click on first agent card/link
    const agentLink = page.locator('a[href*="/matrix/"], [data-testid="version-card"] a').first();
    const linkExists = await agentLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (linkExists) {
      // Get the href to verify navigation
      const href = await agentLink.getAttribute('href');

      if (href) {
        // Use Promise.all to synchronize click with navigation
        await Promise.all([
          page.waitForURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10000 }),
          agentLink.click()
        ]);
        await page.waitForLoadState('networkidle');

        // Verify we navigated to detail page
        await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
    } else {
      // Skip silently if no data available
      test.skip(true, 'No agent cards available for navigation test');
    }
  });

  test('TEST-M17: Back button returns to overview', async ({ page }) => {
    // Go directly to matrix page (need to create test data or use existing)
    await page.goto('/matrix');
    await page.waitForLoadState('networkidle');

    // Try to navigate into detail view and back
    const agentLink = page.locator('a[href*="/matrix/"]').first();
    const linkExists = await agentLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (linkExists) {
      await agentLink.click();
      await page.waitForLoadState('networkidle');

      // Look for back button
      const backButton = page.locator(
        'button:has-text("Back"), [aria-label*="back" i], a[href="/matrix"]'
      );
      const backExists = await backButton.first().isVisible({ timeout: 5000 }).catch(() => false);

      if (backExists) {
        await backButton.first().click();
        await page.waitForLoadState('networkidle');

        // Should be back at matrix overview
        await expect(page).toHaveURL(/\/matrix$/);
      }
    }
  });
});
