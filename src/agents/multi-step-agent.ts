import type { Model } from '../models/base-model.js';
import type {
  Tool,
  PromptTemplates,
  MultiStepAgentConfig,
  AgentRunOptions,
  ChatMessage,
} from '../types/index.js';
import {
  AgentMemory,
  TaskStep,
  ActionStep,
  FinalAnswerStep,
  CallbackRegistry,
} from '../memory/index.js';
import { AgentLogger, LogLevel as LogLevelEnum } from '../logger/index.js';
import { FinalAnswerTool } from '../tools/index.js';
import { validateToolDefinition } from '../utils/validation.js';
import { safeStringify } from '../utils/format.js';

/**
 * Base class for multi-step agents
 */
export abstract class MultiStepAgent {
  protected tools: Map<string, Tool>;
  protected model: Model;
  protected prompt_templates: PromptTemplates;
  protected max_steps: number;
  protected step_number: number;
  protected memory: AgentMemory;
  protected state: Map<string, unknown>;
  protected managed_agents: Map<string, MultiStepAgent>;
  protected logger: AgentLogger;
  protected step_callbacks: CallbackRegistry;
  protected planning_interval: number;
  protected instructions?: string;
  protected name?: string;
  protected description?: string;
  protected provide_run_summary: boolean;

  constructor(config: MultiStepAgentConfig) {
    // Validate required config
    if (!config.model) {
      throw new Error('Model is required');
    }

    // Initialize model
    this.model = config.model;

    // Initialize tools
    this.tools = new Map();
    for (const tool of config.tools || []) {
      validateToolDefinition(tool);
      this.tools.set(tool.name, tool);
    }

    // Add final answer tool if not present and base tools enabled
    if (config.add_base_tools !== false) {
      if (!this.tools.has('final_answer')) {
        this.tools.set('final_answer', new FinalAnswerTool());
      }
    }

    // Initialize managed agents
    this.managed_agents = new Map();
    for (const agent of config.managed_agents || []) {
      // Type guard: check if agent has name property that is a string
      if (agent && typeof agent === 'object' && 'name' in agent && typeof agent.name === 'string') {
        this.managed_agents.set(agent.name, agent as unknown as MultiStepAgent);
      }
    }

    // Set prompt templates
    this.prompt_templates = config.prompt_templates || this.get_default_prompt_templates();

    // Initialize memory with system prompt
    const system_prompt = this.initialize_system_prompt();
    this.memory = new AgentMemory(system_prompt);

    // Initialize state
    this.state = new Map();
    this.step_number = 0;

    // Set configuration
    this.max_steps = config.max_steps ?? 10;
    this.planning_interval = config.planning_interval ?? 0;
    this.instructions = config.instructions;
    this.name = config.name;
    this.description = config.description;
    this.provide_run_summary = config.provide_run_summary ?? false;

    // Initialize logger
    const verbosity = config.verbosity_level ?? LogLevelEnum.INFO;
    this.logger = new AgentLogger({
      level: verbosity,
      name: this.name || 'agent',
    });

    // Initialize callbacks
    this.step_callbacks = new CallbackRegistry();
    for (const callback of config.step_callbacks || []) {
      this.step_callbacks.register(callback);
    }
  }

  /**
   * Get default prompt templates - must be implemented by subclass
   */
  protected abstract get_default_prompt_templates(): PromptTemplates;

  /**
   * Initialize system prompt - must be implemented by subclass
   */
  abstract initialize_system_prompt(): string;

  /**
   * Get current step number
   */
  public get stepNumber(): number {
    return this.step_number;
  }

  /**
   * Get agent memory (for testing and inspection)
   */
  public get_memory(): AgentMemory {
    return this.memory;
  }

  /**
   * Main entry point to run the agent
   */
  run(task: string, options?: AgentRunOptions & { stream: true }): AsyncGenerator<unknown>;
  run(task: string, options?: AgentRunOptions & { stream?: false }): Promise<unknown>;
  run(task: string, options?: AgentRunOptions): Promise<unknown> | AsyncGenerator<unknown>;
  run(task: string, options?: AgentRunOptions): Promise<unknown> | AsyncGenerator<unknown> {
    // Reset if requested
    if (options?.reset !== false) {
      this.reset();
    }

    // Add task to memory
    const task_step = new TaskStep(task, options?.images);
    this.memory.add_step(task_step);

    // Determine if streaming
    const stream = options?.stream ?? false;
    const max_steps = options?.max_steps ?? this.max_steps;

    if (stream) {
      // Return async generator for streaming
      return this._run_stream(task, max_steps);
    } else {
      // Run non-streaming and return final result as Promise
      return this._run_non_stream(task, max_steps);
    }
  }

