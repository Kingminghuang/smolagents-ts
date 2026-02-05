import type { StepCallback } from '../types/index.js';
import type { MemoryStepBase } from './memory-step.js';

/**
 * Callback registry for memory steps
 */
export class CallbackRegistry {
  private callbacks: StepCallback[] = [];

  /**
   * Register a callback
   */
  register(callback: StepCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Unregister a callback
   */
  unregister(callback: StepCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index !== -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Execute all callbacks for a step
   */
  async execute(step: MemoryStepBase): Promise<void> {
    for (const callback of this.callbacks) {
      try {
        await callback(step);
      } catch (error) {
        // Log but don't throw - callbacks shouldn't break the agent
        console.error('Error in step callback:', error);
      }
    }
  }

  /**
   * Get number of registered callbacks
   */
  size(): number {
    return this.callbacks.length;
  }

  /**
   * Clear all callbacks
   */
  clear(): void {
    this.callbacks = [];
  }
}
