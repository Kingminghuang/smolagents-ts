import { BaseTool } from "./base-tool.js";
import { DEFAULT_MAX_BYTES } from "./fs-utils.js";
import { PYTHON_FS_PRELUDE, PYTHON_LS_TOOL } from "./python-tools.js";

const DEFAULT_LIMIT = 500;

export class LsTool extends BaseTool {
    name = "ls";
    description = `List directory contents. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Output is truncated to ${DEFAULT_LIMIT} entries or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).\n\nIMPORTANT: All arguments must be passed as keyword arguments.\nIMPORTANT: This tool returns structured output! Use the JSON schema below to directly access fields like result['field_name']. NO print() statements needed to inspect the output!`;
    output_type = 'dict';
    output_description = 'dict (structured output): This tool ALWAYS returns a dictionary that strictly adheres to the following JSON schema:';
    output_schema = {
        description: 'Output schema for the ls tool.',
        properties: {
            content: {
                type: 'array',
                description: 'Array containing directory listing',
                title: 'Content',
                items: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['text'] },
                        text: { type: 'string', description: 'Newline-separated list of entries with "/" suffix for directories, or "(empty directory)"' }
                    },
                    required: ['type', 'text']
                }
            }
        },
        required: ['content'],
        title: 'LsOutput',
        type: 'object'
    };
    pythonCode = PYTHON_FS_PRELUDE + PYTHON_LS_TOOL;

    inputs = {
        path: { type: "string" as const, description: "Directory to list (default: current directory)", default: "." },
        limit: { type: "integer" as const, description: "Maximum number of entries to return (default: 500)", default: 500 }
    };

    constructor(protected cwd: string) {
        super();
    }

    async forward(args: { path?: string; limit?: number }): Promise<any> {
        throw new Error("Unsupported operation");
    }
}
