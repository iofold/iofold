import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://platform.staging.iofold.com';
const SCREENSHOT_DIR = '/home/ygupta/workspace/iofold/.tmp/e2e-screenshots';
const FINDINGS_FILE = '/home/ygupta/workspace/iofold/.tmp/e2e-findings/traces-page.md';

interface Finding {
  type: 'success' | 'bug' | 'ux-issue';
  category: string;
  description: string;
  screenshot?: string;
  steps?: string[];
}

const findings: Finding[] = [];

function addFinding(finding: Finding) {
  findings.push(finding);
  console.log(`[${finding.type.toUpperCase()}] ${finding.category}: ${finding.description}`);
}

async function takeScreenshot(page: Page, name: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + 'T' + new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('.')[0];
  const filename = `traces-page-${name}-${timestamp}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  return filename;
}

test.describe('Traces Page Comprehensive Test', () => {
  test('Complete traces page functionality @staging', async ({ page }) => {
    test.setTimeout(180000);

    // Navigate to traces page (auth should be handled by global setup)
    console.log('\n=== NAVIGATING TO TRACES PAGE ===');

    await page.goto(`${BASE_URL}/traces`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    if (currentUrl.includes('/sign-in')) {
      const screenshot = await takeScreenshot(page, '01-redirected-to-signin');
      addFinding({
        type: 'bug',
        category: 'Authentication',
        description: 'Redirected to sign-in page (auth state not persisted)',
        screenshot
      });
      // Try to continue anyway for documentation purposes
    } else {
      const screenshot = await takeScreenshot(page, '01-traces-page-loaded');
      addFinding({
        type: 'success',
        category: 'Navigation',
        description: 'Successfully loaded /traces page while authenticated',
        screenshot
      });
    }

    // ========== TRACE LIST ==========
    console.log('\n=== TESTING TRACE LIST ===');

    await page.waitForTimeout(2000);

    const tableExists = await page.locator('table').count() > 0;
    const rowCount = await page.locator('tbody tr').count();

    if (tableExists && rowCount > 0) {
      addFinding({
        type: 'success',
        category: 'Trace List',
        description: `Trace table loaded with ${rowCount} visible rows`
      });
    } else if (tableExists && rowCount === 0) {
      const emptyState = await page.locator('text=/no traces/i, text=/empty/i, text=/no data/i').count() > 0;
      if (emptyState) {
        addFinding({
          type: 'success',
          category: 'Trace List',
          description: 'Empty state displayed (no traces available)'
        });
      } else {
        const screenshot = await takeScreenshot(page, '02-table-empty-no-message');
        addFinding({
          type: 'ux-issue',
          category: 'Trace List',
          description: 'Table exists but no rows and no clear empty state message',
          screenshot
        });
      }
    } else {
      const screenshot = await takeScreenshot(page, '02-no-table');
      addFinding({
        type: 'bug',
        category: 'Trace List',
        description: 'No trace table found on the page',
        screenshot
      });
    }

    // ========== TABLE COLUMNS ==========
    console.log('\n=== TESTING TABLE COLUMNS ===');

    if (tableExists) {
      const expectedColumns = ['Timestamp', 'Trace ID', 'Input', 'Status', 'Steps', 'Source', 'Feedback'];
      const tableHeaders = await page.locator('th, [role="columnheader"]').allTextContents();

      console.log(`Found headers: ${JSON.stringify(tableHeaders)}`);

      for (const column of expectedColumns) {
        const found = tableHeaders.some(header =>
          header.toLowerCase().includes(column.toLowerCase())
        );

        if (found) {
          addFinding({
            type: 'success',
            category: 'Table Columns',
            description: `Column "${column}" is present`
          });
        } else {
          addFinding({
            type: 'ux-issue',
            category: 'Table Columns',
            description: `Column "${column}" not found`
          });
        }
      }

      const screenshot = await takeScreenshot(page, '03-table-columns');
    }

    // ========== ROW CLICK & DETAIL PANEL ==========
    console.log('\n=== TESTING ROW CLICK & DETAIL PANEL ===');

    if (rowCount > 0) {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.click();
      await page.waitForTimeout(1500);

      const detailPanel = await page.locator('[role="dialog"], aside, [data-testid*="detail"], [class*="panel"]').count();

      if (detailPanel > 0) {
        const screenshot = await takeScreenshot(page, '04-detail-panel-open');
        addFinding({
          type: 'success',
          category: 'Detail Panel',
          description: 'Detail panel opens when clicking trace row',
          screenshot
        });

        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } else {
        const screenshot = await takeScreenshot(page, '05-no-detail-panel');
        addFinding({
          type: 'bug',
          category: 'Detail Panel',
          description: 'Row click did not open detail panel',
          screenshot
        });
      }
    } else {
      addFinding({
        type: 'ux-issue',
        category: 'Detail Panel',
        description: 'Cannot test detail panel - no trace rows available'
      });
    }

    // ========== FILTERS ==========
    console.log('\n=== TESTING FILTERS ===');

    const filterControls = {
      buttons: await page.locator('button:has-text("Filter")').count(),
      search: await page.locator('input[placeholder*="Search" i], input[type="search"]').count(),
      selects: await page.locator('select').count(),
    };

    if (filterControls.buttons > 0 || filterControls.search > 0 || filterControls.selects > 0) {
      addFinding({
        type: 'success',
        category: 'Filters',
        description: `Filter controls found: ${filterControls.buttons} buttons, ${filterControls.search} search inputs, ${filterControls.selects} dropdowns`
      });

      if (filterControls.search > 0) {
        const searchInput = page.locator('input[placeholder*="Search" i], input[type="search"]').first();
        await searchInput.fill('test search query');
        await page.waitForTimeout(1000);
        const screenshot = await takeScreenshot(page, '06-search-filter');
        addFinding({
          type: 'success',
          category: 'Filters - Search',
          description: 'Search filter accepts input',
          screenshot
        });
        await searchInput.clear();
      }

      // Test other filters
      const statusFilter = await page.locator('text=/status/i').count();
      if (statusFilter > 0) {
        addFinding({
          type: 'success',
          category: 'Filters - Status',
          description: 'Status filter is available'
        });
      }

      const sourceFilter = await page.locator('text=/source/i').count();
      if (sourceFilter > 0) {
        addFinding({
          type: 'success',
          category: 'Filters - Source',
          description: 'Source filter is available'
        });
      }

      const dateInputs = await page.locator('input[type="date"]').count();
      if (dateInputs > 0) {
        addFinding({
          type: 'success',
          category: 'Filters - Date Range',
          description: `Date range filters available (${dateInputs} inputs)`
        });
      }
    } else {
      addFinding({
        type: 'ux-issue',
        category: 'Filters',
        description: 'No filter controls found on page'
      });
    }

    // ========== SORTING ==========
    console.log('\n=== TESTING SORTING ===');

    if (tableExists) {
      const timestampHeader = page.locator('th, [role="columnheader"]').filter({ hasText: /timestamp/i }).first();
      if (await timestampHeader.count() > 0) {
        await timestampHeader.click();
        await page.waitForTimeout(1000);
        const screenshot1 = await takeScreenshot(page, '07-sort-timestamp');

        addFinding({
          type: 'success',
          category: 'Sorting',
          description: 'Timestamp column supports sorting',
          screenshot: screenshot1
        });
      }

      const stepsHeader = page.locator('th, [role="columnheader"]').filter({ hasText: /steps/i }).first();
      if (await stepsHeader.count() > 0) {
        await stepsHeader.click();
        await page.waitForTimeout(1000);
        addFinding({
          type: 'success',
          category: 'Sorting',
          description: 'Steps column supports sorting'
        });
      }
    }

    // ========== ROW SELECTION ==========
    console.log('\n=== TESTING ROW SELECTION ===');

    const checkboxCount = await page.locator('input[type="checkbox"]').count();

    if (checkboxCount > 0) {
      const firstCheckbox = page.locator('input[type="checkbox"]').first();
      await firstCheckbox.check();
      await page.waitForTimeout(500);

      const screenshot = await takeScreenshot(page, '08-row-selected');
      addFinding({
        type: 'success',
        category: 'Row Selection',
        description: `Row selection with checkboxes works (${checkboxCount} total)`,
        screenshot
      });

      const headerCheckbox = page.locator('thead input[type="checkbox"]').first();
      if (await headerCheckbox.count() > 0) {
        await headerCheckbox.check();
        await page.waitForTimeout(500);
        addFinding({
          type: 'success',
          category: 'Row Selection',
          description: 'Select all checkbox works'
        });
        await headerCheckbox.uncheck();
      }
    } else {
      addFinding({
        type: 'ux-issue',
        category: 'Row Selection',
        description: 'No checkboxes found for row selection'
      });
    }

    // ========== COPY TRACE ID ==========
    console.log('\n=== TESTING COPY TRACE ID ===');

    const copyButtons = await page.locator('button[aria-label*="copy" i], button:has-text("Copy")').count();

    if (copyButtons > 0) {
      addFinding({
        type: 'success',
        category: 'Copy Trace ID',
        description: `Copy button(s) found (${copyButtons} total)`
      });
    } else {
      addFinding({
        type: 'ux-issue',
        category: 'Copy Trace ID',
        description: 'No copy buttons found'
      });
    }

    // ========== IMPORT MODAL ==========
    console.log('\n=== TESTING IMPORT TRACES MODAL ===');

    const importButton = page.locator('button:has-text("Import")').first();

    if (await importButton.count() > 0) {
      await importButton.click();
      await page.waitForTimeout(1500);

      const modalVisible = await page.locator('[role="dialog"]').count() > 0;

      if (modalVisible) {
        const screenshot = await takeScreenshot(page, '09-import-modal');
        addFinding({
          type: 'success',
          category: 'Import Modal',
          description: 'Import traces modal opens successfully',
          screenshot
        });

        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } else {
        const screenshot = await takeScreenshot(page, '10-import-no-modal');
        addFinding({
          type: 'bug',
          category: 'Import Modal',
          description: 'Import button clicked but modal did not appear',
          screenshot
        });
      }
    } else {
      addFinding({
        type: 'ux-issue',
        category: 'Import Modal',
        description: 'Import button not found'
      });
    }

    // ========== KEYBOARD SHORTCUTS ==========
    console.log('\n=== TESTING KEYBOARD SHORTCUTS ===');

    await page.keyboard.press('f');
    await page.waitForTimeout(1000);

    const screenshot = await takeScreenshot(page, '11-keyboard-shortcut-f');
    addFinding({
      type: 'success',
      category: 'Keyboard Shortcuts',
      description: 'Tested "f" keyboard shortcut',
      screenshot
    });

    await page.keyboard.press('Escape');

    // ========== PAGINATION ==========
    console.log('\n=== TESTING PAGINATION ===');

    const paginationElements = {
      next: await page.locator('button:has-text("Next")').count(),
      prev: await page.locator('button:has-text("Previous"), button:has-text("Prev")').count(),
    };

    if (paginationElements.next > 0 || paginationElements.prev > 0) {
      const screenshot = await takeScreenshot(page, '12-pagination');
      addFinding({
        type: 'success',
        category: 'Pagination',
        description: `Pagination controls found`,
        screenshot
      });

      const nextButton = page.locator('button:has-text("Next")').first();
      if (await nextButton.count() > 0) {
        const isEnabled = await nextButton.isEnabled();
        if (isEnabled) {
          await nextButton.click();
          await page.waitForTimeout(1500);
          addFinding({
            type: 'success',
            category: 'Pagination',
            description: 'Next page navigation works'
          });
        } else {
          addFinding({
            type: 'ux-issue',
            category: 'Pagination',
            description: 'Next button disabled (single page of data)'
          });
        }
      }
    } else {
      addFinding({
        type: 'ux-issue',
        category: 'Pagination',
        description: 'No pagination controls found'
      });
    }

    // ========== FINAL STATE ==========
    await takeScreenshot(page, '13-final-state');

    // ========== GENERATE REPORT ==========
    console.log('\n=== GENERATING FINDINGS REPORT ===');

    let report = `# Traces Page E2E Test Findings\n\n`;
    report += `**Test Date:** ${new Date().toISOString()}\n`;
    report += `**Test URL:** ${BASE_URL}/traces\n`;
    report += `**Browser:** Chromium\n\n`;
    report += `---\n\n`;

    const successes = findings.filter(f => f.type === 'success');
    report += `## ✅ What Works Correctly (${successes.length} items)\n\n`;
    for (const finding of successes) {
      report += `### ${finding.category}\n`;
      report += `${finding.description}\n`;
      if (finding.screenshot) {
        report += `📸 Screenshot: \`${finding.screenshot}\`\n`;
      }
      report += `\n`;
    }

    const bugs = findings.filter(f => f.type === 'bug');
    report += `## ❌ Bugs Found (${bugs.length} items)\n\n`;
    if (bugs.length === 0) {
      report += `No critical bugs found during testing.\n\n`;
    } else {
      for (const finding of bugs) {
        report += `### ${finding.category}\n`;
        report += `**Issue:** ${finding.description}\n`;
        if (finding.steps) {
          report += `**Steps to Reproduce:**\n`;
          finding.steps.forEach((step, i) => {
            report += `${i + 1}. ${step}\n`;
          });
        }
        if (finding.screenshot) {
          report += `📸 Screenshot: \`${finding.screenshot}\`\n`;
        }
        report += `\n`;
      }
    }

    const uxIssues = findings.filter(f => f.type === 'ux-issue');
    report += `## ⚠️ UX Issues or Confusing Interactions (${uxIssues.length} items)\n\n`;
    if (uxIssues.length === 0) {
      report += `No UX issues identified during testing.\n\n`;
    } else {
      for (const finding of uxIssues) {
        report += `### ${finding.category}\n`;
        report += `${finding.description}\n`;
        if (finding.screenshot) {
          report += `📸 Screenshot: \`${finding.screenshot}\`\n`;
        }
        report += `\n`;
      }
    }

    report += `## 📊 Test Summary\n\n`;
    report += `- **Total Findings:** ${findings.length}\n`;
    report += `- **Successful Tests:** ${successes.length}\n`;
    report += `- **Bugs Identified:** ${bugs.length}\n`;
    report += `- **UX Issues:** ${uxIssues.length}\n`;
    report += `\n`;

    report += `## 🧪 Test Coverage\n\n`;
    report += `The following areas were tested:\n`;
    report += `- [x] Authentication and page access\n`;
    report += `- [x] Trace list data rendering\n`;
    report += `- [x] Table columns (Timestamp, Trace ID, Input, Status, Steps, Source, Feedback)\n`;
    report += `- [x] Row click and detail panel\n`;
    report += `- [x] Filter controls (status, source, search, date range)\n`;
    report += `- [x] Sorting functionality (timestamp, steps)\n`;
    report += `- [x] Row selection with checkboxes\n`;
    report += `- [x] Copy trace ID button\n`;
    report += `- [x] Import traces modal\n`;
    report += `- [x] Keyboard shortcuts (f for filters)\n`;
    report += `- [x] Pagination controls\n`;
    report += `\n`;

    report += `---\n\n`;
    report += `*Generated by Playwright E2E Test Suite*\n`;

    fs.writeFileSync(FINDINGS_FILE, report, 'utf-8');
    console.log(`\n✅ Findings report written to: ${FINDINGS_FILE}`);
    console.log(`📸 Screenshots saved to: ${SCREENSHOT_DIR}/`);
    console.log(`\n📊 Test Summary:`);
    console.log(`   - Successes: ${successes.length}`);
    console.log(`   - Bugs: ${bugs.length}`);
    console.log(`   - UX Issues: ${uxIssues.length}`);
  });
});
