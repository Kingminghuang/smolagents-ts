import { BaseTool } from "./base-tool.js";
import { PYTHON_FS_PRELUDE, PYTHON_WRITE_TOOL } from "./python-tools.js";

export class WriteTool extends BaseTool {
    name = "write";
    description = "Write content to a file. Creates file if it doesn't exist, overwrites if it does. Automatically creates parent directories.\n\nIMPORTANT: Use this tool instead of Python's built-in open() function.\nIMPORTANT: All arguments must be passed as keyword arguments.\nIMPORTANT: This tool returns structured output! Use the JSON schema below to directly access fields like result['field_name']. NO print() statements needed to inspect the output!";
    output_type = 'dict';
    output_description = 'dict (structured output): This tool ALWAYS returns a dictionary that strictly adheres to the following JSON schema:';
    output_schema = {
        description: 'Output schema for the write tool.',
        properties: {
            content: {
                type: 'array',
                description: 'Array containing success message',
                title: 'Content',
                items: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['text'] },
                        text: { type: 'string', description: 'Success message with bytes written and path' }
                    },
                    required: ['type', 'text']
                }
            }
        },
        required: ['content'],
        title: 'WriteFileOutput',
        type: 'object'
    };
    pythonCode = PYTHON_FS_PRELUDE + PYTHON_WRITE_TOOL;

    inputs = {
        path: { type: "string" as const, description: "Path to the file to write (relative or absolute)" },
        content: { type: "string" as const, description: "Content to write to the file" }
    };

    constructor(protected cwd: string) {
        super();
    }

    async forward(args: { path: string; content: string }): Promise<any> {
        throw new Error("Unsupported operation");
    }
}
