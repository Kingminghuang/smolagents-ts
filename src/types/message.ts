/**
 * Content part types for multimodal messages
 */
export type ContentPart = TextContentPart | ImageContentPart | AudioContentPart;

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image';
  image: string | AgentImage;
}

export interface AudioContentPart {
  type: 'audio';
  audio: string | AgentAudio;
}

export type BinaryData = ArrayBuffer | ArrayBufferView | string;

/**
 * Special content types for agent state
 */
export class AgentImage {
  constructor(
    public data: BinaryData,
    public mimeType = 'image/png'
  ) {}

  toString(): string {
    return `[AgentImage: ${this.mimeType}]`;
  }
}

export class AgentAudio {
  constructor(
    public data: BinaryData,
    public mimeType = 'audio/mp3'
  ) {}

  toString(): string {
    return `[AgentAudio: ${this.mimeType}]`;
  }
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  token_usage?: TokenUsage;
  raw?: unknown;
}

/**
 * Tool call structure
 */
export interface ToolCall {
  id: string;
  type?: 'function';
  function?: {
    name: string;
    arguments: string;
  };
  name?: string;
  arguments?: Record<string, unknown> | string;
}

/**
 * Tool call delta for streaming (includes index)
 */
export interface ToolCallDelta {
  index?: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens?: number;
}

/**
 * Stream delta for incremental updates
 */
export interface ChatMessageStreamDelta {
  role?: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: ToolCallDelta[];
}

/**
 * Timing information
 */
export interface Timing {
  start_time: number;
  end_time?: number;
  duration?: number;
}
