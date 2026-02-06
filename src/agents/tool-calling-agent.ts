import type {
  ChatMessage,
  ChatMessageStreamDelta,
  ToolCall,
  ToolOutput,
  ActionOutput,
  ToolCallingAgentConfig,
  PromptTemplates,
  Tool,
} from '../types/index.js';
import { MultiStepAgent } from './multi-step-agent.js';
import { ActionStep, TaskStep } from '../memory/index.js';
import { populateTemplate } from '../utils/template.js';
import { toToolCallingToolSignature } from '../utils/code.js';
import { validateToolArguments } from '../utils/validation.js';
import { safeStringify } from '../utils/format.js';
import { normalizeForLog } from '../utils/normalize.js';
import { agglomerateStreamDeltas } from '../utils/stream.js';
import { ConcurrencyLimiter } from '../utils/concurrency.js';
import { AgentImage, AgentAudio } from '../types/message.js';
import {
  AgentGenerationError,
  AgentParsingError,
  AgentToolExecutionError,
  AgentExecutionError,
  AgentToolCallError,
} from '../utils/errors.js';
import { DEFAULT_TOOLCALLING_PROMPT } from '../prompts/index.js';

/**
 * Tool Calling Agent - executes tasks by calling appropriate tools
 */
export class ToolCallingAgent extends MultiStepAgent {
  private stream_outputs: boolean;
  private max_tool_threads: number;
  private concurrency_limiter: ConcurrencyLimiter;
  private format_retry_message: string;

  constructor(config: ToolCallingAgentConfig) {
    super(config);

    this.stream_outputs = config.stream_outputs ?? false;
    this.max_tool_threads = config.max_tool_threads ?? 10;
    this.concurrency_limiter = new ConcurrencyLimiter(this.max_tool_threads);
    this.format_retry_message =
      'Your previous response did not follow the required Tool Calling format. ' +
      'When tools are available and needed, respond with a short "Thought:" line ' +
      'followed by a single Action tool call. Do not answer directly without a tool call.';

    // Validate streaming support
    if (
      this.stream_outputs &&
      (!this.model.generate_stream || typeof this.model.generate_stream !== 'function')
    ) {
      throw new Error("stream_outputs is true, but model doesn't implement generate_stream method");
    }
  }

  /**
   * Get default prompt templates
   */
  protected get_default_prompt_templates(): PromptTemplates {
    return DEFAULT_TOOLCALLING_PROMPT;
  }

  /**
   * Initialize system prompt
   */
  initialize_system_prompt(): string {
    const toolsPrompt = Array.from(this.tools.values())
      .map((tool) => `- ${toToolCallingToolSignature(tool)}`)
      .join('\n');

    const managedAgentDefinitions = Array.from(this.managed_agents.values())
      .map((agent) => {
        const agentDef = agent.to_dict() as { function?: { name?: string; description?: string } };
        const name = agentDef.function?.name || 'agent';
        const description = agentDef.function?.description || '';
        return `- ${name}: ${description}`;
      })
      .join('\n');

    return populateTemplate(this.prompt_templates.system_prompt, {
      tools_prompt: toolsPrompt,
      managed_agents_prompt: managedAgentDefinitions,
      has_managed_agents: this.managed_agents.size > 0,
      custom_instructions: this.instructions,
    });
  }

  /**
   * Get all tools and managed agents
   */
  get tools_and_managed_agents(): (Tool | MultiStepAgent)[] {
    return [...Array.from(this.tools.values()), ...Array.from(this.managed_agents.values())];
  }

  /**
   * Determine whether to enforce tool-calling format
   */
  private should_enforce_toolcalling(): boolean {
    const has_tools =
      Array.from(this.tools.keys()).some((name) => name !== 'final_answer') ||
      this.managed_agents.size > 0;
    if (!has_tools) return false;

    const task_steps = this.memory.get_steps_of_type(TaskStep);
    const task = task_steps.length > 0 ? task_steps[task_steps.length - 1]?.task : undefined;
    if (!task) return false;

    const task_lower = task.toLowerCase();
    const tool_names = [
      ...Array.from(this.tools.keys()).filter((name) => name !== 'final_answer'),
      ...Array.from(this.managed_agents.keys()),
    ];

    return tool_names.some((name) => name && task_lower.includes(name.toLowerCase()));
  }

