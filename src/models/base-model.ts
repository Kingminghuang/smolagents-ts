import type { ChatMessage, ChatMessageStreamDelta, GenerateOptions } from '../types/index.js';

/**
 * Base model interface for LLM interactions
 */
export interface Model {
  /**
   * Generate a response from the model
   */
  generate(messages: ChatMessage[], options?: GenerateOptions): Promise<ChatMessage>;

  /**
   * Generate a streaming response from the model
   */
  generate_stream?(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncGenerator<ChatMessageStreamDelta>;

  /**
   * Parse tool calls from a message
   */
  parse_tool_calls(message: ChatMessage): ChatMessage;
}

/**
 * Abstract base class for model implementations
 */
export abstract class BaseModel implements Model {
  abstract generate(messages: ChatMessage[], options?: GenerateOptions): Promise<ChatMessage>;

  generate_stream?(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncGenerator<ChatMessageStreamDelta>;

  /**
   * Default implementation: return message as-is
   * Override in subclass if custom parsing is needed
   */
  parse_tool_calls(message: ChatMessage): ChatMessage {
    return message;
  }

  /**
   * Convert tools to model-specific format
   */
  protected convertToolsToDefinitions(tools: unknown[]): unknown[] {
    return tools.map((tool: unknown) => {
      if (tool && typeof tool === 'object' && 'to_dict' in tool) {
        const toolWithMethod = tool as { to_dict?: () => unknown };
        if (typeof toolWithMethod.to_dict === 'function') {
          return toolWithMethod.to_dict();
        }
      }
      return tool;
    });
  }

  /**
   * Validate messages
   */
  protected validateMessages(messages: ChatMessage[]): void {
    if (!messages || messages.length === 0) {
      throw new Error('Messages array cannot be empty');
    }

    for (const message of messages) {
      if (!message.role) {
        throw new Error('Message must have a role');
      }

      if (!message.content && !message.tool_calls) {
        throw new Error('Message must have content or tool_calls');
      }
    }
  }
}
