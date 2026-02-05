import type { ChatMessage } from './message.js';

/**
 * Base interface for memory steps
 */
export interface MemoryStep {
  /**
   * Convert step to chat messages
   */
  to_messages(summary_mode?: boolean): ChatMessage[];
}

/**
 * Agent memory structure
 */
export interface AgentMemoryData {
  system_prompt: unknown;
  steps: MemoryStep[];
}