  private has_thought_prefix(message: ChatMessage): boolean {
    if (!message.content) return false;
    const content =
      typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    return /(^|\n)\s*Thought:/i.test(content);
  }

  /**
   * Execute a single step
   */
  protected async *_step_stream(
    memory_step: ActionStep
  ): AsyncGenerator<ChatMessageStreamDelta | ToolCall | ToolOutput | ActionOutput> {
    const memory_messages = this.write_memory_to_messages();
    const input_messages = [...memory_messages];

    const enforce_toolcalling = this.should_enforce_toolcalling();
    let retried_for_format = false;

    memory_step.model_input_messages = input_messages;

    let chat_message: ChatMessage;

    // Generate response from model
    try {
      if (this.stream_outputs && this.model.generate_stream && !enforce_toolcalling) {
        const stream_deltas: ChatMessageStreamDelta[] = [];

        for await (const delta of this.model.generate_stream(input_messages, {
          stop_sequences: ['Observation:', 'Calling tools:'],
          tools_to_call_from: this.tools_and_managed_agents,
        })) {
          stream_deltas.push(delta);
          yield delta;
        }

        chat_message = agglomerateStreamDeltas(stream_deltas);
      } else if (this.stream_outputs && this.model.generate_stream && enforce_toolcalling) {
        const stream_deltas: ChatMessageStreamDelta[] = [];

        for await (const delta of this.model.generate_stream(input_messages, {
          stop_sequences: ['Observation:', 'Calling tools:'],
          tools_to_call_from: this.tools_and_managed_agents,
        })) {
          stream_deltas.push(delta);
        }

        chat_message = agglomerateStreamDeltas(stream_deltas);
      } else {
        chat_message = await this.model.generate(input_messages, {
          stop_sequences: ['Observation:', 'Calling tools:'],
          tools_to_call_from: this.tools_and_managed_agents,
        });
      }

      memory_step.model_output_message = chat_message;
      memory_step.model_output =
        typeof chat_message.content === 'string'
          ? chat_message.content
          : JSON.stringify(chat_message.content);
      memory_step.token_usage = chat_message.token_usage;
    } catch (error) {
      throw new AgentGenerationError(
        `Error while generating output: ${String(error)}`,
        this.logger
      );
    }

    const parse_tool_calls = (message: ChatMessage): ChatMessage => {
      if (message.tool_calls && message.tool_calls.length > 0) {
        return message;
      }

      try {
        return this.model.parse_tool_calls(message);
      } catch (error) {
        throw new AgentParsingError(`Error parsing tool calls: ${String(error)}`, this.logger);
      }
    };

    chat_message = parse_tool_calls(chat_message);
    memory_step.model_output_message = chat_message;

    const missing_tool_call = !chat_message.tool_calls || chat_message.tool_calls.length === 0;
    const missing_thought = enforce_toolcalling && !this.has_thought_prefix(chat_message);

    if (enforce_toolcalling && (missing_tool_call || missing_thought)) {
      retried_for_format = true;
      const retry_messages: ChatMessage[] = [
        ...memory_messages,
        {
          role: 'system',
          content: this.format_retry_message,
        },
      ];

      try {
        chat_message = await this.model.generate(retry_messages, {
          stop_sequences: ['Observation:', 'Calling tools:'],
          tools_to_call_from: this.tools_and_managed_agents,
        });
      } catch (error) {
        throw new AgentGenerationError(
          `Error while generating output: ${String(error)}`,
          this.logger
        );
      }

      chat_message = parse_tool_calls(chat_message);
      memory_step.model_output_message = chat_message;
    }

    // Check if we have tool calls
    if (!chat_message.tool_calls || chat_message.tool_calls.length === 0) {
      if (enforce_toolcalling && retried_for_format) {
        this.logger.warn(
          'Tool calling format violation after retry. Falling back to text response.'
        );
      }
      // No tool calls - this is allowed in streaming mode for text responses
      // Just yield the content if available
      if (chat_message.content) {
        const contentStr =
          typeof chat_message.content === 'string'
            ? chat_message.content
            : JSON.stringify(chat_message.content);
        if (contentStr.trim()) {
          yield {
            content: contentStr,
            role: chat_message.role,
          };
        }
      }
      return;
    }

    // Validate final_answer usage
    const has_final_answer = chat_message.tool_calls.some(
      (tc) => (tc.function?.name || tc.name) === 'final_answer'
    );
    if (has_final_answer && chat_message.tool_calls.length > 1) {
      throw new AgentParsingError(
        'Cannot perform other tool calls when calling final_answer tool',
        this.logger
      );
    }

    // Process tool calls
    let final_answer: unknown = null;
    let got_final_answer = false;

    for await (const output of this.process_tool_calls(chat_message, memory_step)) {
      yield output;

      if (output && typeof output === 'object' && 'is_final_answer' in output) {
        const tool_output = output;

        if (tool_output.is_final_answer) {
          if (chat_message.tool_calls && chat_message.tool_calls.length > 1) {
            throw new AgentExecutionError(
              'Cannot perform other tool calls when calling final_answer tool'
            );
          }

          if (got_final_answer) {
            throw new AgentToolExecutionError(
              'Multiple final answers returned - this should not happen'
            );
          }

          final_answer = tool_output.output;
          got_final_answer = true;

          // Handle state variables
          if (typeof final_answer === 'string' && this.state.has(final_answer)) {
            final_answer = this.state.get(final_answer);
          }
        }
      }
    }

    // Yield final action output
    yield { output: final_answer, is_final_answer: got_final_answer };
  }

