import type { ChatMessage } from '../types/index.js';
import {
  SystemPromptStep,
  PlanningStep,
  ActionStep,
  FinalAnswerStep,
  type MemoryStepBase,
} from './memory-step.js';

/**
 * Agent memory - stores conversation history and state
 */
export class AgentMemory {
  public system_prompt: SystemPromptStep;
  public steps: MemoryStepBase[] = [];

  constructor(system_prompt: string) {
    this.system_prompt = new SystemPromptStep(system_prompt);
  }

  /**
   * Add a step to memory
   */
  add_step(step: MemoryStepBase): void {
    this.steps.push(step);
  }

  /**
   * Get the last step
   */
  get_last_step(): MemoryStepBase | undefined {
    return this.steps[this.steps.length - 1];
  }

  /**
   * Get all steps of a specific type
   */
  get_steps_of_type<T extends MemoryStepBase>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: new (...args: any[]) => T
  ): T[] {
    return this.steps.filter((step) => step instanceof type) as T[];
  }

  /**
   * Convert entire memory to messages
   */
  to_messages(summary_mode = false): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // Add system prompt
    messages.push(...this.system_prompt.to_messages(summary_mode));

    // Add all steps
    for (const step of this.steps) {
      messages.push(...step.to_messages(summary_mode));
    }

    return messages;
  }

  /**
   * Get memory summary
   */
  get_summary(): string {
    const parts: string[] = [];

    parts.push(`Total steps: ${this.steps.length}`);

    const actionSteps = this.get_steps_of_type(ActionStep);
    if (actionSteps.length > 0) {
      parts.push(`Action steps: ${actionSteps.length}`);
    }

    const planningSteps = this.get_steps_of_type(PlanningStep);
    if (planningSteps.length > 0) {
      parts.push(`Planning steps: ${planningSteps.length}`);
    }

    const finalAnswerSteps = this.get_steps_of_type(FinalAnswerStep);
    if (finalAnswerSteps.length > 0) {
      parts.push('Has final answer');
    }

    return parts.join(' | ');
  }

  /**
   * Reset memory (keep system prompt)
   */
  reset(): void {
    this.steps = [];
  }

  /**
   * Get total token usage across all steps
   */
  get_total_tokens(): { input: number; output: number; total: number } {
    let input = 0;
    let output = 0;

    for (const step of this.steps) {
      if (step instanceof ActionStep && step.token_usage) {
        input += step.token_usage.input_tokens;
        output += step.token_usage.output_tokens;
      }
    }

    return { input, output, total: input + output };
  }

  /**
   * Get total duration across all steps
   */
  get_total_duration(): number {
    let total = 0;

    for (const step of this.steps) {
      if (step instanceof ActionStep && step.timing?.duration) {
        total += step.timing.duration;
      }
    }

    return total;
  }
}