  /**
   * Internal non-streaming run implementation
   */
  protected async _run_non_stream(task: string, max_steps: number): Promise<unknown> {
    const generator = this._run_stream(task, max_steps);
    let final_result: unknown;

    for await (const event of generator) {
      if (event instanceof FinalAnswerStep) {
        final_result = event.final_answer;
      } else if (
        event &&
        typeof event === 'object' &&
        'is_final_answer' in event &&
        event.is_final_answer
      ) {
        final_result = (event as unknown as { output: unknown }).output;
      }
    }

    return final_result;
  }

  /**
   * Internal streaming run implementation
   */
  protected async *_run_stream(task: string, max_steps: number): AsyncGenerator<unknown> {
    const modelId = (() => {
      if (!this.model || typeof this.model !== 'object' || !('modelId' in this.model)) {
        return 'Model';
      }
      const value = (this.model as { modelId?: unknown }).modelId;
      return typeof value === 'string' ? value : 'Model';
    })();
    this.logger.logTask(task, modelId);

    while (this.step_number < max_steps) {
      this.step_number++;

      this.logger.logStep(this.step_number);

      // Create action step
      const action_step = new ActionStep(this.step_number);

      try {
        // Execute step (implemented by subclass)
        let got_final_answer = false;

        for await (const event of this._step_stream(action_step)) {
          yield event;

          // Check if we got final answer
          if (
            event &&
            typeof event === 'object' &&
            'is_final_answer' in event &&
            event.is_final_answer
          ) {
            got_final_answer = true;
            const typedEvent = event as { output: unknown; is_final_answer: boolean };

            // Create final answer step
            const final_step = new FinalAnswerStep(typedEvent.output);
            this.memory.add_step(final_step);
            await this.step_callbacks.execute(final_step);

            this.logger.logFinalAnswer(safeStringify(typedEvent.output));
            return;
          }
        }

        // Complete the step
        action_step.complete();

        // Add to memory
        this.memory.add_step(action_step);

        // Execute callbacks
        await this.step_callbacks.execute(action_step);

        // Log step summary
        this.logger.debug(action_step.getSummary());

        // If we didn't get final answer, continue to next step
        if (got_final_answer) {
          return;
        }
      } catch (error) {
        action_step.error = error instanceof Error ? error : new Error(String(error));
        action_step.complete();
        this.memory.add_step(action_step);

        this.logger.logError(`Error in step ${this.step_number}: ${String(error)}`);
        throw error;
      }
    }

    // Max steps reached
    this.logger.warn(`Max steps (${max_steps}) reached`);

    // Try to provide final answer anyway
    const final_answer = this.provide_final_answer();
    const final_step = new FinalAnswerStep(final_answer);
    this.memory.add_step(final_step);

    yield { output: final_answer, is_final_answer: true };
  }

  /**
   * Execute a single step - must be implemented by subclass
   */
  protected abstract _step_stream(memory_step: ActionStep): AsyncGenerator<unknown>;

  /**
   * Write memory to messages
   */
  protected write_memory_to_messages(summary_mode = false): ChatMessage[] {
    return this.memory.to_messages(summary_mode);
  }

  /**
   * Provide final answer when max steps reached
   */
  protected provide_final_answer(): string {
    return 'I was unable to complete the task within the maximum number of steps.';
  }

  /**
   * Reset agent state
   */
  reset(): void {
    this.memory.reset();
    this.state.clear();
    this.step_number = 0;
    this.logger.info('Agent state reset');
  }

  /**
   * Get agent summary
   */
  get_summary(): string {
    const parts: string[] = [];

    parts.push(`Agent: ${this.name || 'Unnamed'}`);
    parts.push(this.memory.get_summary());

    const tokens = this.memory.get_total_tokens();
    parts.push(`Tokens: ${tokens.total} (${tokens.input} in, ${tokens.output} out)`);

    const duration = this.memory.get_total_duration();
    if (duration > 0) {
      parts.push(`Duration: ${duration}ms`);
    }

    return parts.join(' | ');
  }

  /**
   * Convert agent to tool (for use as managed agent)
   */
  to_dict(): unknown {
    return {
      type: 'function',
      function: {
        name: this.name || 'agent',
        description: this.description || 'A multi-step agent',
        parameters: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'The task to execute',
            },
          },
          required: ['task'],
        },
      },
    };
  }

  /**
   * Execute agent as a tool
   */
  async forward(task: string): Promise<unknown> {
    return this.run(task, { reset: true });
  }
}
