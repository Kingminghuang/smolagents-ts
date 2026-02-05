/**
 * Test setup configuration
 */
import { beforeAll, afterAll, afterEach } from 'vitest';

// Global test setup
beforeAll(() => {
  const globalEnv = globalThis as typeof globalThis & {
    __TEST_ENV__?: Record<string, string | undefined>;
    process?: { env?: Record<string, string | undefined> };
  };

  const processEnv = globalEnv.process?.env ?? {};
  globalEnv.__TEST_ENV__ = {
    NODE_ENV: 'test',
    USE_REAL_DATA: 'false',
    ...processEnv,
    ...globalEnv.__TEST_ENV__,
  };
});

afterAll(() => {
  // Cleanup after all tests
});

afterEach(() => {
  // Cleanup after each test
});

// Mock environment variables
const globalEnv = globalThis as typeof globalThis & {
  __TEST_ENV__?: Record<string, string | undefined>;
  process?: { env?: Record<string, string | undefined> };
};

globalEnv.__TEST_ENV__ = globalEnv.__TEST_ENV__ ?? {};
if (!globalEnv.__TEST_ENV__.OPENAI_API_KEY) {
  globalEnv.__TEST_ENV__.OPENAI_API_KEY =
    globalEnv.process?.env?.OPENAI_API_KEY ?? 'sk-test-key-for-testing';
}
