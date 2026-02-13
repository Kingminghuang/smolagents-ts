
import { BaseTool } from "./base-tool.js";
import { PYTHON_FS_PRELUDE, PYTHON_EDIT_TOOL } from "./python-tools.js";

export class EditTool extends BaseTool {
    name = "edit";
    description = "Edit a file by replacing exact text. The oldText must match exactly (including whitespace). Use this for precise, surgical edits.\n\nIMPORTANT: Use this tool instead of Python's built-in open() function.\nIMPORTANT: All arguments must be passed as keyword arguments.\nIMPORTANT: This tool returns structured output! Use the JSON schema below to directly access fields like result['field_name']. NO print() statements needed to inspect the output!";
    output_type = 'dict';
    output_description = 'dict (structured output): This tool ALWAYS returns a dictionary that strictly adheres to the following JSON schema:';
    output_schema = {
        description: 'Output schema for the edit tool.',
        properties: {
            content: {
                type: 'array',
                description: 'Array containing success message',
                title: 'Content',
                items: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['text'] },
                        text: { type: 'string', description: 'Success message confirming text replacement' }
                    },
                    required: ['type', 'text']
                }
            }
        },
        required: ['content'],
        title: 'EditFileOutput',
        type: 'object'
    };
    pythonCode = PYTHON_FS_PRELUDE + PYTHON_EDIT_TOOL;

    inputs = {
        path: { type: "string" as const, description: "Path to the file to edit (relative or absolute)" },
        old_text: { type: "string" as const, description: "Exact text to find and replace (must match exactly)" },
        new_text: { type: "string" as const, description: "New text to replace the old text with" }
    };

    constructor(protected cwd: string) {
        super();
    }

    async forward(args: { path: string; oldText: string; newText: string }): Promise<any> {
        throw new Error("Unsupported operation");
    }
}
