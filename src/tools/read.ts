import { BaseTool } from "./base-tool.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "./fs-utils.js";
import { PYTHON_FS_PRELUDE, PYTHON_READ_TOOL } from "./python-tools.js";

export class ReadTool extends BaseTool {
    name = "read";
    description = `Read the contents of a file. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.\n\nIMPORTANT: Use this tool instead of Python's built-in open() function.\nIMPORTANT: All arguments must be passed as keyword arguments.\nIMPORTANT: This tool returns structured output! Use the JSON schema below to directly access fields like result['field_name']. NO print() statements needed to inspect the output!`;
    output_type = 'dict';
    output_description = 'dict (structured output): This tool ALWAYS returns a dictionary that strictly adheres to the following JSON schema:';
    output_schema = {
        description: 'Output schema for the read tool.',
        properties: {
            content: {
                type: 'array',
                description: 'Array of content parts (text or image)',
                title: 'Content',
                items: {
                    anyOf: [
                        {
                            type: 'object',
                            properties: {
                                type: { type: 'string', enum: ['text'] },
                                text: { type: 'string', description: 'Text content or description' }
                            },
                            required: ['type', 'text']
                        },
                        {
                            type: 'object',
                            properties: {
                                type: { type: 'string', enum: ['image'] },
                                mimeType: { type: 'string', description: 'MIME type of the image' },
                                data: { type: 'string', description: 'Base64-encoded image data' }
                            },
                            required: ['type', 'mimeType', 'data']
                        }
                    ]
                }
            }
        },
        required: ['content'],
        title: 'ReadFileOutput',
        type: 'object'
    };
    pythonCode = PYTHON_FS_PRELUDE + PYTHON_READ_TOOL;

    inputs = {
        path: { type: "string" as const, description: "Path to the file to read (relative or absolute)" },
        offset: { type: "number" as const, description: "Line number to start reading from (1-indexed)", nullable: true },
        limit: { type: "number" as const, description: "Maximum number of lines to read", nullable: true }
    };

    constructor(protected cwd: string) {
        super();
    }

    async forward(args: { path: string; offset?: number; limit?: number }): Promise<any> {
        throw new Error("Unsupported operation");
    }
}
