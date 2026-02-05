
import { describe, it, expect } from 'vitest';
import { BaseTool } from '../../../src/tools/base-tool.js';
import { validateToolDefinition } from '../../../src/utils/validation.js';

describe('Tool Definition Validation', () => {
    // Helper to create tool classes easily
    class MockBaseTool extends BaseTool {
        name: string;
        description: string;
        inputs: any;
        output_type?: string;

        constructor(props: Partial<BaseTool>) {
            super();
            this.name = props.name || 'valid_tool';
            this.description = props.description || 'A valid tool';
            this.inputs = props.inputs || { input: { type: 'string', description: 'input' } };
            this.output_type = props.output_type || 'string';
        }

        async forward(args: any): Promise<any> {
            return args;
        }
    }

    it('should pass for valid tool', () => {
        const tool = new MockBaseTool({});
        expect(() => validateToolDefinition(tool)).not.toThrow();
    });

    it('should fail for tool with invalid name', () => {
        // Porting InvalidToolName test
        const tool = new MockBaseTool({ name: 'invalid tool name' });
        expect(() => validateToolDefinition(tool)).toThrow(/Invalid Tool name/);
    });

    it('should fail for invalid input definition (not an object)', () => {
        const tool = new MockBaseTool({
            inputs: {
                input: 'not an object',
            },
        });
        expect(() => validateToolDefinition(tool)).toThrow(/should be an object/);
    });

    it('should fail for inputs missing keys', () => {
        const tool = new MockBaseTool({
            inputs: {
                input: { type: 'string' }, // missing description
            },
        });
        expect(() => validateToolDefinition(tool)).toThrow(/should have keys 'type' and 'description'/);
    });

    it('should fail for unauthorized input types', () => {
        const tool = new MockBaseTool({
            inputs: {
                input: { type: 'magic_type', description: 'desc' },
            },
        });
        expect(() => validateToolDefinition(tool)).toThrow(/type must be one of/);
    });

    it('should fail for unauthorized output type', () => {
        const tool = new MockBaseTool({
            output_type: 'magic_type',
        });
        expect(() => validateToolDefinition(tool)).toThrow(/Invalid output_type/);
    });

    it('should pass for "any" type', () => {
        const tool = new MockBaseTool({
            inputs: {
                input: { type: 'any', description: 'any input' },
            },
            output_type: 'any',
        });
        expect(() => validateToolDefinition(tool)).not.toThrow();
    });
});
