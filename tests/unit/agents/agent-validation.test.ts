
import { describe, it, expect, vi } from 'vitest';
import { ToolCallingAgent } from '../../../src/agents/tool-calling-agent.js';
import { CodeAgent } from '../../../src/agents/code-agent.js';
import { BaseTool } from '../../../src/tools/base-tool.js';

describe('Agent Tool Validation', () => {
    class InvalidTool extends BaseTool {
        name = 'invalid tool name'; // invalid: has spaces
        description = 'desc';
        inputs = { input: { type: 'string' as const, description: 'desc' } };
        async forward() { return 'ok'; }
    }

    class ValidTool extends BaseTool {
        name = 'valid_tool';
        description = 'desc';
        inputs = { input: { type: 'string' as const, description: 'desc' } };
        async forward() { return 'ok'; }
    }

    // Mock model
    const mockModel = {
        generate: vi.fn(),
    } as any;

    it('should throw error when initializing ToolCallingAgent with invalid tool', () => {
        const invalidTool = new InvalidTool();

        expect(() => {
            new ToolCallingAgent({
                tools: [invalidTool as any],
                model: mockModel,
            });
        }).toThrow(/Invalid Tool name/);
    });

    it('should pass when initializing ToolCallingAgent with valid tool', () => {
        const validTool = new ValidTool();

        expect(() => {
            new ToolCallingAgent({
                tools: [validTool as any],
                model: mockModel,
            });
        }).not.toThrow();
    });

    it('should throw error when initializing CodeAgent with invalid tool', () => {
        const invalidTool = new InvalidTool();

        expect(() => {
            new CodeAgent({
                tools: [invalidTool as any],
                model: mockModel,
            });
        }).toThrow(/Invalid Tool name/);
    });
});
