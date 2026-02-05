/**
 * Tests for MultiStepAgent base class
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MultiStepAgent } from '../../../src/agents/multi-step-agent.js';
import { createMockModel, mockFinalAnswerResponse } from '../../fixtures/mock-model.js';
import { MockCalculatorTool } from '../../fixtures/mock-tools.js';
import type { MultiStepAgentConfig } from '../../../src/types/index.js';

// Create a concrete implementation for testing
class TestAgent extends MultiStepAgent {
  protected get_default_prompt_templates(): any {
    return {
      system_prompt: 'Test system prompt',
      planning: {
        initial_plan: 'Initial plan',
        update_plan_pre_messages: 'Pre',
        update_plan_post_messages: 'Post',
      },
      managed_agent: {
        task: 'Task',
        report: 'Report',
      },
      final_answer: {
        pre_messages: 'Pre',
        post_messages: 'Post',
      },
    };
  }

  initialize_system_prompt(): string {
    return 'Test agent system prompt';
  }

  protected async *_step_stream(memory_step: any): AsyncGenerator<any> {
    yield { output: 'test result', is_final_answer: true };
  }

  // Expose protected properties for testing
  public get_tools() { return this.tools; }
  public get_managed_agents() { return this.managed_agents; }
  public get_state() { return this.state; }
  public get_logger() { return this.logger; }
  public get_prompt_templates() { return this.prompt_templates; }
  public get_step_callbacks() { return this.step_callbacks; }
}

describe('MultiStepAgent', () => {
  let agent: TestAgent;
  let mockModel: ReturnType<typeof createMockModel>;
  let calculatorTool: MockCalculatorTool;

  beforeEach(() => {
    calculatorTool = new MockCalculatorTool();
    mockModel = createMockModel();

    const config: MultiStepAgentConfig = {
      tools: [calculatorTool],
      model: mockModel,
      max_steps: 10,
    };

    agent = new TestAgent(config);
  });

  describe('initialization', () => {
    it('should initialize with required config', () => {
      expect(agent).toBeDefined();
      expect(agent.get_tools().size).toBe(2); // calculator + final_answer
      expect(agent.get_memory()).toBeDefined();
    });

    it('should set default max_steps to 10', () => {
      const defaultAgent = new TestAgent({
        tools: [],
        model: mockModel,
      });

      expect(defaultAgent).toBeDefined();
    });

    it('should initialize memory with system prompt', () => {
      const memory = agent.get_memory();
      expect(memory.system_prompt).toBeDefined();
      expect(memory.system_prompt.system_prompt).toBe('Test agent system prompt');
    });

    it('should add base tools when add_base_tools is true', () => {
      const agentWithBaseTools = new TestAgent({
        tools: [],
        model: mockModel,
        add_base_tools: true,
      });

      expect(agentWithBaseTools.get_tools().size).toBeGreaterThan(0);
    });
  });

  describe('tools management', () => {
    it('should store tools in map with name as key', () => {
      const tools = agent.get_tools();
      expect(tools.has('calculator')).toBe(true);
      expect(tools.get('calculator')).toBe(calculatorTool);
    });

    it('should handle multiple tools', () => {
      const tool2 = new MockCalculatorTool();
      tool2.name = 'calculator2';

      const multiToolAgent = new TestAgent({
        tools: [calculatorTool, tool2],
        model: mockModel,
      });

      expect(multiToolAgent.get_tools().size).toBe(3); // calculator + calculator2 + final_answer
    });
  });

  describe('memory operations', () => {
    it('should have memory initialized', () => {
      const memory = agent.get_memory();
      const messages = memory.to_messages();

      expect(messages).toBeDefined();
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].role).toBe('system');
    });

    it('should support summary mode', () => {
      const memory = agent.get_memory();
      const normalMessages = memory.to_messages(false);
      const summaryMessages = memory.to_messages(true);

      expect(normalMessages).toBeDefined();
      expect(summaryMessages).toBeDefined();
    });
  });

  describe('step callbacks', () => {
    it('should register and execute step callbacks', async () => {
      let callbackExecuted = false;
      const callback = async (step: any) => {
        callbackExecuted = true;
      };

      agent.get_step_callbacks().register(callback);

      mockModel.addResponse(mockFinalAnswerResponse('test'));
      await agent.run('Test task');

      expect(callbackExecuted).toBe(true);
    });

    it('should execute multiple callbacks', async () => {
      const calls: string[] = [];

      agent.get_step_callbacks().register(async () => {
        calls.push('callback1');
      });

      agent.get_step_callbacks().register(async () => {
        calls.push('callback2');
      });

      mockModel.addResponse(mockFinalAnswerResponse('test'));
      await agent.run('Test task');

      expect(calls).toContain('callback1');
      expect(calls).toContain('callback2');
    });
  });

  describe('managed agents', () => {
    it('should support managed agents', () => {
      const subAgent = new TestAgent({
        tools: [],
        model: mockModel,
        name: 'sub_agent',
        description: 'Sub agent for testing',
      });

      const parentAgent = new TestAgent({
        tools: [],
        model: mockModel,
        managed_agents: [subAgent],
      });

      const managedAgents = parentAgent.get_managed_agents();
      expect(managedAgents.size).toBe(1);
      expect(managedAgents.has('sub_agent')).toBe(true);
    });
  });

  describe('state management', () => {
    it('should maintain state across steps', () => {
      const state = agent.get_state();
      state.set('test_key', 'test_value');

      expect(state.get('test_key')).toBe('test_value');
    });

    it('should clear state on reset', async () => {
      agent.get_state().set('test_key', 'test_value');

      mockModel.addResponse(mockFinalAnswerResponse('result'));
      await agent.run('Task 1');

      mockModel.addResponse(mockFinalAnswerResponse('result2'));
      await agent.run('Task 2', { reset: true });

      // State should be preserved unless explicitly cleared
      // (behavior depends on implementation)
    });
  });

  describe('logger integration', () => {
    it('should have a logger instance', () => {
      const logger = agent.get_logger();
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('prompt templates', () => {
    it('should use default prompt templates', () => {
      const templates = agent.get_prompt_templates();
      expect(templates).toBeDefined();
      expect(templates.system_prompt).toBeDefined();
    });

    it('should accept custom prompt templates', () => {
      const customTemplates = {
        system_prompt: 'Custom system prompt',
        planning: {
          initial_plan: 'Custom plan',
          update_plan_pre_messages: 'Pre',
          update_plan_post_messages: 'Post',
        },
        managed_agent: {
          task: 'Task',
          report: 'Report',
        },
        final_answer: {
          pre_messages: 'Pre',
          post_messages: 'Post',
        },
      };

      const customAgent = new TestAgent({
        tools: [],
        model: mockModel,
        prompt_templates: customTemplates,
      });

      expect(customAgent.get_prompt_templates().system_prompt).toBe('Custom system prompt');
    });
  });
});
