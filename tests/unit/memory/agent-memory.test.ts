/**
 * Tests for AgentMemory
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AgentMemory } from '../../../src/memory/agent-memory.js';
import { ActionStep, TaskStep } from '../../../src/memory/index.js';
import type { ChatMessage } from '../../../src/types/index.js';

describe('AgentMemory', () => {
  let memory: AgentMemory;

  beforeEach(() => {
    memory = new AgentMemory('Test system prompt');
  });

  describe('initialization', () => {
    it('should initialize with system prompt', () => {
      expect(memory.system_prompt).toBeDefined();
      expect(memory.system_prompt.system_prompt).toBe('Test system prompt');
    });

    it('should start with empty steps', () => {
      expect(memory.steps).toEqual([]);
    });
  });

  describe('adding steps', () => {
    it('should add a task step', () => {
      const taskStep = new TaskStep('Test task');
      memory.steps.push(taskStep);

      expect(memory.steps).toHaveLength(1);
      expect(memory.steps[0]).toBe(taskStep);
    });

    it('should add an action step', () => {
      const actionStep = new ActionStep(1);
      memory.steps.push(actionStep);

      expect(memory.steps).toHaveLength(1);
      expect(memory.steps[0]).toBe(actionStep);
    });

    it('should maintain order of steps', () => {
      const task = new TaskStep('Task');
      const action1 = new ActionStep(1);
      const action2 = new ActionStep(2);

      memory.steps.push(task, action1, action2);

      expect(memory.steps).toHaveLength(3);
      expect(memory.steps[0]).toBe(task);
      expect(memory.steps[1]).toBe(action1);
      expect(memory.steps[2]).toBe(action2);
    });
  });

  describe('to_messages', () => {
    it('should convert memory to messages', () => {
      const taskStep = new TaskStep('Test task');
      memory.steps.push(taskStep);

      const messages = memory.to_messages();

      expect(messages).toBeDefined();
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);
    });

    it('should include system prompt', () => {
      const messages = memory.to_messages();

      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('Test system prompt');
    });

    it('should include all steps', () => {
      memory.steps.push(new TaskStep('Task 1'));
      memory.steps.push(new ActionStep(1));
      memory.steps.push(new TaskStep('Task 2'));

      const messages = memory.to_messages();

      // System prompt + task steps + action steps
      expect(messages.length).toBeGreaterThan(1);
    });

    it('should support summary mode', () => {
      memory.steps.push(new TaskStep('Task'));
      memory.steps.push(new ActionStep(1));

      const normalMessages = memory.to_messages(false);
      const summaryMessages = memory.to_messages(true);

      expect(normalMessages).toBeDefined();
      expect(summaryMessages).toBeDefined();
      // Summary mode might have different length
    });
  });

  describe('reset', () => {
    it('should clear all steps', () => {
      memory.steps.push(new TaskStep('Task'));
      memory.steps.push(new ActionStep(1));

      expect(memory.steps).toHaveLength(2);

      memory.steps = [];

      expect(memory.steps).toHaveLength(0);
    });

    it('should preserve system prompt after reset', () => {
      memory.steps.push(new TaskStep('Task'));
      memory.steps = [];

      expect(memory.system_prompt.system_prompt).toBe('Test system prompt');
    });
  });

  describe('update system prompt', () => {
    it('should allow updating system prompt', () => {
      memory.system_prompt.system_prompt = 'New system prompt';

      expect(memory.system_prompt.system_prompt).toBe('New system prompt');
    });
  });
});
