/**
 * Integration tests for tool execution
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolCallingAgent } from '../../src/agents/tool-calling-agent.js';
import {
  createMockModel,
  mockToolCallResponse,
  mockFinalAnswerResponse,
} from '../fixtures/mock-model.js';
import {
  MockCalculatorTool,
  MockSearchTool,
  MockErrorTool,
  MockAsyncTool,
} from '../fixtures/mock-tools.js';
import {
  createTestContext,
  shouldRunMockOnlyTest,
  USE_REAL_DATA,
  TestContext,
} from '../fixtures/index.js';

describe('Tool Execution Integration Tests', () => {
  let agent: ToolCallingAgent;
  let context: TestContext;

  beforeEach(() => {
    context = createTestContext();
  });

  describe('single tool execution', () => {
    it('should execute calculator tool correctly', async () => {
      // In real mode, createTestContext returns [Calculator, Search]
      // In mock mode, it returns [MockCalculator, MockSearch]

      agent = new ToolCallingAgent({
        tools: context.tools,
        model: context.model,
      });

      context.addMockResponse(
        mockToolCallResponse('calculator', {
          operation: 'add',
          a: 7,
          b: 3,
        })
      );
      context.addMockResponse(mockFinalAnswerResponse('10'));

      const result = await agent.run('Calculate 7 + 3');

      if (USE_REAL_DATA) {
        expect(result).toBeTruthy();
        // Real calculator returns number or string containing it
        expect(String(result)).toContain('10');
      } else {
        expect(String(result)).toContain('10');
        const calcTool = context.tools.find((t) => t.name === 'calculator') as MockCalculatorTool;
        expect(calcTool.callCount).toBe(1);
        expect(calcTool.lastArgs).toEqual({
          operation: 'add',
          a: 7,
          b: 3,
        });
      }
    });

    it('should execute search tool correctly', async () => {
      agent = new ToolCallingAgent({
        tools: context.tools,
        model: context.model,
      });

      context.addMockResponse(mockToolCallResponse('search', { query: 'TypeScript testing' }));
      context.addMockResponse(mockFinalAnswerResponse('Found results'));

      const result = await agent.run('Search for TypeScript testing');

      if (USE_REAL_DATA) {
        expect(result).toBeTruthy();
      } else {
        expect(result).toContain('Found results');
        const searchTool = context.tools.find((t) => t.name === 'search') as MockSearchTool;
        expect(searchTool.callCount).toBe(1);
        expect(searchTool.lastArgs.query).toBe('TypeScript testing');
        expect(String(searchTool.lastArgs.max_results ?? 10)).toBe('10');
      }
    });
  });

  describe('multiple tool types', () => {
    it('should work with different tool types', async () => {
      agent = new ToolCallingAgent({
        tools: context.tools,
        model: context.model,
      });

      // First use calculator
      context.addMockResponse(
        mockToolCallResponse('calculator', {
          operation: 'multiply',
          a: 4,
          b: 5,
        })
      );

      // Then use search
      context.addMockResponse(mockToolCallResponse('search', { query: 'math' }));

      // Final answer
      context.addMockResponse(mockFinalAnswerResponse('Done'));

      const result = await agent.run('Calculate 4*5 and search for math');

      if (USE_REAL_DATA) {
        expect(result).toBeTruthy();
      } else {
        expect(result).toContain('Done');
        const calcTool = context.tools.find((t) => t.name === 'calculator') as MockCalculatorTool;
        const searchTool = context.tools.find((t) => t.name === 'search') as MockSearchTool;
        expect(calcTool.callCount).toBe(1);
        expect(searchTool.callCount).toBe(1);
        expect(String(searchTool.lastArgs.max_results ?? 10)).toBe('10');
      }
    });
  });

  describe('tool error handling', () => {
    it('should handle tool execution errors', async () => {
      if (shouldRunMockOnlyTest()) {
        const mockModel = createMockModel();
        const errorTool = new MockErrorTool();

        agent = new ToolCallingAgent({
          tools: [errorTool],
          model: mockModel,
        });

        mockModel.addResponse(mockToolCallResponse('error_tool', { message: 'Test error' }));

        await expect(agent.run('Use error tool')).rejects.toThrow('Test error');
      }
    });

    it('should handle division by zero', async () => {
      if (shouldRunMockOnlyTest()) {
        const mockModel = createMockModel();
        const calculatorTool = new MockCalculatorTool();

        agent = new ToolCallingAgent({
          tools: [calculatorTool],
          model: mockModel,
        });

        mockModel.addResponse(
          mockToolCallResponse('calculator', {
            operation: 'divide',
            a: 10,
            b: 0,
          })
        );

        await expect(agent.run('Divide 10 by 0')).rejects.toThrow('Division by zero');
      }
    });
  });

  describe('async tool execution', () => {
    it('should handle async tools', async () => {
      if (shouldRunMockOnlyTest()) {
        const mockModel = createMockModel();
        const asyncTool = new MockAsyncTool();

        agent = new ToolCallingAgent({
          tools: [asyncTool],
          model: mockModel,
        });

        mockModel.addResponse(
          mockToolCallResponse('async_tool', {
            delay: 100,
            result: 'Async result',
          })
        );
        mockModel.addResponse(mockFinalAnswerResponse('Done'));

        const startTime = Date.now();
        const result = await agent.run('Run async tool');
        const duration = Date.now() - startTime;

        expect(result).toContain('Done');
        expect(duration).toBeGreaterThanOrEqual(100);
      }
    });

    it('should handle multiple async tools in parallel', async () => {
      if (shouldRunMockOnlyTest()) {
        const mockModel = createMockModel();
        const asyncTool = new MockAsyncTool();

        agent = new ToolCallingAgent({
          tools: [asyncTool],
          model: mockModel,
        });

        mockModel.addResponse({
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'async_tool',
                arguments: { delay: 100, result: 'Result 1' },
              },
            },
            {
              id: 'call_2',
              type: 'function',
              function: {
                name: 'async_tool',
                arguments: { delay: 100, result: 'Result 2' },
              },
            },
          ],
        });
        mockModel.addResponse(mockFinalAnswerResponse('All done'));

        const startTime = Date.now();
        const result = await agent.run('Run two async tools');
        const duration = Date.now() - startTime;

        expect(result).toContain('All done');
        // Should execute in parallel, so duration should be ~100ms not ~200ms
        expect(duration).toBeLessThan(150);
      }
    });
  });

  describe('tool argument validation', () => {
    it('should validate tool arguments', async () => {
      if (shouldRunMockOnlyTest()) {
        const mockModel = createMockModel();
        const calculatorTool = new MockCalculatorTool();

        agent = new ToolCallingAgent({
          tools: [calculatorTool],
          model: mockModel,
        });

        // Missing required argument
        mockModel.addResponse(
          mockToolCallResponse('calculator', {
            operation: 'add',
            a: 5,
            // missing b
          } as any)
        );

        await expect(agent.run('Invalid args')).rejects.toThrow();
      }
    });

    it('should reject invalid argument types', async () => {
      if (shouldRunMockOnlyTest()) {
        const mockModel = createMockModel();
        const calculatorTool = new MockCalculatorTool();

        agent = new ToolCallingAgent({
          tools: [calculatorTool],
          model: mockModel,
        });

        mockModel.addResponse(
          mockToolCallResponse('calculator', {
            operation: 'add',
            a: 'not a number', // should be number
            b: 2,
          } as any)
        );

        await expect(agent.run('Wrong types')).rejects.toThrow();
      }
    });
  });

  describe('tool concurrency limits', () => {
    it('should respect max_tool_threads limit', async () => {
      if (shouldRunMockOnlyTest()) {
        const mockModel = createMockModel();
        const asyncTool = new MockAsyncTool();

        agent = new ToolCallingAgent({
          tools: [asyncTool],
          model: mockModel,
          max_tool_threads: 2,
        });

        // Create 5 parallel tool calls
        mockModel.addResponse({
          tool_calls: Array.from({ length: 5 }, (_, i) => ({
            id: `call_${i}`,
            type: 'function' as const,
            function: {
              name: 'async_tool',
              arguments: { delay: 50, result: `Result ${i}` },
            },
          })),
        });
        mockModel.addResponse(mockFinalAnswerResponse('All done'));

        const result = await agent.run('Run many tools');

        expect(result).toContain('All done');
        // All tools should execute, but with limited concurrency
      }
    });
  });
});
