import { describe, it, expect, vi } from 'vitest';
import { CodeAgent } from '../../src/agents/code-agent.js';
import { MockModel, mockTextResponse } from '../fixtures/mock-model.js';
import { Tool } from '../../src/types/index.js';

// Define a simple tool
class CalculatorTool implements Tool {
  name = 'calculator';
  description = 'A simple calculator';
  inputs = {
    a: { type: 'number' as const, description: 'First number' },
    b: { type: 'number' as const, description: 'Second number' },
  };

  async forward(args: { a: number; b: number }): Promise<number> {
    return args.a + args.b;
  }

  to_dict() {
    return {
      type: 'function' as const,
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object' as const,
          properties: {
            a: { type: 'number' },
            b: { type: 'number' },
          },
        },
      },
    };
  }
}

describe('CodeAgent Integration', () => {
  it('should execute simple python code and return final answer', async () => {
    const pythonCode = `
a = 5
b = 10
c = a + b
print(f"Calculating {a} + {b} = {c}")
final_answer(c)
`;

    const responseText = `Thought: I will calculate 5 + 10 using python.
<code>
${pythonCode}
</code>
`;

    const model = new MockModel([mockTextResponse(responseText)]);

    const agent = new CodeAgent({
      model,
      tools: [],
      code_block_tags: ['<code>', '</code>'],
    });

    const result = await agent.run('Calculate 5 + 10');

    expect(result).toBe(15);
    expect(model.callCount).toBe(1);
  }, 30000);

  it('should use tools provided', async () => {
    const calcTool = new CalculatorTool();
    const spy = vi.spyOn(calcTool, 'forward');

    const pythonCode = `
 result = calculator(a=20, b=30)
 print(f"Tool returned {result}")
 final_answer(result)
  `;

    const responseText = `Thought: I will use calculator.
<code>
${pythonCode}
</code>
`;

    const model = new MockModel([mockTextResponse(responseText)]);

    const agent = new CodeAgent({
      model,
      tools: [calcTool],
      code_block_tags: ['<code>', '</code>'],
    });

    const result = await agent.run('Calculate 20 + 30 with tool');

    expect(result).toBe(50);
    expect(spy).toHaveBeenCalledWith({ a: 20, b: 30 });
  }, 30000);

  it('should persist state between steps', async () => {
    // Step 1: Define a variable
    const response1 = `Thought: I will define a variable x.
<code>
x = 100
print(f"Defined x = {x}")
</code>
`;
    // Step 2: Use that variable
    const response2 = `Thought: I will use the variable x.
<code>
final_answer(x + 50)
</code>
`;

    const model = new MockModel([mockTextResponse(response1), mockTextResponse(response2)]);

    const agent = new CodeAgent({
      model,
      tools: [],
      code_block_tags: ['<code>', '</code>'],
    });

    const result = await agent.run('Use persistent variable');

    expect(result).toBe(150);
    expect(model.callCount).toBe(2);
  }, 30000);
});
