/**
 * Tests for stream utilities
 */
import { describe, it, expect } from 'vitest';
import { agglomerateStreamDeltas } from '../../../src/utils/stream.js';
import type { ChatMessageStreamDelta } from '../../../src/types/index.js';

describe('agglomerateStreamDeltas', () => {
  it('should combine content from multiple deltas', () => {
    const deltas: ChatMessageStreamDelta[] = [
      { content: 'Hello ', role: 'assistant' },
      { content: 'world', role: 'assistant' },
      { content: '!', role: 'assistant' },
    ];

    const result = agglomerateStreamDeltas(deltas);

    expect(result.role).toBe('assistant');
    expect(result.content).toBe('Hello world!');
  });

  it('should handle empty deltas', () => {
    const result = agglomerateStreamDeltas([]);

    expect(result).toBeDefined();
    expect(result.role).toBe('assistant');
    expect(result.content).toBe('');
  });

  it('should handle single delta', () => {
    const deltas: ChatMessageStreamDelta[] = [
      { content: 'Single message', role: 'assistant' },
    ];

    const result = agglomerateStreamDeltas(deltas);

    expect(result.content).toBe('Single message');
  });

  it('should combine tool calls', () => {
    const deltas: ChatMessageStreamDelta[] = [
      {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            type: 'function',
            function: {
              name: 'calculator',
              arguments: '{"operation"',
            },
          },
        ],
      },
      {
        tool_calls: [
          {
            index: 0,
            function: {
              arguments: ':"add","a":1',
            },
          },
        ],
      },
      {
        tool_calls: [
          {
            index: 0,
            function: {
              arguments: ',"b":2}',
            },
          },
        ],
      },
    ];

    const result = agglomerateStreamDeltas(deltas);

    expect(result.tool_calls).toBeDefined();
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0].function).toBeDefined();
    expect(result.tool_calls![0].function!.name).toBe('calculator');
    expect(result.tool_calls![0].function!.arguments).toContain('operation');
  });

  it('should handle multiple tool calls', () => {
    const deltas: ChatMessageStreamDelta[] = [
      {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name: 'tool1', arguments: '{}' },
          },
        ],
      },
      {
        tool_calls: [
          {
            index: 1,
            id: 'call_2',
            type: 'function',
            function: { name: 'tool2', arguments: '{}' },
          },
        ],
      },
    ];

    const result = agglomerateStreamDeltas(deltas);

    expect(result.tool_calls).toHaveLength(2);
    expect(result.tool_calls![0].function).toBeDefined();
    expect(result.tool_calls![0].function!.name).toBe('tool1');
    expect(result.tool_calls![1].function).toBeDefined();
    expect(result.tool_calls![1].function!.name).toBe('tool2');
  });

  it('should preserve role from first delta', () => {
    const deltas: ChatMessageStreamDelta[] = [
      { content: 'First', role: 'assistant' },
      { content: ' Second' },
      { content: ' Third' },
    ];

    const result = agglomerateStreamDeltas(deltas);

    expect(result.role).toBe('assistant');
  });

  it('should handle deltas with no content', () => {
    const deltas: ChatMessageStreamDelta[] = [
      { role: 'assistant' },
      { role: 'assistant' },
    ];

    const result = agglomerateStreamDeltas(deltas);

    expect(result.role).toBe('assistant');
    expect(result.content).toBe('');
  });
});
