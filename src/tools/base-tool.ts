import type { Tool, ToolInput, ToolDefinition } from '../types/index.js';

/**
 * Base class for all tools
 */
export abstract class BaseTool implements Tool {
  abstract name: string;
  abstract description: string;
  abstract inputs: Record<string, ToolInput>;

  output_type?: string;
  output_description?: string;
  output_example?: unknown;

  /**
   * Execute the tool
   */
  abstract forward(args: Record<string, any>): Promise<unknown>;

  /**
   * Convert tool to dictionary format for LLM
   */
  to_dict(): ToolDefinition {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [name, input] of Object.entries(this.inputs)) {
      properties[name] = this._input_to_schema(input);

      // If no default and not nullable, it's required
      if (input.default === undefined && !input.nullable) {
        required.push(name);
      }
    }

    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
        },
      },
    };
  }

  private _input_to_schema(input: ToolInput): Record<string, unknown> {
    const schema: Record<string, unknown> = {
      description: input.description || '',
    };

    if (input.type !== 'any') {
      schema['type'] = input.type;
    }

    if (input.enum) {
      schema['enum'] = input.enum;
    }

    if (input.type === 'array' && input.items) {
      schema['items'] = this._input_to_schema(input.items);
    }

    if (input.type === 'object') {
      if (input.properties) {
        const props: Record<string, unknown> = {};
        const req: string[] = [];
        for (const [key, value] of Object.entries(input.properties)) {
          props[key] = this._input_to_schema(value);
          if (value.default === undefined && !value.nullable) {
            req.push(key);
          }
        }
        schema['properties'] = props;
        if (req.length > 0) {
          schema['required'] = req;
        }
      }
      if (input.additionalProperties) {
        schema['additionalProperties'] = this._input_to_schema(input.additionalProperties);
      }
    }

    if (input.anyOf) {
      delete schema['type']; // anyOf usually replaces type
      schema['anyOf'] = input.anyOf.map((subInput) => this._input_to_schema(subInput));
    }

    return schema;
  }

  /**
   * Get tool signature for display
   */
  get_signature(): string {
    const params = Object.entries(this.inputs)
      .map(([name, input]) => {
        let param = `${name}: ${input.type}`;
        if (input.nullable) {
          param += ' | null';
        }
        if (input.default !== undefined) {
          param += ` = ${JSON.stringify(input.default)}`;
        }
        return param;
      })
      .join(', ');

    return `${this.name}(${params})${this.output_type ? `: ${this.output_type}` : ''}`;
  }
}
