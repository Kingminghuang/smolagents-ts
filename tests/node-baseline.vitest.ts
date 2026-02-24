/**
 * Vitest wrapper for Node-WASM Baseline Generator
 * 
 * This allows running the baseline generator through Vitest
 * for CI/CD integration.
 */

import { test, expect, describe } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

describe('Node-WASM Baseline Generator', () => {
  const baselineFile = join(process.cwd(), 'test-node-baseline.json');

  test('should generate baseline JSON file', { timeout: 600000 }, () => {
    // Remove existing baseline
    if (existsSync(baselineFile)) {
      rmSync(baselineFile);
    }

    // Run the baseline generator
    const result = execSync('npx tsx tests/test-node-codeagent-validation.ts', {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: process.env,
    });

    console.log(result);

    // Verify baseline file was created
    expect(existsSync(baselineFile)).toBe(true);

    // Verify it's valid JSON
    const content = readFileSync(baselineFile, 'utf-8');
    const baseline = JSON.parse(content);

    // Verify structure
    expect(baseline).toHaveProperty('timestamp');
    expect(baseline).toHaveProperty('environment', 'node-wasm');
    expect(baseline).toHaveProperty('fsMode', 'nodefs');
    expect(baseline).toHaveProperty('totalTests');
    expect(baseline).toHaveProperty('passed');
    expect(baseline).toHaveProperty('failed');
    expect(baseline).toHaveProperty('results');
    expect(Array.isArray(baseline.results)).toBe(true);

    // Verify at least some tests passed
    expect(baseline.passed).toBeGreaterThan(0);
  });

  test('baseline should contain expected test cases', (ctx) => {
    if (!existsSync(baselineFile)) {
      ctx.skip();
      return;
    }

    const content = readFileSync(baselineFile, 'utf-8');
    const baseline = JSON.parse(content);

    const expectedTests = [
      'test_read_01',
      'test_write_12',
      'test_edit_14',
    ];

    for (const testId of expectedTests) {
      const testResult = baseline.results.find((r: any) => r.testId === testId);
      expect(testResult, `Missing test: ${testId}`).toBeDefined();
      expect(testResult).toHaveProperty('status');
      expect(testResult).toHaveProperty('output');
    }
  });
});
