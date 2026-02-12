import { BaseTool } from "./base-tool.js";
import {
    DEFAULT_MAX_BYTES,
} from "./fs-utils.js";
import { PYTHON_FS_PRELUDE, PYTHON_FIND_TOOL } from "./python-tools.js";


const DEFAULT_LIMIT = 1000;

export class FindTool extends BaseTool {
    name = "find";
    description = `Search for files by glob pattern. Returns matching file paths relative to the search directory. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} results or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).\n\nIMPORTANT: All arguments must be passed as keyword arguments.\nIMPORTANT: This tool returns structured output! Use the JSON schema below to directly access fields like result['field_name']. NO print() statements needed to inspect the output!`;
    output_type = 'dict';
    output_description = 'dict (structured output): This tool ALWAYS returns a dictionary that strictly adheres to the following JSON schema:';
    output_schema = {
        description: 'Output schema for the find tool.',
        properties: {
            content: {
                type: 'array',
                description: 'Array containing file search results',
                title: 'Content',
                items: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['text'] },
                        text: { type: 'string', description: 'Newline-separated list of matching file paths, or "No files found"' }
                    },
                    required: ['type', 'text']
                }
            }
        },
        required: ['content'],
        title: 'FindOutput',
        type: 'object'
    };
    pythonCode = PYTHON_FS_PRELUDE + PYTHON_FIND_TOOL;

    inputs = {
        pattern: { type: "string" as const, description: "Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts" },
        path: { type: "string" as const, description: "Directory to search in (default: current directory)", nullable: true },
        limit: { type: "number" as const, description: "Maximum number of results (default: 1000)", nullable: true }
    };

    constructor(protected cwd: string) {
        super();
    }

    async forward(args: { pattern: string; path?: string; limit?: number }): Promise<any> {
        throw new Error("Unsupported operation");
    }
}
