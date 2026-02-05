import { describe, it, expect } from 'vitest';
import { PyodideExecutor } from '../../src/utils/python-executor.js';
import { CalculatorTool, SearchTool, FinalAnswerTool } from '../../src/tools/default-tools.js';

describe('PyodideExecutor default tools (WASM)', () => {
  it('executes calculator, search, and final_answer in Pyodide', async () => {
    const executor = new PyodideExecutor();
    await executor.init();

    const calculator = new CalculatorTool();
    const search = new SearchTool({ useMock: true });
    const finalAnswer = new FinalAnswerTool();

    await executor.sendTools({
      calculator: async (...args: unknown[]) => {
        const expression = args[0] as string;
        return calculator.forward({ expression });
      },
      search: async (...args: unknown[]) => {
        const query = args[0] as string;
        return search.forward({ query });
      },
      final_answer: async (...args: unknown[]) => {
        const answer = args[0];
        return finalAnswer.forward({ answer });
      },
    });

    const calcResult = await executor.run('calculator("2 + 2")');
    expect(calcResult.is_final_answer).toBe(false);
    expect(calcResult.output).toBe(4);

    const searchResult = await executor.run('search("ts")');
    expect(searchResult.is_final_answer).toBe(false);
    expect(String(searchResult.output)).toContain('## Search Results');

    const finalResult = await executor.run('final_answer("ok")');
    expect(finalResult.is_final_answer).toBe(true);
    expect(finalResult.output).toBe('ok');
  }, 30000);
});
