import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type EnvConfig = {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
};

const loadEnvFile = (): EnvConfig => {
  const envPath = resolve(process.cwd(), '.env');
  let content = '';
  try {
    content = readFileSync(envPath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read .env at ${envPath}: ${String(error)}`);
  }
  const entries = content.split(/\r?\n/);
  const config: EnvConfig = {};

  for (const line of entries) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    config[key as keyof EnvConfig] = value;
  }

  return config;
};

const env = loadEnvFile();

const requiredKey = env.OPENAI_API_KEY || '';
const baseUrlValue = env.OPENAI_BASE_URL || '';
const modelValue = env.OPENAI_MODEL || '';

test.describe('Browser E2E agents', () => {
  test.beforeAll(() => {
    if (!requiredKey) {
      throw new Error('OPENAI_API_KEY is required in .env for E2E tests');
    }
  });
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo/e2e.html');
    await page.getByLabel('OPENAI_API_KEY').fill(requiredKey);
    if (baseUrlValue) {
      await page.getByLabel('OPENAI_BASE_URL').fill(baseUrlValue);
    }
    if (modelValue) {
      await page.getByLabel('OPENAI_MODEL').fill(modelValue);
    }
  });

  test('ToolCallingAgent runs tool call', async ({ page }) => {
    await page.getByRole('button', { name: 'Run ToolCallingAgent' }).click();

    await expect(page.getByText('TOOL_CALL: get_weather')).toBeVisible({ timeout: 120000 });
    await expect(
      page.getByText(
        'TOOL_RESPONSE: The weather is UNGODLY with torrential rains and temperatures below -10C.'
      )
    ).toBeVisible({ timeout: 120000 });
    await expect(page.getByText('FINAL_ANSWER:')).toBeVisible({ timeout: 120000 });
  });

  test('CodeAgent generates code and returns final answer', async ({ page }) => {
    await page.getByRole('button', { name: 'Run CodeAgent' }).click();

    await expect(page.getByText('CODE_GENERATED:')).toBeVisible({ timeout: 120000 });
    await expect(page.getByText('EXECUTION_LOGS:')).toBeVisible({ timeout: 120000 });
    await expect(page.getByText('FINAL_ANSWER:')).toBeVisible({ timeout: 120000 });
    await expect(
      page.getByText('The weather is UNGODLY with torrential rains and temperatures below -10C.')
    ).toBeVisible({ timeout: 120000 });
  });
});
