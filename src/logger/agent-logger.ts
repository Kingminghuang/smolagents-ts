import { LogLevel } from '../types/index.js';
import { safeStringify } from '../utils/format.js';

export { LogLevel } from '../types/index.js';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level?: LogLevel;
  name?: string;
  pretty?: boolean;
  destination?: string;
}

function getNodeEnv(): string | undefined {
  const globalEnv = globalThis as typeof globalThis & {
    __TEST_ENV__?: Record<string, string | undefined>;
  };
  return globalEnv.__TEST_ENV__?.['NODE_ENV'];
}

function formatArgs(args: unknown[]): string {
  if (!args.length) return '';
  return ' ' + args.map(safeStringify).join(' ');
}

function levelLabel(level: LogLevel): string {
  switch (level) {
    case LogLevel.DEBUG:
      return 'DEBUG';
    case LogLevel.INFO:
      return 'INFO';
    case LogLevel.WARNING:
      return 'WARN';
    case LogLevel.ERROR:
      return 'ERROR';
    default:
      return 'INFO';
  }
}

/**
 * Agent logger implementation
 */
export class AgentLogger {
  private verbosityLevel: LogLevel;
  private isPretty: boolean;
  private name: string;

  constructor(config: LoggerConfig = {}) {
    this.verbosityLevel = config.level ?? LogLevel.INFO;
    this.name = config.name || 'agent';
    const nodeEnv = getNodeEnv();
    this.isPretty = config.pretty ?? nodeEnv !== 'production';
  }

  /**
   * Set verbosity level
   */
  setLevel(level: LogLevel): void {
    this.verbosityLevel = level;
  }

  /**
   * Get current verbosity level
   */
  getLevel(): LogLevel {
    return this.verbosityLevel;
  }

  /**
   * Check if level is enabled
   */
  isEnabled(level: LogLevel): boolean {
    return level >= this.verbosityLevel;
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.isEnabled(LogLevel.DEBUG)) {
      console.warn(this.prefix(LogLevel.DEBUG) + message + formatArgs(args));
    }
  }

  /**
   * Log an info message (default log method)
   */
  log(message: string, ...args: unknown[]): void {
    this.info(message, ...args);
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: unknown[]): void {
    if (this.isEnabled(LogLevel.INFO)) {
      console.warn(this.prefix(LogLevel.INFO) + message + formatArgs(args));
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.isEnabled(LogLevel.WARNING)) {
      console.warn(this.prefix(LogLevel.WARNING) + message + formatArgs(args));
    }
  }

  /**
   * Log an error message
   */
  error(message: string | Error, ...args: unknown[]): void {
    if (this.isEnabled(LogLevel.ERROR)) {
      if (message instanceof Error) {
        console.error(this.prefix(LogLevel.ERROR) + message.message + formatArgs(args));
      } else {
        console.error(this.prefix(LogLevel.ERROR) + message + formatArgs(args));
      }
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(bindings: Record<string, unknown>): AgentLogger {
    const suffix = Object.keys(bindings).length ? ` ${safeStringify(bindings)}` : '';
    return new AgentLogger({
      level: this.verbosityLevel,
      pretty: this.isPretty,
      name: this.name + suffix,
    });
  }

  /**
   * Update live display (for streaming progress)
   */
  updateLiveDisplay(content: unknown): void {
    if (this.isEnabled(LogLevel.INFO)) {
      // In production, just log; in development with proper terminal, could use eraseLine
      const contentStr =
        typeof content === 'string'
          ? content
          : typeof content === 'object' && content !== null
            ? JSON.stringify(content, null, 2)
            : String(content);
      this.info(contentStr);
    }
  }

  /**
   * Log a separator line
   */
  separator(char = '=', length = 80): void {
    if (this.isEnabled(LogLevel.INFO)) {
      this.info(char.repeat(length));
    }
  }

  /**
   * Log a section header
   */
  section(title: string): void {
    if (this.isEnabled(LogLevel.INFO)) {
      this.separator();
      this.info(`  ${title}`);
      this.separator();
    }
  }

  /**
   * Get terminal width
   */
  private prefix(level: LogLevel): string {
    // Keep this simple and browser-safe.
    return `[${levelLabel(level)}][${this.name}] `;
  }

  /**
   * Log a task (New Run)
   */
  logTask(task: string, modelName = 'Model', modelDescription = ''): void {
    if (!this.isEnabled(LogLevel.INFO)) return;

    if (this.isPretty) {
      this.section('New run');
      this.info(task);
      if (modelName) this.info(`${modelName}${modelDescription ? ` - ${modelDescription}` : ''}`);
    } else {
      this.info(`Task: ${task}`);
    }
  }

  /**
   * Log a step separator
   */
  logStep(step: number): void {
    if (!this.isEnabled(LogLevel.INFO)) return;

    if (this.isPretty) {
      this.separator();
      this.info(`Step ${step}`);
      this.separator();
    } else {
      this.info(`--- Step ${step} ---`);
    }
  }

  /**
   * Log a tool call
   */
  logToolCall(name: string, args: unknown): void {
    if (!this.isEnabled(LogLevel.INFO)) return;

    if (this.isPretty) {
      this.info(`Calling tool: '${name}' with arguments: ${safeStringify(args)}`);
    } else {
      this.info(`Calling tool: ${name} with arguments: ${safeStringify(args)}`);
    }
  }

  /**
   * Log an observation
   */
  logObservation(observation: string): void {
    if (!this.isEnabled(LogLevel.INFO)) return;

    if (this.isPretty) {
      this.info(`Observations: ${observation}`);
    } else {
      this.info(`Observations: ${observation}`);
    }
  }

  /**
   * Log a final answer
   */
  logFinalAnswer(answer: string): void {
    if (!this.isEnabled(LogLevel.INFO)) return;

    if (this.isPretty) {
      this.section('Final Answer');
      this.info(answer);
    } else {
      this.info(`Final Answer: ${answer}`);
    }
  }

  /**
   * Log a styled error
   */
  logError(error: unknown): void {
    if (!this.isEnabled(LogLevel.ERROR)) return;

    const errorStr = error instanceof Error ? error.message : String(error);

    if (this.isPretty) {
      this.error(errorStr);
    } else {
      this.error(errorStr);
    }
  }
}

/**
 * Create default logger instance
 */
export function createLogger(config?: LoggerConfig): AgentLogger {
  return new AgentLogger(config);
}
