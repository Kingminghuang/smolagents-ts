/**
 * Mock tools for testing
 */
import { BaseTool } from '../../src/tools/base-tool.js';

export class MockCalculatorTool extends BaseTool {
  name = 'calculator';
  description = 'Performs basic arithmetic calculations';
  inputs = {
    operation: {
      type: 'string' as const,
      description: 'The operation to perform: add, subtract, multiply, divide',
      nullable: true,
    },
    a: {
      type: 'number' as const,
      description: 'First number',
      nullable: true,
    },
    b: {
      type: 'number' as const,
      description: 'Second number',
      nullable: true,
    },
    expression: {
      type: 'string' as const,
      description: 'Mathematical expression to evaluate',
      nullable: true,
    },
  };

  public callCount = 0;
  public lastArgs: any = null;

  async forward(inputs: { operation: string; a: number; b: number }): Promise<number> {
    this.callCount++;
    this.lastArgs = inputs;

    const { operation, a, b, expression } = inputs as any;

    if (expression) {
      // Simple mock parsing for "a op b" or eval if robust enough,
      // but for our mock tests we can just handle simple cases or use the same eval logic?
      // Let's just use eval for the mock to be compatible with the real tool's behavior for simple math
      // OR we can parse "5 + 3" -> op=add, a=5, b=3.
      const match = expression.match(/(\d+)\s*([+\-*/])\s*(\d+)/);
      if (match) {
        const [_, aStr, op, bStr] = match;
        const valA = parseFloat(aStr);
        const valB = parseFloat(bStr);
        switch (op) {
          case '+':
            return valA + valB;
          case '-':
            return valA - valB;
          case '*':
            return valA * valB;
          case '/':
            if (valB === 0) throw new Error('Division by zero');
            return valA / valB;
        }
      }
      // Fallback or error if not simple "a op b"
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        return Function(`'use strict'; return (${expression})`)() as number;
      } catch {
        throw new Error(`Invalid expression: ${expression}`);
      }
    }

    switch (operation) {
      case 'add':
        return a + b;
      case 'subtract':
        return a - b;
      case 'multiply':
        return a * b;
      case 'divide':
        if (b === 0) throw new Error('Division by zero');
        return a / b;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }
}

export class MockSearchTool extends BaseTool {
  name = 'search';
  description = 'Searches the web for information';
  inputs = {
    query: {
      type: 'string' as const,
      description: 'The search query',
    },
    max_results: {
      type: 'number' as const,
      description: 'Maximum number of results to return',
      nullable: true,
    },
    engine: {
      type: 'string' as const,
      description: 'Search engine to use',
      nullable: true,
    },
  };

  public callCount = 0;
  public lastArgs: any = null;
  private mockResults: { title: string; link: string; description: string }[];

  constructor(
    mockResults: { title: string; link: string; description: string }[] = [
      {
        title: 'Example Result 1',
        link: 'https://example.com/1',
        description: 'Mock result used for tests.',
      },
      {
        title: 'Example Result 2',
        link: 'https://example.com/2',
        description: 'Mock result used for tests.',
      },
      {
        title: 'Example Result 3',
        link: 'https://example.com/3',
        description: 'Mock result used for tests.',
      },
    ]
  ) {
    super();
    this.mockResults = mockResults;
  }

  async forward(inputs: { query: string; max_results?: number; engine?: string }): Promise<string> {
    this.callCount++;
    this.lastArgs = inputs;

    const maxResults = Math.max(1, Math.floor(inputs.max_results ?? 10));
    return (
      '## Search Results\n\n' +
      this.mockResults
        .slice(0, maxResults)
        .map((result) => `[${result.title}](${result.link})\n${result.description}`)
        .join('\n\n')
    );
  }
}

export class MockErrorTool extends BaseTool {
  name = 'error_tool';
  description = 'A tool that always throws an error';
  inputs = {
    message: {
      type: 'string' as const,
      description: 'Error message',
    },
  };

  async forward(inputs: { message: string }): Promise<never> {
    throw new Error(inputs.message || 'Mock error');
  }
}

export class MockAsyncTool extends BaseTool {
  name = 'async_tool';
  description = 'A tool that simulates async work';
  inputs = {
    delay: {
      type: 'number' as const,
      description: 'Delay in milliseconds',
    },
    result: {
      type: 'string' as const,
      description: 'Result to return',
    },
  };

  async forward(inputs: { delay: number; result: string }): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, inputs.delay));
    return inputs.result;
  }
}

/**
 * Create a set of mock tools for testing
 */
export function createMockTools() {
  return {
    calculator: new MockCalculatorTool(),
    search: new MockSearchTool(),
    error: new MockErrorTool(),
    async: new MockAsyncTool(),
  };
}
