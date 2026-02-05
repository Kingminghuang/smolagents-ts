/**
 * Tests for MemoryStep classes
 */
import { describe, it, expect } from 'vitest';
import {
  ActionStep,
  TaskStep,
  SystemPromptStep,
  PlanningStep,
} from '../../../src/memory/index.js';
import type { ChatMessage, ToolCall } from '../../../src/types/index.js';

describe('MemoryStep Classes', () => {
  describe('SystemPromptStep', () => {
    it('should store system prompt content', () => {
      const step = new SystemPromptStep('System prompt');

      expect(step.system_prompt).toBe('System prompt');
    });

    it('should convert to messages', () => {
      const step = new SystemPromptStep('System prompt');
      const messages = step.to_messages();

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('System prompt');
    });
  });

  describe('TaskStep', () => {
    it('should store task description', () => {
      const step = new TaskStep('Complete this task');

      expect(step.task).toBe('Complete this task');
    });

    it('should convert to messages', () => {
      const step = new TaskStep('Do something');
      const messages = step.to_messages();

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toContain('Do something');
    });

    it('should support images', () => {
      const step = new TaskStep('Analyze image', [{ type: 'image', url: 'data:...' }]);

      expect(step.images).toBeDefined();
      expect(step.images).toHaveLength(1);
    });
  });

  describe('ActionStep', () => {
    it('should initialize with step number', () => {
      const step = new ActionStep(5);

      expect(step.step_number).toBe(5);
    });

    it('should store model input and output', () => {
      const step = new ActionStep(1);
      const inputMessages: ChatMessage[] = [{ role: 'user', content: 'input' }];
      const outputMessage: ChatMessage = { role: 'assistant', content: 'output' };

      step.model_input_messages = inputMessages;
      step.model_output_message = outputMessage;

      expect(step.model_input_messages).toBe(inputMessages);
      expect(step.model_output_message).toBe(outputMessage);
    });

    it('should store tool calls and observations', () => {
      const step = new ActionStep(1);
      const toolCalls = [
        {
          id: 'call_1',
          name: 'calculator',
          arguments: { operation: 'add', a: 1, b: 2 },
        },
      ];

      step.tool_calls = toolCalls;
      step.observations = 'Result: 3';

      expect(step.tool_calls).toBe(toolCalls);
      expect(step.observations).toBe('Result: 3');
    });

    it('should track token usage', () => {
      const step = new ActionStep(1);
      step.token_usage = {
        input_tokens: 100,
        output_tokens: 50,
      };

      expect(step.token_usage.input_tokens).toBe(100);
      expect(step.token_usage.output_tokens).toBe(50);
    });

    it('should track timing', () => {
      const step = new ActionStep(1);
      const start = Date.now();
      const end = start + 1000;

      step.timing = {
        start_time: start,
        end_time: end,
        duration: 1000,
      };

      expect(step.timing.duration).toBe(1000);
    });

    it('should convert to messages', () => {
      const step = new ActionStep(1);
      step.model_output_message = {
        role: 'assistant',
        content: 'Using calculator',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'calculator',
              arguments: '{"operation":"add","a":1,"b":2}',
            },
          },
        ],
      };
      step.observations = 'Result: 3';

      const messages = step.to_messages();

      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some(m => m.role === 'assistant')).toBe(true);
    });

    it('should support summary mode', () => {
      const step = new ActionStep(1);
      step.model_output = 'Detailed output...';
      step.observations = 'Detailed observations...';

      const normalMessages = step.to_messages(false);
      const summaryMessages = step.to_messages(true);

      expect(normalMessages).toBeDefined();
      expect(summaryMessages).toBeDefined();
    });

    it('should handle errors', () => {
      const step = new ActionStep(1);
      const error = new Error('Test error');

      step.error = error;

      expect(step.error).toBe(error);
    });
  });

  describe('PlanningStep', () => {
    it('should store planning content', () => {
      const step = new PlanningStep('Here is my plan...', 1);

      expect(step.plan).toBe('Here is my plan...');
      expect(step.step_number).toBe(1);
    });

    it('should convert to messages', () => {
      const step = new PlanningStep('Plan content', 1);
      const messages = step.to_messages();

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toContain('Plan');
    });
  });
});
