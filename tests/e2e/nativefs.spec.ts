/**
 * Web-WASM CodeAgent NativeFS E2E Tests
 * 
 * These tests validate Web-WASM with nativefs mode using Playwright.
 * 
 * Prerequisites:
 *   - npm run build
 *   - npx tsup --config tsup.browser.config.ts
 *   - OPENAI_API_KEY set in environment
 * 
 * Run in headed mode (required for File System Access API):
 *   npx playwright test tests/e2e/nativefs.spec.ts --headed
 * 
 * Run in debug mode:
 *   npx playwright test tests/e2e/nativefs.spec.ts --debug
 */

import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

test.setTimeout(300000); // 5 minutes

const PORT = process.env.E2E_PORT || 3456;
const BASE_URL = `http://localhost:${PORT}`;

// Create temp test directory
function createTestDir(): string {
  const testDir = join(tmpdir(), `smolagents-nativefs-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

// Skip all tests if no API key
const hasApiKey = !!process.env.OPENAI_API_KEY;

test.describe('Web-WASM NativeFS Tests', () => {
  test.beforeAll(() => {
    test.skip(!hasApiKey, 'OPENAI_API_KEY not set - skipping E2E tests');
  });

  test('Test 1: Read normal file with nativefs', async ({ page, context }, testInfo) => {
    const testDir = createTestDir();
    console.log(`Test directory: ${testDir}`);

    // Create test file
    writeFileSync(join(testDir, 'test.txt'), 'Hello, world!\nLine 2\nLine 3');

    try {
      // Grant permissions for file system access
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      // Navigate to test page
      await page.goto(`${BASE_URL}/tests/e2e/nativefs-test.html`);

      // Fill in config
      await page.fill('#apiKey', process.env.OPENAI_API_KEY!);
      await page.fill('#baseURL', process.env.OPENAI_BASE_URL || 'https://api.deepseek.com');
      await page.fill('#model', process.env.OPENAI_MODEL || 'deepseek-chat');
      await page.fill('#testId', 'test_read_01');

      // Click select directory and handle the picker
      // Note: In headed mode, this will show a dialog that Playwright can interact with
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('#selectDirBtn'),
      ]);

      // Set the test directory
      await fileChooser.setFiles([testDir]);

      // Wait for directory to be selected
      await expect(page.locator('#status')).toContainText('Selected:', { timeout: 10000 });

      // Run the test
      await page.click('#runBtn');

      // Wait for test to complete
      await expect(page.locator('#status')).toContainText(/PASS|FAIL/, { timeout: 120000 });

      // Get result
      const result = await page.evaluate(() => (window as any).__TEST_RESULT__);
      console.log('Test result:', result);

      // Verify result
      expect(result).toBeDefined();
      expect(result.status).toBe('pass');
      expect(result.output).toContain('Hello, world!');
      expect(result.testId).toBe('test_read_01');

    } finally {
      // Cleanup
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    }
  });

  test('Test 12: Write new file with nativefs', async ({ page, context }) => {
    const testDir = createTestDir();
    console.log(`Test directory: ${testDir}`);

    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(`${BASE_URL}/tests/e2e/nativefs-test.html`);

      // Fill config
      await page.fill('#apiKey', process.env.OPENAI_API_KEY!);
      await page.fill('#baseURL', process.env.OPENAI_BASE_URL || 'https://api.deepseek.com');
      await page.fill('#model', process.env.OPENAI_MODEL || 'deepseek-chat');
      await page.fill('#testId', 'test_write_12');

      // Select directory
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('#selectDirBtn'),
      ]);
      await fileChooser.setFiles([testDir]);

      await expect(page.locator('#status')).toContainText('Selected:', { timeout: 10000 });

      // Run test
      await page.click('#runBtn');
      await expect(page.locator('#status')).toContainText(/PASS|FAIL/, { timeout: 120000 });

      // Verify result
      const result = await page.evaluate(() => (window as any).__TEST_RESULT__);
      console.log('Write test result:', result);

      expect(result).toBeDefined();
      expect(result.status).toBe('pass');

      // Verify file was actually created
      const files = readdirSync(testDir);
      console.log('Files in test dir:', files);
      expect(files).toContain('write-test.txt');

    } finally {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    }
  });

  test('Test 14: Edit file with nativefs', async ({ page, context }) => {
    const testDir = createTestDir();
    console.log(`Test directory: ${testDir}`);

    // Create file to edit
    writeFileSync(join(testDir, 'edit-test.txt'), 'Hello, world!');

    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(`${BASE_URL}/tests/e2e/nativefs-test.html`);

      // Fill config
      await page.fill('#apiKey', process.env.OPENAI_API_KEY!);
      await page.fill('#baseURL', process.env.OPENAI_BASE_URL || 'https://api.deepseek.com');
      await page.fill('#model', process.env.OPENAI_MODEL || 'deepseek-chat');
      await page.fill('#testId', 'test_edit_14');

      // Select directory
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('#selectDirBtn'),
      ]);
      await fileChooser.setFiles([testDir]);

      await expect(page.locator('#status')).toContainText('Selected:', { timeout: 10000 });

      // Run test
      await page.click('#runBtn');
      await expect(page.locator('#status')).toContainText(/PASS|FAIL/, { timeout: 120000 });

      // Verify result
      const result = await page.evaluate(() => (window as any).__TEST_RESULT__);
      console.log('Edit test result:', result);

      expect(result).toBeDefined();
      expect(result.status).toBe('pass');

      // Verify file was edited
      const content = readFileSync(join(testDir, 'edit-test.txt'), 'utf-8');
      console.log('File content after edit:', content);
      expect(content).toContain('testing');

    } finally {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    }
  });
});
