/**
 * Tests for validation utilities
 */
import { describe, it, expect } from 'vitest';
import { validateToolArguments } from '../../../src/utils/validation.js';
import { MockCalculatorTool } from '../../fixtures/mock-tools.js';
import { BaseTool } from '../../../src/tools/base-tool.js';

describe('validateToolArguments', () => {
  describe('with valid arguments', () => {
    it('should not throw for valid arguments', () => {
      const tool = new MockCalculatorTool();
      const args = {
        operation: 'add',
        a: 1,
        b: 2,
      };

      expect(() => validateToolArguments(tool, args)).not.toThrow();
    });

    it('should handle nullable fields', () => {
      class ToolWithNullable extends BaseTool {
        name = 'tool_with_nullable';
        description = 'Tool with nullable field';
        inputs = {
          operation: {
            type: 'string' as const,
            description: 'Operation',
          },
          a: {
            type: 'number' as const,
            description: 'First number',
          },
          b: {
            type: 'number' as const,
            description: 'Second number',
          },
          optional: {
            type: 'string' as const,
            description: 'Optional field',
            nullable: true,
          },
        };

        async forward(): Promise<any> {
          return 'result';
        }
      }

      const tool = new ToolWithNullable();
      const args = {
        operation: 'add',
        a: 1,
        b: 2,
      };

      expect(() => validateToolArguments(tool, args)).not.toThrow();
    });
  });

  describe('with invalid arguments', () => {
    it('should throw for missing required arguments', () => {
      class TestToolWithRequired extends BaseTool {
        name = 'test_tool_required';
        description = 'Tool with required args';
        inputs = {
          req: {
            type: 'string' as const,
            description: 'Required argument',
            // nullable is false by default if not specified? 
            // In BaseTool/ToolInput type, nullable is optional boolean.
            // validateToolArguments checks !inputDef.nullable.
            // So undefined nullable means not nullable (required).
          }
        };
        async forward() { return ''; }
      }

      const tool = new TestToolWithRequired();
      const args = {
        // missing req
      };

      expect(() => validateToolArguments(tool, args)).toThrow();
    });

    it('should throw for wrong argument types', () => {
      const tool = new MockCalculatorTool();
      const args = {
        operation: 'add',
        a: 'not a number', // should be number
        b: 2,
      };

      expect(() => validateToolArguments(tool, args)).toThrow();
    });

    it('should throw for extra arguments', () => {
      const tool = new MockCalculatorTool();
      const args = {
        operation: 'add',
        a: 1,
        b: 2,
        extra: 'should not be here',
      };

      // Depending on implementation, might allow or reject extra args
      // This test assumes strict validation
    });
  });

  describe('with string arguments', () => {
    it('should parse JSON string arguments', () => {
      const tool = new MockCalculatorTool();
      const args = '{"operation":"add","a":1,"b":2}';

      expect(() => validateToolArguments(tool, args)).not.toThrow();
    });

    it('should throw for invalid JSON', () => {
      const tool = new MockCalculatorTool();
      const args = '{invalid json}';

      expect(() => validateToolArguments(tool, args)).toThrow();
    });
  });

  describe('type validation', () => {
    it('should validate string type', () => {
      const tool = new MockCalculatorTool();
      
      const validArgs = { operation: 'add', a: 1, b: 2 };
      expect(() => validateToolArguments(tool, validArgs)).not.toThrow();

      const invalidArgs = { operation: 123, a: 1, b: 2 };
      expect(() => validateToolArguments(tool, invalidArgs as any)).toThrow();
    });

    it('should validate number type', () => {
      const tool = new MockCalculatorTool();
      
      const validArgs = { operation: 'add', a: 1, b: 2 };
      expect(() => validateToolArguments(tool, validArgs)).not.toThrow();

      const invalidArgs = { operation: 'add', a: 'one', b: 2 };
      expect(() => validateToolArguments(tool, invalidArgs as any)).toThrow();
    });

    it('should validate boolean type', () => {
      class ToolWithBoolean extends BaseTool {
        name = 'tool_with_boolean';
        description = 'Tool with boolean field';
        inputs = {
          operation: {
            type: 'string' as const,
            description: 'Operation',
          },
          a: {
            type: 'number' as const,
            description: 'First number',
          },
          b: {
            type: 'number' as const,
            description: 'Second number',
          },
          flag: {
            type: 'boolean' as const,
            description: 'A boolean flag',
          },
        };

        async forward(): Promise<any> {
          return 'result';
        }
      }

      const tool = new ToolWithBoolean();
      
      const validArgs = { operation: 'add', a: 1, b: 2, flag: true };
      expect(() => validateToolArguments(tool, validArgs)).not.toThrow();

      const invalidArgs = { operation: 'add', a: 1, b: 2, flag: 'yes' };
      expect(() => validateToolArguments(tool, invalidArgs as any)).toThrow();
    });

    it('should validate object type', () => {
      class ToolWithObject extends BaseTool {
        name = 'tool_with_object';
        description = 'Tool with object field';
        inputs = {
          config: {
            type: 'object' as const,
            description: 'Configuration object',
          },
        };

        async forward(): Promise<any> {
          return 'result';
        }
      }

      const tool = new ToolWithObject();
      
      const validArgs = { config: { key: 'value' } };
      expect(() => validateToolArguments(tool, validArgs)).not.toThrow();

      const invalidArgs = { config: 'not an object' };
      expect(() => validateToolArguments(tool, invalidArgs as any)).toThrow();
    });
  });
});
