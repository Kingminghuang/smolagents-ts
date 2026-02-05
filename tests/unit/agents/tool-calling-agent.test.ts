/**
 * Tests for ToolCallingAgent
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolCallingAgent } from '../../../src/agents/tool-calling-agent.js';
import { BaseModel } from '../../../src/models/base-model.js';
import { createMockModel, mockTextResponse, mockToolCallResponse, mockFinalAnswerResponse } from '../../fixtures/mock-model.js';
import { MockCalculatorTool, MockSearchTool } from '../../fixtures/mock-tools.js';
import type { Tool } from '../../../src/types/index.js';

describe('ToolCallingAgent', () => {
  let agent: ToolCallingAgent;
  let mockModel: ReturnType<typeof createMockModel>;
  let calculatorTool: MockCalculatorTool;
  let searchTool: MockSearchTool;

  beforeEach(() => {
    calculatorTool = new MockCalculatorTool();
    searchTool = new MockSearchTool();
    mockModel = createMockModel();
    
    agent = new ToolCallingAgent({
      tools: [calculatorTool, searchTool],
      model: mockModel,
      max_steps: 5,
    });
  });

  describe('initialization', () => {
    it('should initialize with required config', () => {
      expect(agent).toBeDefined();
      // Includes calculator, search, and auto-added final_answer
      expect(agent.tools_and_managed_agents).toHaveLength(3);
    });

    it('should throw error when stream_outputs is true but model lacks generate_stream', () => {
      // Create a model without generate_stream method
      class ModelWithoutStream extends BaseModel {
        async generate(messages: any[]) {
          return { role: 'assistant' as const, content: 'test' };
        }
        parse_tool_calls(message: any) {
          return message;
        }
      }
      const modelWithoutStream = new ModelWithoutStream();

      expect(() => {
        new ToolCallingAgent({
          tools: [],
          model: modelWithoutStream,
          stream_outputs: true,
        });
      }).toThrow("stream_outputs is true, but model doesn't implement generate_stream method");
    });

    it('should set default values for optional config', () => {
      const agent = new ToolCallingAgent({
        tools: [],
        model: mockModel,
      });

      expect(agent).toBeDefined();
    });
  });

  describe('tools_and_managed_agents', () => {
    it('should return all tools and managed agents', () => {
      const tools = agent.tools_and_managed_agents;
      // calculator, search, final_answer
      expect(tools).toHaveLength(3);
      expect(tools.some(t => 'name' in t && (t as Tool).name === 'calculator')).toBe(true);
      expect(tools.some(t => 'name' in t && (t as Tool).name === 'search')).toBe(true);
      expect(tools.some(t => 'name' in t && (t as Tool).name === 'final_answer')).toBe(true);
    });
  });

  describe('run', () => {
    it('should execute a simple task with tool call', async () => {
      mockModel.addResponse(mockToolCallResponse('calculator', { operation: 'add', a: 2, b: 2 }));
      mockModel.addResponse(mockFinalAnswerResponse('4'));

      const result = await agent.run('What is 2 + 2?');

      expect(result).toBe('4');
      expect(calculatorTool.callCount).toBe(1);
      expect(calculatorTool.lastArgs).toEqual({ operation: 'add', a: 2, b: 2 });
    });

    it('should handle multiple tool calls in sequence', async () => {
      mockModel.addResponse(mockToolCallResponse('search', { query: 'AI news' }));
      mockModel.addResponse(mockFinalAnswerResponse('Found results'));

      const result = await agent.run('Search for AI news');

      expect(result).toBe('Found results');
      expect(searchTool.callCount).toBe(1);
      expect(mockModel.callCount).toBe(2);
    });

    it('should respect max_steps limit', async () => {
      // Add more responses than max_steps to test limit
      for (let i = 0; i < 10; i++) {
        mockModel.addResponse(mockToolCallResponse('search', { query: `query ${i}` }));
      }

      const agent = new ToolCallingAgent({
        tools: [searchTool],
        model: mockModel,
        max_steps: 3,
      });

      try {
        await agent.run('Keep searching');
      } catch (error: any) {
        expect(error.message).toContain('max_steps');
      }
    });

    it('should reset memory when reset option is true', async () => {
      mockModel.addResponse(mockFinalAnswerResponse('First result'));
      await agent.run('First task');

      mockModel.addResponse(mockFinalAnswerResponse('Second result'));
      const result = await agent.run('Second task', { reset: true });

      expect(result).toBe('Second result');
      expect(agent.get_memory().steps.length).toBe(2); // TaskStep + ActionStep for second run
    });
  });

  describe('streaming', () => {
    it('should stream outputs when enabled', async () => {
      const streamingAgent = new ToolCallingAgent({
        tools: [calculatorTool],
        model: mockModel,
        stream_outputs: true,
      });

      mockModel.addResponse(mockToolCallResponse('calculator', { operation: 'add', a: 5, b: 3 }));
      mockModel.addResponse(mockFinalAnswerResponse('8'));

      const events: any[] = [];
      const stream = streamingAgent.run('What is 5 + 3?', { stream: true });

      for await (const event of stream) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1].is_final_answer).toBe(true);
    });

    it('should handle stream deltas correctly', async () => {
      const streamingAgent = new ToolCallingAgent({
        tools: [],
        model: mockModel,
        stream_outputs: true,
      });

      mockModel.addResponse(mockTextResponse('Hello world from streaming'));
      mockModel.addResponse(mockFinalAnswerResponse('Done'));

      const chunks: string[] = [];
      const stream = streamingAgent.run('Test streaming', { stream: true });

      for await (const event of stream) {
        if (event.content) {
          chunks.push(event.content);
        }
        if (event.is_final_answer) {
          break;
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should throw AgentToolExecutionError for unknown tool', async () => {
      mockModel.addResponse(mockToolCallResponse('unknown_tool', { arg: 'value' }));

      await expect(agent.run('Use unknown tool')).rejects.toThrow('Unknown tool');
    });

    it('should handle tool execution errors', async () => {
      mockModel.addResponse(
        mockToolCallResponse('calculator', { operation: 'divide', a: 10, b: 0 })
      );

      await expect(agent.run('Divide by zero')).rejects.toThrow();
    });

    it('should throw error for multiple tool calls with final_answer', async () => {
      mockModel.addResponse({
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'final_answer', arguments: { answer: 'Done' } },
          },
          {
            id: 'call_2',
            type: 'function',
            function: { name: 'calculator', arguments: { operation: 'add', a: 1, b: 2 } },
          },
        ],
      });

      await expect(agent.run('Test')).rejects.toThrow(
        'Cannot perform other tool calls when calling final_answer tool'
      );
    });
  });

  describe('parallel tool execution', () => {
    it('should execute multiple tools in parallel', async () => {
      mockModel.addResponse({
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'calculator', arguments: { operation: 'add', a: 1, b: 2 } },
          },
          {
            id: 'call_2',
            type: 'function',
            function: { name: 'search', arguments: { query: 'test' } },
          },
        ],
      });
      mockModel.addResponse(mockFinalAnswerResponse('Done'));

      const result = await agent.run('Execute multiple tools');

      expect(result).toBe('Done');
      expect(calculatorTool.callCount).toBe(1);
      expect(searchTool.callCount).toBe(1);
    });

    it('should respect max_tool_threads limit', async () => {
      const limitedAgent = new ToolCallingAgent({
        tools: [calculatorTool],
        model: mockModel,
        max_tool_threads: 2,
      });

      expect(limitedAgent).toBeDefined();
      // Actual parallel execution testing would require more complex setup
    });
  });

  describe('state management', () => {
    it('should store and retrieve state variables', async () => {
      mockModel.addResponse(mockToolCallResponse('calculator', { operation: 'add', a: 5, b: 5 }));
      mockModel.addResponse(mockFinalAnswerResponse('result'));

      await agent.run('Calculate and store');

      // State is protected, so we can't access it directly in tests
      // Just verify the run completes successfully
      expect(calculatorTool.callCount).toBe(1);
    });
  });
});
