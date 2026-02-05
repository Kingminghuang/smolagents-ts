/**
 * Tests for BaseModel
 */
import { describe, it, expect } from 'vitest';
import { BaseModel } from '../../../src/models/base-model.js';
import type { ChatMessage } from '../../../src/types/index.js';

class TestModel extends BaseModel {
  async generate(messages: ChatMessage[]): Promise<ChatMessage> {
    return {
      role: 'assistant',
      content: 'Test response',
    };
  }
}

describe('BaseModel', () => {
  describe('parse_tool_calls', () => {
    it('should return message as-is by default', () => {
      const model = new TestModel();
      const message: ChatMessage = {
        role: 'assistant',
        content: 'Test',
      };

      const result = model.parse_tool_calls(message);

      expect(result).toBe(message);
    });

    it('should preserve tool_calls in message', () => {
      const model = new TestModel();
      const message: ChatMessage = {
        role: 'assistant',
        content: 'Test',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'test_tool',
              arguments: '{}',
            },
          },
        ],
      };

      const result = model.parse_tool_calls(message);

      expect(result.tool_calls).toBeDefined();
      expect(result.tool_calls).toHaveLength(1);
    });
  });

  describe('generate', () => {
    it('should be implemented by subclass', async () => {
      const model = new TestModel();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const result = await model.generate(messages);

      expect(result).toBeDefined();
      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Test response');
    });
  });

  describe('generate_stream', () => {
    it('should be optional', () => {
      const model = new TestModel();

      expect(model.generate_stream).toBeUndefined();
    });

    it('can be implemented by subclass', async () => {
      class StreamingModel extends TestModel {
        async *generate_stream(messages: ChatMessage[]) {
          yield { content: 'chunk1', role: 'assistant' as const };
          yield { content: 'chunk2', role: 'assistant' as const };
        }
      }

      const model = new StreamingModel();
      expect(model.generate_stream).toBeDefined();

      const chunks: any[] = [];
      for await (const chunk of model.generate_stream!([])) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
    });
  });
});
