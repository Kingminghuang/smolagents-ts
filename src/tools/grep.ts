import { BaseTool } from "./base-tool.js";
import {
    DEFAULT_MAX_BYTES,
    GREP_MAX_LINE_LENGTH,
} from "./fs-utils.js";
import { PYTHON_FS_PRELUDE, PYTHON_GREP_TOOL } from "./python-tools.js";


const DEFAULT_LIMIT = 100;

export class GrepTool extends BaseTool {
    name = "grep";
    description = `Search file contents for a pattern. Returns matching lines with file paths and line numbers. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Long lines are truncated to ${GREP_MAX_LINE_LENGTH} chars.\n\nIMPORTANT: All arguments must be passed as keyword arguments.\nIMPORTANT: This tool returns structured output! Use the JSON schema below to directly access fields like result['field_name']. NO print() statements needed to inspect the output!`;
    output_type = 'dict';
    output_description = 'dict (structured output): This tool ALWAYS returns a dictionary that strictly adheres to the following JSON schema:';
    output_schema = {
        description: 'Output schema for the grep tool.',
        properties: {
            content: {
                type: 'array',
                description: 'Array containing search results',
                title: 'Content',
                items: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['text'] },
                        text: { type: 'string', description: 'Matching lines formatted as <path>:<line_num>: <line>, or "No matches found"' }
                    },
                    required: ['type', 'text']
                }
            }
        },
        required: ['content'],
        title: 'GrepOutput',
        type: 'object'
    };
    pythonCode = PYTHON_FS_PRELUDE + PYTHON_GREP_TOOL;

    inputs = {
        pattern: { type: "string" as const, description: "Search pattern (regex or literal string)" },
        path: { type: "string" as const, description: "Directory or file to search (default: current directory)", default: "." },
        glob: { type: "string" as const, description: "Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'", nullable: true },
        ignore_case: { type: "boolean" as const, description: "Case-insensitive search (default: false)", default: false },
        literal: { type: "boolean" as const, description: "Treat pattern as literal string instead of regex (default: false)", default: false },
        context: { type: "integer" as const, description: "Number of lines to show before and after each match (default: 0)", default: 0 },
        limit: { type: "integer" as const, description: "Maximum number of matches to return (default: 100)", default: 100 }
    };

    constructor(protected cwd: string) {
        super();
    }

    async forward(args: {
        pattern: string;
        path?: string;
        glob?: string;
        ignoreCase?: boolean;
        literal?: boolean;
        limit?: number;
        context?: number;
    }): Promise<any> {
        throw new Error("Unsupported operation");
    }
}
