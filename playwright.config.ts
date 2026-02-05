import { defineConfig } from '@playwright/test';

const port = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 3000;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180000,
  expect: {
    timeout: 120000,
  },
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx serve . -l ${port}`,
    url: `http://localhost:${port}/demo/e2e.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
