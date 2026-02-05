import type { Tool, ToolInput } from '../types/index.js';
import { ToolArgumentValidationError } from './errors.js';

/**
 * Validate tool arguments against tool definition
 */
export function validateToolArguments(tool: Tool, arguments_: unknown): void {
  const toolName = tool.name;
  const inputs = tool.inputs;

  // If arguments is a string, try to parse it as JSON
  let args: Record<string, unknown>;
  if (typeof arguments_ === 'string') {
    try {
      args = JSON.parse(arguments_) as Record<string, unknown>;
    } catch (error) {
      throw new ToolArgumentValidationError(
        `Failed to parse tool arguments for ${toolName}: ${String(error)}`
      );
    }
  } else if (typeof arguments_ === 'object' && arguments_ !== null) {
    args = arguments_ as Record<string, unknown>;
  } else {
    throw new ToolArgumentValidationError(
      `Invalid arguments type for tool ${toolName}: expected object or string, got ${typeof arguments_}`
    );
  }

  // Check for required inputs
  for (const [inputName, inputDef] of Object.entries(inputs)) {
    const value = args[inputName];
    const isUndefined = value === undefined;
    const isNull = value === null;

    // Check if required (not nullable, no default, and value is undefined)
    if (isUndefined && inputDef.default === undefined && !inputDef.nullable) {
      throw new ToolArgumentValidationError(
        `Missing required argument '${inputName}' for tool ${toolName}`
      );
    }

    // Check nullable
    if (isNull && !inputDef.nullable) {
      throw new ToolArgumentValidationError(
        `Argument '${inputName}' for tool ${toolName} cannot be null`
      );
    }

    // Type checking
    if (!isUndefined && !isNull) {
      validateType(inputName, value, inputDef, toolName);
    }
  }

  // Check for unknown arguments
  const validInputNames = new Set(Object.keys(inputs));
  for (const argName of Object.keys(args)) {
    if (!validInputNames.has(argName)) {
      throw new ToolArgumentValidationError(
        `Unknown argument '${argName}' for tool ${toolName}. Valid arguments: ${Array.from(validInputNames).join(', ')}`
      );
    }
  }
}

/**
 * Validate argument type
 */
function validateType(
  argName: string,
  value: unknown,
  inputDef: ToolInput,
  toolName: string
): void {
  const expectedType = inputDef.type;
  const actualType = getValueType(value);

  if (expectedType === 'any') {
    return; // Any type is always valid
  }

  if (expectedType === 'integer') {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return;
    }
    throw new ToolArgumentValidationError(
      `Invalid type for argument '${argName}' in tool ${toolName}: expected integer, got ${actualType}`
    );
  }

  if (expectedType !== actualType) {
    throw new ToolArgumentValidationError(
      `Invalid type for argument '${argName}' in tool ${toolName}: expected ${expectedType}, got ${actualType}`
    );
  }

  // Check enum values
  if (inputDef.enum && !inputDef.enum.includes(value as string)) {
    throw new ToolArgumentValidationError(
      `Invalid value for argument '${argName}' in tool ${toolName}: must be one of [${inputDef.enum.join(', ')}], got ${String(value)}`
    );
  }
}

/**
 * Get the type of a value
 */
function getValueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  const type = typeof value;
  if (type === 'object') {
    return 'object';
  }

  return type; // 'string', 'number', 'boolean', etc.
}

/**
 * Parse and validate JSON
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseJSON<T = any>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${String(error)}`);
  }
}

/**
 * Check if name is a valid identifier
 */
function isValidName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

const AUTHORIZED_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'any',
  'dict',
]);

/**
 * Validate tool definition (runtime check similar to Python's validate_tool_attributes)
 */
export function validateToolDefinition(tool: Tool): void {
  const toolName = tool.name;

  if (!isValidName(toolName)) {
    throw new Error(
      `Invalid Tool name '${toolName}': must be a valid identifier and not a reserved keyword`
    );
  }

  const inputs = tool.inputs;
  for (const [inputName, inputDef] of Object.entries(inputs)) {
    if (typeof inputDef !== 'object') {
      throw new Error(`Input '${inputName}' should be an object.`);
    }

    if (!('type' in inputDef) || !('description' in inputDef)) {
      throw new Error(`Input '${inputName}' should have keys 'type' and 'description'.`);
    }

    if (!AUTHORIZED_TYPES.has(inputDef.type)) {
      throw new Error(
        `Input '${inputName}': type must be one of [${Array.from(AUTHORIZED_TYPES).join(', ')}]`
      );
    }
  }

  if (tool.output_type && !AUTHORIZED_TYPES.has(tool.output_type)) {
    throw new Error(
      `Invalid output_type '${tool.output_type}': must be one of [${Array.from(AUTHORIZED_TYPES).join(', ')}]`
    );
  }
}
