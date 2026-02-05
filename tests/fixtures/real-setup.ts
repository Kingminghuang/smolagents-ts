import { createMockModel, MockModel, MockModelResponse } from './mock-model.js';
import { createMockTools } from './mock-tools.js';
import { OpenAIModel } from '../../src/models/openai-model.js';
import { CalculatorTool, SearchTool } from '../../src/tools/default-tools.js';
import { BaseTool } from '../../src/tools/base-tool.js';
import { BaseModel } from '../../src/models/base-model.js';

const globalEnv = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
  __TEST_ENV__?: Record<string, string | undefined>;
};

const env = globalEnv.__TEST_ENV__ ?? {};

const readBoolean = (value: string | undefined): boolean => (value ?? '').toLowerCase() === 'true';

export const USE_REAL_DATA = readBoolean(env.USE_REAL_DATA);

export interface TestContext {
  model: BaseModel;
  tools: BaseTool[];
  isMock: boolean;
  addMockResponse: (response: MockModelResponse) => void;
}

/**
 * Create test context with either mock or real components
 */
export function createTestContext(): TestContext {
  if (USE_REAL_DATA) {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when USE_REAL_DATA is true');
    }

    const model = new OpenAIModel({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL,
      defaultModel: env.OPENAI_MODEL || 'gpt-4o',
    });

    // Use real tools
    const tools = [new CalculatorTool(), new SearchTool({ useMock: false })];

    return {
      model,
      tools,
      isMock: false,
      addMockResponse: () => {
        /* no-op for real model */
      },
    };
  } else {
    const model = createMockModel();
    const toolsMap = createMockTools();
    const tools = [toolsMap.calculator, toolsMap.search];

    return {
      model,
      tools,
      isMock: true,
      addMockResponse: (response: MockModelResponse) => model.addResponse(response),
    };
  }
}

/**
 * Helper to check if we should run a specific test
 * Useful for skipping tests that rely on specific mock behaviors not present in real models
 */
export function shouldRunGenericTest(): boolean {
  return true; // Generic tests should run in both modes
}

export function shouldRunMockOnlyTest(): boolean {
  return !USE_REAL_DATA;
}
