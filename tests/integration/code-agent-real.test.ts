import { describe, it, expect } from 'vitest';
import { CodeAgent } from '../../src/agents/code-agent.js';
import { createTestContext } from '../fixtures/real-setup.js';
import { mockTextResponse } from '../fixtures/mock-model.js';

describe('CodeAgent Real/Mock Data Integration', () => {
  const context = createTestContext();

  it('should calculate expression using python', async () => {
    if (context.isMock) {
      // Setup mock response for the calculation task
      const pythonCode = `
a = 5
b = 10
c = a + b
print(f"Calculating {a} + {b} = {c}")
final_answer(c)
`;
      const responseText = `Thought: I will calculate 5 + 10 using python.
\`\`\`python
${pythonCode}
\`\`\`
`;
      context.addMockResponse(mockTextResponse(responseText));
    }

    const agent = new CodeAgent({
      model: context.model,
      tools: [], // CodeAgent has standard python tools internally, we don't need extra tools for this test
    });

    const result = await agent.run('Calculate 5 + 10 using python code');

    // In real mode, the model might format output differently or assume different things,
    // but the result should be 15.
    // The python code execution logs will be in the agent memory/logs.
    
    // Check output type
    if (typeof result === 'number') {
        expect(result).toBe(15);
    } else {
        // Sometimes it might return a string representation "15" or similar depending on the prompt/model
        expect(Number(result)).toBe(15);
    }
  }, 30000);
});
