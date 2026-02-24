import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 3456;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 300000, // 5 minutes per test
  expect: {
    timeout: 180000, // 3 minutes for assertions
  },
  fullyParallel: false, // Run tests sequentially since they use browser dialogs
  workers: 1, // Single worker for headed mode with dialogs
  use: {
    baseURL: `http://localhost:${port}`,
    headless: false, // Required for File System Access API
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Browser permissions for File System Access API
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx serve . -l ${port}`,
    url: `http://localhost:${port}/tests/e2e/nativefs-test.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