  /**
   * Process tool calls
   */
  private async *process_tool_calls(
    chat_message: ChatMessage,
    memory_step: ActionStep
  ): AsyncGenerator<ToolCall | ToolOutput> {
    const tool_calls = chat_message.tool_calls;
    if (!tool_calls) return;

    const parallel_calls = new Map<string, ToolCall>();

    // Collect and yield tool calls
    for (const chat_tool_call of tool_calls) {
      const tool_call: ToolCall = {
        id: chat_tool_call.id,
        name: chat_tool_call.function?.name || '',
        arguments: chat_tool_call.function?.arguments || {},
      };

      // Parse arguments if string
      if (typeof tool_call.arguments === 'string') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const parsed = JSON.parse(tool_call.arguments);
          if (typeof parsed === 'object' && parsed !== null) {
            tool_call.arguments = parsed as Record<string, unknown>;
          }
        } catch {
          // Keep as string if not valid JSON
        }
      }

      this.logger.debug(`Tool call: ${tool_call.name}`);
      yield tool_call;

      parallel_calls.set(tool_call.id, tool_call);
    }

    // Helper to process single tool call
    const process_single_tool_call = async (tool_call: ToolCall): Promise<ToolOutput> => {
      const tool_name = tool_call.name || '';
      const tool_arguments = tool_call.arguments || {};

      this.logger.logToolCall(tool_name, tool_arguments);

      const tool_call_result = await this.execute_tool_call(tool_name, tool_arguments);
      const logSnapshot = normalizeForLog(tool_call_result);

      let observation: string;

      // Handle special result types (images, audio, etc.)
      if (tool_call_result instanceof AgentImage) {
        const observation_name = 'image.png';
        this.state.set(observation_name, tool_call_result);
        observation = `Stored '${observation_name}' in memory.`;
      } else if (tool_call_result instanceof AgentAudio) {
        const observation_name = 'audio.mp3';
        this.state.set(observation_name, tool_call_result);
        observation = `Stored '${observation_name}' in memory.`;
      } else {
        observation = safeStringify(logSnapshot).trim();
      }

      this.logger.logObservation(observation);

      const is_final_answer = tool_name === 'final_answer';

      return {
        id: tool_call.id,
        output: tool_call_result,
        is_final_answer,
        observation,
        tool_call: {
          id: tool_call.id,
          name: tool_name,
          arguments: tool_arguments,
        },
      };
    };

    // Execute tool calls (parallel if multiple)
    const outputs = new Map<string, ToolOutput>();

    if (parallel_calls.size === 1) {
      // Single tool call - execute directly
      const tool_call = Array.from(parallel_calls.values())[0];
      if (!tool_call) return;
      const tool_output = await process_single_tool_call(tool_call);
      outputs.set(tool_output.id, tool_output);
      yield tool_output;
    } else {
      // Multiple tool calls - execute in parallel with concurrency limit
      const calls_array = Array.from(parallel_calls.values());
      const promises = calls_array.map((tool_call) =>
        this.concurrency_limiter.run(() => process_single_tool_call(tool_call))
      );

      // Process results as they complete
      const results = await Promise.all(promises);
      for (const tool_output of results) {
        outputs.set(tool_output.id, tool_output);
        yield tool_output;
      }
    }

    // Update memory step
    memory_step.tool_calls = Array.from(parallel_calls.keys())
      .sort()
      .map((k) => {
        const tc = parallel_calls.get(k);
        if (!tc) return { id: k, name: '', arguments: {} };
        return {
          id: tc.id,
          name: tc.name || '',
          arguments: tc.arguments || {},
        };
      });

    memory_step.observations = Array.from(outputs.keys())
      .sort()
      .map((k) => {
        const output = outputs.get(k);
        return output?.observation || '';
      })
      .join('\n')
      .trim();
  }

  /**
   * Substitute state variables in arguments
   */
  private _substitute_state_variables(
    arguments_: Record<string, unknown> | string
  ): Record<string, unknown> | string {
    if (typeof arguments_ === 'object' && arguments_ !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(arguments_)) {
        if (typeof value === 'string' && this.state.has(value)) {
          result[key] = this.state.get(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    return arguments_;
  }

  /**
   * Execute a tool call
   */
  private async execute_tool_call(
    tool_name: string,
    arguments_: Record<string, unknown> | string
  ): Promise<unknown> {
    // Check if tool exists
    const available_tools = new Map<string, Tool | MultiStepAgent>([
      ...this.tools,
      ...this.managed_agents,
    ]);

    if (!available_tools.has(tool_name)) {
      throw new AgentToolExecutionError(
        `Unknown tool ${tool_name}, should be one of: ${Array.from(available_tools.keys()).join(', ')}`,
        this.logger
      );
    }

    const tool = available_tools.get(tool_name);
    if (!tool) {
      throw new AgentToolExecutionError(`Tool ${tool_name} not found`, this.logger);
    }

    const substituted_args = this._substitute_state_variables(arguments_);
    const is_managed_agent = this.managed_agents.has(tool_name);

    // Validate arguments
    try {
      if ('inputs' in tool) {
        validateToolArguments(tool, substituted_args);
      }
    } catch (error) {
      throw new AgentToolCallError(String(error), this.logger);
    }

    // Execute tool
    try {
      if (typeof substituted_args === 'object') {
        if (is_managed_agent) {
          // Managed agent expects task as first argument
          const task = (substituted_args as { task?: string }).task || '';
          return await (tool as MultiStepAgent).forward(task);
        } else {
          // Regular tool - call with arguments
          return await (tool as Tool).forward(substituted_args);
        }
      } else {
        // String arguments
        return await (tool as Tool).forward(substituted_args);
      }
    } catch (error) {
      const error_msg = is_managed_agent
        ? `Error executing request to team member '${tool_name}': ${String(error)}`
        : `Error executing tool '${tool_name}': ${String(error)}`;
      throw new AgentToolExecutionError(error_msg, this.logger);
    }
  }
}
