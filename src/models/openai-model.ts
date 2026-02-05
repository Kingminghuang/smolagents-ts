import OpenAI from 'openai';
import type { ChatMessage, ChatMessageStreamDelta, GenerateOptions } from '../types/index.js';
import { BaseModel } from './base-model.js';

type OpenAIMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type OpenAITool = OpenAI.Chat.Completions.ChatCompletionTool;
type OpenAIToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;
type OpenAIToolCallDelta = NonNullable<
  OpenAI.Chat.Completions.ChatCompletionChunk['choices'][number]['delta']['tool_calls']
>[number];

/**
 * OpenAI model configuration
 */
export interface OpenAIModelConfig {
  apiKey: string;
  baseURL?: string;
  organization?: string;
  dangerouslyAllowBrowser?: boolean;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * OpenAI model implementation using official SDK
 */
export class OpenAIModel extends BaseModel {
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: OpenAIModelConfig) {
    super();

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      organization: config.organization,
      dangerouslyAllowBrowser: config.dangerouslyAllowBrowser,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
    });

    this.defaultModel = config.defaultModel || 'gpt-4o';
  }

  /**
   * Generate a response
   */
  override async generate(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): Promise<ChatMessage> {
    this.validateMessages(messages);

    const completion = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      messages: this.convertMessagesToOpenAI(messages),
      tools: options?.tools_to_call_from
        ? this.convertToolsToOpenAI(options.tools_to_call_from)
        : undefined,
      temperature: options?.temperature,
      max_tokens: options?.max_tokens,
      stop: options?.stop_sequences,
      stream: false,
    });

    return this.convertResponseToChatMessage(completion);
  }

  /**
   * Generate a streaming response
   */
  override async *generate_stream(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncGenerator<ChatMessageStreamDelta> {
    this.validateMessages(messages);

    const stream = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      messages: this.convertMessagesToOpenAI(messages),
      tools: options?.tools_to_call_from
        ? this.convertToolsToOpenAI(options.tools_to_call_from)
        : undefined,
      temperature: options?.temperature,
      max_tokens: options?.max_tokens,
      stop: options?.stop_sequences,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      const streamDelta: ChatMessageStreamDelta = {};

      if (delta.role) {
        streamDelta.role = delta.role as 'assistant' | 'user' | 'system' | 'tool';
      }

      if (delta.content) {
        streamDelta.content = delta.content;
      }

      if (delta.tool_calls) {
        streamDelta.tool_calls = delta.tool_calls.map((tc: OpenAIToolCallDelta) => ({
          id: tc.id ?? '',
          type: 'function',
          function: tc.function
            ? {
                name: tc.function.name ?? '',
                arguments: tc.function.arguments ?? '',
              }
            : undefined,
        }));
      }

      yield streamDelta;
    }
  }

  /**
   * Convert messages to OpenAI format
   */
  private convertMessagesToOpenAI(messages: ChatMessage[]): OpenAIMessageParam[] {
    return messages.map((msg) => {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
            ? JSON.stringify(msg.content)
            : null;

      if (msg.role === 'system') {
        const systemMsg: OpenAI.Chat.Completions.ChatCompletionSystemMessageParam = {
          role: 'system',
          content: content ?? '',
        };
        return systemMsg;
      }

      if (msg.role === 'user') {
        const userMsg: OpenAI.Chat.Completions.ChatCompletionUserMessageParam = {
          role: 'user',
          content: content ?? '',
        };
        if (msg.name) {
          userMsg.name = msg.name;
        }
        return userMsg;
      }

      if (msg.role === 'assistant') {
        const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content,
        };
        if (msg.name) {
          assistantMsg.name = msg.name;
        }
        if (msg.tool_calls) {
          assistantMsg.tool_calls = msg.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function?.name || tc.name || '',
              arguments:
                tc.function?.arguments ||
                (typeof tc.arguments === 'string'
                  ? tc.arguments
                  : JSON.stringify(tc.arguments || {})),
            },
          }));
        }
        return assistantMsg;
      }

      const toolMsg: OpenAI.Chat.Completions.ChatCompletionToolMessageParam = {
        role: 'tool',
        content: content ?? '',
        tool_call_id: msg.tool_call_id ?? '',
      };
      return toolMsg;
    });
  }

  /**
   * Convert tools to OpenAI format
   */
  private convertToolsToOpenAI(tools: unknown[]): OpenAITool[] {
    return this.convertToolsToDefinitions(tools) as OpenAITool[];
  }

  /**
   * Convert OpenAI response to ChatMessage
   */
  private convertResponseToChatMessage(
    completion: OpenAI.Chat.Completions.ChatCompletion
  ): ChatMessage {
    const choice = completion.choices[0];
    if (!choice) {
      throw new Error('No response from model');
    }

    const message: ChatMessage = {
      role: choice.message.role as 'assistant' | 'user' | 'system' | 'tool',
      content: choice.message.content || '',
      raw: completion,
    };

    // Add tool calls if present
    if (choice.message.tool_calls) {
      const toolCalls = choice.message.tool_calls
        .filter(
          (
            tc
          ): tc is OpenAIToolCall & {
            type: 'function';
            function: { name: string; arguments: string };
          } => tc.type === 'function' && 'function' in tc && !!tc.function
        )
        .map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
      }
    }

    // Add token usage
    if (completion.usage) {
      message.token_usage = {
        input_tokens: completion.usage.prompt_tokens,
        output_tokens: completion.usage.completion_tokens,
        total_tokens: completion.usage.total_tokens,
      };
    }

    return message;
  }

  /**
   * Parse tool calls from message
   */
  override parse_tool_calls(message: ChatMessage): ChatMessage {
    // OpenAI format already has tool_calls, so just return
    return message;
  }
}
