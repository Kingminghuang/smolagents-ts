/**
 * Base interface for all tools
 */
export interface Tool {
  name: string;
  description: string;
  inputs: Record<string, ToolInput>;
  output_type?: string;
  output_description?: string;
  output_example?: unknown;
  output_schema?: unknown;

  /**
   * Execute the tool with given arguments
   */
  forward(...args: unknown[]): Promise<unknown>;

  /**
   * Convert tool to dictionary format for LLM
   */
  to_dict(): ToolDefinition;
}

/**
 * Tool input parameter definition
 */
export interface ToolInput {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'any';
  description?: string;
  nullable?: boolean;
  default?: unknown;
  enum?: readonly string[];
  items?: ToolInput;
  properties?: Record<string, ToolInput>;
  additionalProperties?: ToolInput;
  anyOf?: ToolInput[];
}

/**
 * Tool definition for LLM function calling
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * Tool call result
 */
export interface ToolOutput {
  id: string;
  output: unknown;
  is_final_answer: boolean;
  observation: string;
  tool_call: {
    id: string;
    name: string;
    arguments: Record<string, unknown> | string;
  };
}

/**
 * Action output from agent step
 */
export interface ActionOutput {
  output: unknown;
  is_final_answer: boolean;
  observation?: string;
}
