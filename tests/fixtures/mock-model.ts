/**
 * Mock model for testing
 */
import type { ChatMessage, ChatMessageStreamDelta, GenerateOptions } from '../../src/types/index.js';
import { BaseModel } from '../../src/models/base-model.js';

export interface MockModelResponse {
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string | Record<string, any>;
    };
  }>;
}

export class MockModel extends BaseModel {
  private responses: MockModelResponse[] = [];
  private currentResponseIndex = 0;
  public callCount = 0;
  public lastMessages: ChatMessage[] = [];

  constructor(responses: MockModelResponse[] = []) {
    super();
    this.responses = responses;
  }

  addResponse(response: MockModelResponse): void {
    this.responses.push(response);
  }

  resetResponses(): void {
    this.responses = [];
    this.currentResponseIndex = 0;
    this.callCount = 0;
    this.lastMessages = [];
  }

  async generate(messages: ChatMessage[], options?: GenerateOptions): Promise<ChatMessage> {
    this.callCount++;
    this.lastMessages = messages;

    if (this.currentResponseIndex >= this.responses.length) {
      throw new Error('No more mock responses available');
    }

    const response = this.responses[this.currentResponseIndex++];
    
    // Normalize tool_calls to ensure arguments is always a string
    const normalizedToolCalls = response.tool_calls?.map(tc => ({
      id: tc.id,
      type: tc.type as 'function',
      function: {
        name: tc.function.name,
        arguments: typeof tc.function.arguments === 'string' 
          ? tc.function.arguments 
          : JSON.stringify(tc.function.arguments),
      },
    }));
    
    return {
      role: 'assistant',
      content: response.content || '',
      tool_calls: normalizedToolCalls,
      token_usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
    };
  }

  async *generate_stream(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncGenerator<ChatMessageStreamDelta> {
    this.callCount++;
    this.lastMessages = messages;

    if (this.currentResponseIndex >= this.responses.length) {
      throw new Error('No more mock responses available');
    }

    const response = this.responses[this.currentResponseIndex++];

    if (response.content) {
      // Split content into chunks
      const words = response.content.split(' ');
      for (const word of words) {
        yield { content: word + ' ', role: 'assistant' };
      }
    }

    if (response.tool_calls) {
      for (let i = 0; i < response.tool_calls.length; i++) {
        const toolCall = response.tool_calls[i];
        yield {
          role: 'assistant',
          tool_calls: [
            {
              index: i,  // Use proper index for each tool call
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.function.name,
                arguments: typeof toolCall.function.arguments === 'string' 
                  ? toolCall.function.arguments 
                  : JSON.stringify(toolCall.function.arguments),
              },
            },
          ],
        };
      }
    }
  }

  parse_tool_calls(message: ChatMessage): ChatMessage {
    // Simply return the message as-is for testing
    return message;
  }
}

/**
 * Create a mock model with predefined responses
 */
export function createMockModel(responses: MockModelResponse[] = []): MockModel {
  return new MockModel(responses);
}

/**
 * Create a simple text response
 */
export function mockTextResponse(content: string): MockModelResponse {
  return { content };
}

/**
 * Create a tool call response
 */
export function mockToolCallResponse(
  toolName: string,
  args: Record<string, any>,
  callId = 'call_123'
): MockModelResponse {
  return {
    tool_calls: [
      {
        id: callId,
        type: 'function',
        function: {
          name: toolName,
          arguments: args,
        },
      },
    ],
  };
}

/**
 * Create a final answer response
 */
export function mockFinalAnswerResponse(answer: string): MockModelResponse {
  return mockToolCallResponse('final_answer', { answer });
}
