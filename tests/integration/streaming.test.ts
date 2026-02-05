/**
 * Integration tests for streaming functionality
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolCallingAgent } from '../../src/agents/tool-calling-agent.js';
import {
  mockToolCallResponse,
  mockFinalAnswerResponse,
  mockTextResponse,
} from '../fixtures/mock-model.js';
import {
  createTestContext,
  TestContext,
  USE_REAL_DATA,
  shouldRunMockOnlyTest,
} from '../fixtures/index.js';

describe('Streaming Integration Tests', () => {
  let agent: ToolCallingAgent;
  let context: TestContext;

  beforeEach(() => {
    context = createTestContext();

    agent = new ToolCallingAgent({
      tools: context.tools,
      model: context.model,
      stream_outputs: true,
      max_steps: 5,
    });
  });

  describe('basic streaming', () => {
    it('should stream text responses', async () => {
      context.addMockResponse(mockTextResponse('Thinking about the problem'));
      context.addMockResponse(mockFinalAnswerResponse('Done'));

      const chunks: any[] = [];
      const stream = agent.run('Simple task', { stream: true });

      for await (const chunk of stream) {
        chunks.push(chunk);
        if (chunk.is_final_answer) break;
      }

      expect(chunks.length).toBeGreaterThan(0);
      
      // Should have text chunks
      const textChunks = chunks.filter(c => c.content !== undefined);
      expect(textChunks.length).toBeGreaterThan(0);
      
      // Should have final answer
      const finalChunk = chunks[chunks.length - 1];
      expect(finalChunk.is_final_answer).toBe(true);
    });

    it('should stream tool calls', async () => {
      context.addMockResponse(
        mockToolCallResponse('calculator', {
          operation: 'add',
          a: 5,
          b: 3,
        })
      );
      context.addMockResponse(mockFinalAnswerResponse('8'));

      const events: any[] = [];
      const stream = agent.run('What is 5 + 3?', { stream: true });

      for await (const event of stream) {
        events.push(event);
        if (event.is_final_answer) break;
      }

      // Should have tool call event
      const toolCallEvents = events.filter(e => e.name === 'calculator');
      expect(toolCallEvents.length).toBeGreaterThan(0);

      // Should have tool output event
      const toolOutputEvents = events.filter(e => e.output !== undefined && e.observation !== undefined);
      expect(toolOutputEvents.length).toBeGreaterThan(0);

      // Should have final answer
      const finalEvent = events[events.length - 1];
      expect(finalEvent.is_final_answer).toBe(true);
    });
  });

  describe('multi-step streaming', () => {
    it('should stream multiple steps', async () => {
      // Step 1
      context.addMockResponse(
        mockToolCallResponse('calculator', {
          operation: 'add',
          a: 2,
          b: 3,
        })
      );
      
      // Step 2
      context.addMockResponse(
        mockToolCallResponse('calculator', {
          operation: 'multiply',
          a: 5,
          b: 2,
        })
      );
      
      // Final answer
      context.addMockResponse(mockFinalAnswerResponse('Results: 5 and 10'));

      const events: any[] = [];
      const stream = agent.run('Calculate 2+3 and 5*2', { stream: true });

      for await (const event of stream) {
        events.push(event);
        if (event.is_final_answer) break;
      }

      expect(events.length).toBeGreaterThan(2);
      if (!USE_REAL_DATA) {
        // Only check call count on mocks
         expect(context.model.callCount).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('streaming with text and tool calls', () => {
    it('should stream mixed content', async () => {
      context.addMockResponse(mockTextResponse('Let me calculate that for you'));
      context.addMockResponse(
        mockToolCallResponse('calculator', {
          operation: 'add',
          a: 10,
          b: 5,
        })
      );
      context.addMockResponse(mockTextResponse('The result is ready'));
      context.addMockResponse(mockFinalAnswerResponse('15'));

      const events: any[] = [];
      const stream = agent.run('What is 10 + 5?', { stream: true });

      for await (const event of stream) {
        events.push(event);
        if (event.is_final_answer) break;
      }

      // Should have text events
      const textEvents = events.filter(e => e.content !== undefined);
      expect(textEvents.length).toBeGreaterThan(0);

      // Should have tool events
      const toolEvents = events.filter(e => e.name === 'calculator');
      expect(toolEvents.length).toBeGreaterThan(0);

      // Should have final answer
      expect(events[events.length - 1].is_final_answer).toBe(true);
    });
  });

  describe('error handling in streams', () => {
    it('should handle errors in streaming mode', async () => {
      if (shouldRunMockOnlyTest()) {
        context.addMockResponse(
          mockToolCallResponse('calculator', {
            operation: 'divide',
            a: 10,
            b: 0,
          })
        );
  
        const stream = agent.run('Divide by zero', { stream: true });
  
        await expect(async () => {
          for await (const event of stream) {
            // Should throw error
          }
        }).rejects.toThrow();
      }
    });
  });

  describe('parallel tool calls in streaming', () => {
    it('should stream parallel tool execution', async () => {
      // Parallel execution is tricky with real models reliably in small tests
      if (shouldRunMockOnlyTest()) {
        context.addMockResponse({
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'calculator',
                arguments: { operation: 'add', a: 1, b: 2 },
              },
            },
            {
              id: 'call_2',
              type: 'function',
              function: {
                name: 'calculator',
                arguments: { operation: 'multiply', a: 3, b: 4 },
              },
            },
          ],
        });
        context.addMockResponse(mockFinalAnswerResponse('Both done'));
  
        const events: any[] = [];
        const stream = agent.run('Do parallel calculations', { stream: true });
  
        for await (const event of stream) {
          events.push(event);
          if (event.is_final_answer) break;
        }
  
        // Should have two tool call events
        const toolCalls = events.filter(e => e.name === 'calculator' && e.id);
        expect(toolCalls.length).toBe(2);
  
        // Should have two tool output events (excluding final_answer)
        const toolOutputs = events.filter(e => 
          e.output !== undefined && 
          e.observation !== undefined && 
          !e.is_final_answer
        );
        expect(toolOutputs.length).toBe(2);
      }
    });
  });

  describe('stream cancellation', () => {
    it('should handle early stream termination', async () => {
      context.addMockResponse(mockTextResponse('This is a long response'));
      context.addMockResponse(mockToolCallResponse('calculator', { operation: 'add', a: 1, b: 1 }));
      context.addMockResponse(mockFinalAnswerResponse('Final'));

      const events: any[] = [];
      const stream = agent.run('Task', { stream: true });

      let count = 0;
      for await (const event of stream) {
        events.push(event);
        count++;
        if (count >= 3) {
          // Stop early
          break;
        }
      }

      expect(events.length).toBeLessThanOrEqual(3);
    });
  });
});
