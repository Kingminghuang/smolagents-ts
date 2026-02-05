import type { ChatMessage, Timing, TokenUsage } from '../types/index.js';

/**
 * Base class for memory steps
 */
export abstract class MemoryStepBase {
  abstract to_messages(summary_mode?: boolean): ChatMessage[];
}

/**
 * System prompt step
 */
export class SystemPromptStep extends MemoryStepBase {
  constructor(public system_prompt: string) {
    super();
  }

  to_messages(_summary_mode?: boolean): ChatMessage[] {
    return [
      {
        role: 'system',
        content: this.system_prompt,
      },
    ];
  }
}

/**
 * Task step - initial user request
 */
export class TaskStep extends MemoryStepBase {
  constructor(
    public task: string,
    public images?: unknown[]
  ) {
    super();
  }

  to_messages(_summary_mode?: boolean): ChatMessage[] {
    const message: ChatMessage = {
      role: 'user',
      content: this.task,
    };

    // TODO: Handle images in multimodal messages
    if (this.images && this.images.length > 0) {
      // Convert to multimodal format if needed
    }

    return [message];
  }
}

/**
 * Planning step
 */
export class PlanningStep extends MemoryStepBase {
  constructor(
    public plan: string,
    public step_number?: number
  ) {
    super();
  }

  to_messages(_summary_mode?: boolean): ChatMessage[] {
    return [
      {
        role: 'assistant',
        content: `Plan:\n${this.plan}`,
      },
    ];
  }
}

/**
 * Action step - agent executing tools
 */
export class ActionStep extends MemoryStepBase {
  public model_input_messages?: ChatMessage[];
  public model_output_message?: ChatMessage;
  public model_output?: string;
  public tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown> | string;
  }>;
  public observations?: string;
  public error?: Error;
  public token_usage?: TokenUsage;
  public timing?: Timing;

  constructor(public step_number: number) {
    super();
    this.timing = {
      start_time: Date.now(),
    };
  }

  /**
   * Mark step as complete
   */
  complete(): void {
    if (this.timing) {
      this.timing.end_time = Date.now();
      this.timing.duration = this.timing.end_time - this.timing.start_time;
    }
  }

  to_messages(summary_mode = false): ChatMessage[] {
    const messages: ChatMessage[] = [];
    let has_assistant_tool_calls = false;

    // Add assistant message with tool calls
    if (this.model_output_message) {
      messages.push(this.model_output_message);
      has_assistant_tool_calls = !!this.model_output_message.tool_calls?.length;
    } else if (this.model_output) {
      const message: ChatMessage = {
        role: 'assistant',
        content: this.model_output,
      };

      if (this.tool_calls && this.tool_calls.length > 0) {
        message.tool_calls = this.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments:
              typeof tc.arguments === 'string'
                ? tc.arguments
                : JSON.stringify(tc.arguments, null, 2),
          },
        }));
        has_assistant_tool_calls = true;
      }

      messages.push(message);
    }

    // Add tool response messages
    if (has_assistant_tool_calls && this.tool_calls && this.observations) {
      const observationLines = this.observations.split('\n');

      for (let i = 0; i < this.tool_calls.length; i++) {
        const toolCall = this.tool_calls[i];
        if (!toolCall) continue;
        const observation = observationLines[i] || '';

        messages.push({
          role: 'tool',
          content: summary_mode ? observation.slice(0, 200) : observation,
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      }
    }

    // If there were observations without tool calls, append them as assistant content
    if (!has_assistant_tool_calls && this.observations) {
      const observationText = summary_mode ? this.observations.slice(0, 200) : this.observations;
      messages.push({
        role: 'assistant',
        content: `Observation:\n${observationText}`,
      });
    }

    return messages;
  }

  /**
   * Get summary of this step
   */
  getSummary(): string {
    const parts: string[] = [];

    parts.push(`Step ${this.step_number}`);

    if (this.tool_calls) {
      parts.push(`Tools: ${this.tool_calls.map((tc) => tc.name).join(', ')}`);
    }

    if (this.observations) {
      const obsPreview = this.observations.slice(0, 100);
      parts.push(`Result: ${obsPreview}${this.observations.length > 100 ? '...' : ''}`);
    }

    if (this.error) {
      parts.push(`Error: ${this.error.message}`);
    }

    if (this.timing?.duration) {
      parts.push(`Duration: ${this.timing.duration}ms`);
    }

    return parts.join(' | ');
  }
}

/**
 * Final answer step
 */
export class FinalAnswerStep extends MemoryStepBase {
  constructor(
    public final_answer: unknown,
    public from_managed_agent = false
  ) {
    super();
  }

  to_messages(_summary_mode?: boolean): ChatMessage[] {
    let content: string;
    if (typeof this.final_answer === 'string') {
      content = this.final_answer;
    } else {
      try {
        content = JSON.stringify(this.final_answer, null, 2);
      } catch {
        content = String(this.final_answer);
      }
    }

    return [
      {
        role: 'assistant',
        content: `Final Answer: ${content}`,
      },
    ];
  }
}
