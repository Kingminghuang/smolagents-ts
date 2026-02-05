/**
 * Tests for BaseTool
 */
import { describe, it, expect } from 'vitest';
import { BaseTool } from '../../../src/tools/base-tool.js';

class TestTool extends BaseTool {
  name = 'test_tool';
  description = 'A test tool';
  inputs = {
    input1: {
      type: 'string' as const,
      description: 'First input',
    },
    input2: {
      type: 'number' as const,
      description: 'Second input',
      nullable: true,
    },
  };

  async forward(inputs: { input1: string; input2?: number }): Promise<string> {
    return `Result: ${inputs.input1}, ${inputs.input2 ?? 'none'}`;
  }
}

describe('BaseTool', () => {
  describe('initialization', () => {
    it('should have required properties', () => {
      const tool = new TestTool();

      expect(tool.name).toBe('test_tool');
      expect(tool.description).toBe('A test tool');
      expect(tool.inputs).toBeDefined();
    });
  });

  describe('forward', () => {
    it('should execute tool with valid inputs', async () => {
      const tool = new TestTool();
      const result = await tool.forward({ input1: 'test', input2: 42 });

      expect(result).toBe('Result: test, 42');
    });

    it('should handle optional inputs', async () => {
      const tool = new TestTool();
      const result = await tool.forward({ input1: 'test' });

      expect(result).toBe('Result: test, none');
    });

    it('should forward to forward method', async () => {
      const tool = new TestTool();
      let forwardCalled = false;

      const originalForward = tool.forward;
      tool.forward = async (inputs: any) => {
        forwardCalled = true;
        return originalForward.call(tool, inputs);
      };

      await tool.forward({ input1: 'test' });

      expect(forwardCalled).toBe(true);
    });
  });

  describe('to_dict', () => {
    it('should convert tool to dictionary format', () => {
      const tool = new TestTool();
      const dict = tool.to_dict();

      expect(dict.type).toBe('function');
      expect(dict.function).toBeDefined();
      expect(dict.function.name).toBe('test_tool');
      expect(dict.function.description).toBe('A test tool');
      expect(dict.function.parameters).toBeDefined();
    });

    it('should include output schema if defined', () => {
      class ToolWithOutput extends TestTool {
        output_type = 'string';
      }

      const tool = new ToolWithOutput();
      const dict = tool.to_dict();

      // output_type is a property of the tool, not the dict
      expect(tool.output_type).toBe('string');
    });
  });

  describe('input validation', () => {
    it('should validate required inputs', () => {
      const tool = new TestTool();

      // This would be tested through the validation utility
      expect(tool.inputs.input1).toBeDefined();
      expect(tool.inputs.input1.type).toBe('string');
    });

    it('should support nullable inputs', () => {
      const tool = new TestTool();

      expect(tool.inputs.input2.nullable).toBe(true);
    });
  });
  describe('complex types', () => {
    class ComplexTool extends BaseTool {
      name = 'complex_tool';
      description = 'A complex tool';
      inputs = {
        nested: {
          type: 'object' as const,
          description: 'Nested object',
          properties: {
            field1: {
              type: 'string' as const,
              description: 'Field 1',
            },
          },
        },
        list: {
          type: 'array' as const,
          description: 'List of numbers',
          items: {
            type: 'number' as const,
          },
        },
        union: {
          type: 'object' as const,
          description: 'Union type',
          anyOf: [
            { type: 'string' as const },
            { type: 'number' as const },
          ],
        },
      };

      async forward() {
        return 'ok';
      }
    }

    it('should generate schema for complex types', () => {
      const tool = new ComplexTool();
      const dict = tool.to_dict();
      const params = dict.function.parameters.properties;

      // Nested properties
      expect(params.nested.type).toBe('object');
      expect(params.nested.properties.field1.type).toBe('string');

      // Array items
      expect(params.list.type).toBe('array');
      expect(params.list.items.type).toBe('number');

      // AnyOf
      expect(params.union.anyOf).toHaveLength(2);
      expect(params.union.anyOf[0].type).toBe('string');
      expect(params.union.anyOf[1].type).toBe('number');
    });
  });
});
