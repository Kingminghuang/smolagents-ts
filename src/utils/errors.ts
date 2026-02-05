/**
 * Base error class for all agent errors
 */
export class AgentError extends Error {
  constructor(
    message: string,
    public readonly logger?: { error: (msg: string) => void }
  ) {
    super(message);
    this.name = 'AgentError';
    Object.setPrototypeOf(this, AgentError.prototype);

    if (logger) {
      logger.error(message);
    }
  }
}

/**
 * Error during model generation
 */
export class AgentGenerationError extends AgentError {
  constructor(message: string, logger?: { error: (msg: string) => void }) {
    super(message, logger);
    this.name = 'AgentGenerationError';
    Object.setPrototypeOf(this, AgentGenerationError.prototype);
  }
}

/**
 * Error parsing model output
 */
export class AgentParsingError extends AgentError {
  constructor(message: string, logger?: { error: (msg: string) => void }) {
    super(message, logger);
    this.name = 'AgentParsingError';
    Object.setPrototypeOf(this, AgentParsingError.prototype);
  }
}

/**
 * Error calling a tool
 */
export class AgentToolCallError extends AgentError {
  constructor(message: string, logger?: { error: (msg: string) => void }) {
    super(message, logger);
    this.name = 'AgentToolCallError';
    Object.setPrototypeOf(this, AgentToolCallError.prototype);
  }
}

/**
 * Error executing a tool
 */
export class AgentToolExecutionError extends AgentError {
  constructor(message: string, logger?: { error: (msg: string) => void }) {
    super(message, logger);
    this.name = 'AgentToolExecutionError';
    Object.setPrototypeOf(this, AgentToolExecutionError.prototype);
  }
}

/**
 * Error during agent execution
 */
export class AgentExecutionError extends AgentError {
  constructor(message: string, logger?: { error: (msg: string) => void }) {
    super(message, logger);
    this.name = 'AgentExecutionError';
    Object.setPrototypeOf(this, AgentExecutionError.prototype);
  }
}

/**
 * Error when max steps reached
 */
export class AgentMaxStepsError extends AgentError {
  constructor(message: string, logger?: { error: (msg: string) => void }) {
    super(message, logger);
    this.name = 'AgentMaxStepsError';
    Object.setPrototypeOf(this, AgentMaxStepsError.prototype);
  }
}

/**
 * Error validating tool arguments
 */
export class ToolArgumentValidationError extends AgentError {
  constructor(message: string, logger?: { error: (msg: string) => void }) {
    super(message, logger);
    this.name = 'ToolArgumentValidationError';
    Object.setPrototypeOf(this, ToolArgumentValidationError.prototype);
  }
}
