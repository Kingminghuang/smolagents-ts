import type { ChatMessage, ChatMessageStreamDelta } from '../types/index.js';

/**
 * Agglomerate stream deltas into a complete message
 */
export function agglomerateStreamDeltas(deltas: ChatMessageStreamDelta[]): ChatMessage {
  if (deltas.length === 0) {
    // Return empty message for empty deltas
    return {
      role: 'assistant',
      content: '',
    };
  }

  const firstDelta = deltas[0];
  const role = firstDelta?.role || 'assistant';
  let content = '';
  const toolCallsByIndex = new Map<
    number,
    {
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }
  >();

  for (const delta of deltas) {
    // Aggregate content
    if (delta.content) {
      content += delta.content;
    }

    // Aggregate tool calls by index
    if (delta.tool_calls) {
      for (const toolCallDelta of delta.tool_calls) {
        const index = toolCallDelta.index ?? 0;

        if (!toolCallsByIndex.has(index)) {
          toolCallsByIndex.set(index, {
            id: toolCallDelta.id || '',
            type: toolCallDelta.type || 'function',
            function: {
              name: '',
              arguments: '',
            },
          });
        }

        const toolCall = toolCallsByIndex.get(index);
        if (!toolCall) continue;

        // Update id if provided
        if (toolCallDelta.id) {
          toolCall.id = toolCallDelta.id;
        }

        // Update type if provided
        if (toolCallDelta.type) {
          toolCall.type = toolCallDelta.type;
        }

        if (toolCallDelta.function) {
          if (toolCallDelta.function.name) {
            // Set name only once (don't concatenate)
            if (!toolCall.function.name) {
              toolCall.function.name = toolCallDelta.function.name;
            }
          }
          if (toolCallDelta.function.arguments) {
            toolCall.function.arguments += toolCallDelta.function.arguments;
          }
        }
      }
    }
  }

  const message: ChatMessage = {
    role,
    content,
  };

  if (toolCallsByIndex.size > 0) {
    // Convert map to array, sorted by index
    message.tool_calls = Array.from(toolCallsByIndex.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, toolCall]) => ({
        ...toolCall,
        type: 'function' as const,
      }));
  }

  return message;
}

/**
 * Create an async generator that yields from an array
 */
export async function* arrayToAsyncGenerator<T>(array: T[]): AsyncGenerator<T> {
  for (const item of array) {
    yield await Promise.resolve(item);
  }
}

/**
 * Collect all items from an async generator into an array
 */
export async function collectAsyncGenerator<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of generator) {
    results.push(item);
  }
  return results;
}

/**
 * Buffer and yield stream deltas with live display updates
 */
export async function* streamWithLiveDisplay<T extends ChatMessageStreamDelta>(
  generator: AsyncGenerator<T>,
  onUpdate?: (aggregated: ChatMessage) => void
): AsyncGenerator<T> {
  const deltas: ChatMessageStreamDelta[] = [];

  for await (const delta of generator) {
    deltas.push(delta);

    if (onUpdate) {
      try {
        const aggregated = agglomerateStreamDeltas(deltas);
        onUpdate(aggregated);
      } catch {
        // Ignore errors during partial aggregation
      }
    }

    yield delta;
  }
}
