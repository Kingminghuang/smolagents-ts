import type { Tool } from './tool.js';
import type { PromptTemplates } from './prompt.js';
import type { MemoryStep } from './memory.js';
import type { Model } from '../models/base-model.js';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
}

/**
 * Step callback function type
 */
export type StepCallback = (step: MemoryStep) => void | Promise<void>;

/**
 * Final answer check function type
 */
export type FinalAnswerCheckFunction = (answer: unknown) => boolean | Promise<boolean>;

/**
 * Base agent configuration
 */
export interface MultiStepAgentConfig {
  tools: Tool[];
  model: Model;
  prompt_templates?: PromptTemplates;
  instructions?: string;
  max_steps?: number;
  add_base_tools?: boolean;
  verbosity_level?: LogLevel;
  managed_agents?: unknown[]; // Will be MultiStepAgent[] but avoiding circular reference
  step_callbacks?: StepCallback[];
  planning_interval?: number;
  name?: string;
  description?: string;
  provide_run_summary?: boolean;
  final_answer_checks?: FinalAnswerCheckFunction[];
}

/**
 * ToolCallingAgent specific configuration
 */
export interface ToolCallingAgentConfig extends MultiStepAgentConfig {
  stream_outputs?: boolean;
  max_tool_threads?: number;
}

/**
 * Model generation options
 */
export interface GenerateOptions {
  stop_sequences?: string[];
  tools_to_call_from?: unknown[]; // Tool | Agent
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

/**
 * Agent run options
 */
export interface AgentRunOptions {
  stream?: boolean;
  reset?: boolean;
  images?: unknown[];
  additional_args?: Record<string, unknown>;
  max_steps?: number;
}
