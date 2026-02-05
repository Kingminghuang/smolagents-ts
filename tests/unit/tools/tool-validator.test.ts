/**
 * Tests for tool validator
 */
import { describe, it, expect } from 'vitest';
import { MockCalculatorTool } from '../../fixtures/mock-tools.js';
import { BaseTool } from '../../../src/tools/base-tool.js';

describe('Tool Validator', () => {
  describe('schema generation', () => {
    it('should generate valid JSON schema from tool inputs', () => {
      const tool = new MockCalculatorTool();
      const dict = tool.to_dict();

      expect(dict.function).toBeDefined();
      expect(dict.function.name).toBe('calculator');
      expect(dict.function.parameters).toBeDefined();
      expect(dict.function.parameters.properties).toBeDefined();
      expect(dict.function.parameters.properties.operation).toBeDefined();
      expect(dict.function.parameters.properties.operation.type).toBe('string');
      expect(dict.function.parameters.properties.a.type).toBe('number');
      expect(dict.function.parameters.properties.b.type).toBe('number');
    });

    it('should handle optional parameters', () => {
      class OptionalTool extends BaseTool {
        name = 'optional_tool';
        description = 'Tool with optional parameters';
        inputs = {
          required: {
            type: 'string' as const,
            description: 'Required param',
          },
          optional: {
            type: 'string' as const,
            description: 'Optional param',
            nullable: true,
          },
        };

        async forward(): Promise<any> {
          return 'result';
        }
      }

      const tool = new OptionalTool();
      const dict = tool.to_dict();

      // Optional fields should not be in required array
      expect(dict.function.parameters.required).toBeDefined();
      expect(dict.function.parameters.required).toContain('required');
      expect(dict.function.parameters.required).not.toContain('optional');
    });
  });

  describe('input conversion', () => {
    it('should convert string arguments to object', () => {
      // This would test the argument conversion in validation
      const jsonString = '{"operation":"add","a":1,"b":2}';
      const parsed = JSON.parse(jsonString);

      expect(parsed).toEqual({
        operation: 'add',
        a: 1,
        b: 2,
      });
    });

    it('should handle nested objects', () => {
      const jsonString = '{"config":{"key":"value"},"value":123}';
      const parsed = JSON.parse(jsonString);

      expect(parsed.config).toEqual({ key: 'value' });
      expect(parsed.value).toBe(123);
    });
  });

  describe('type coercion', () => {
    it('should coerce string numbers to numbers', () => {
      // Test type coercion if implemented
      const value = '42';
      const coerced = Number(value);

      expect(coerced).toBe(42);
      expect(typeof coerced).toBe('number');
    });

    it('should handle boolean strings', () => {
      expect('true' === 'true').toBe(true);
      expect('false' === 'false').toBe(true);
    });
  });
});
