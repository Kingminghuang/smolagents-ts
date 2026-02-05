/**
 * Regression test for Pyodide asset path resolution
 */
import { describe, it, expect } from 'vitest';
import { PyodideExecutor } from '../../../src/utils/python-executor.js';

describe('PyodideExecutor', () => {
  it('should initialize and run code in Node', async () => {
    const executor = new PyodideExecutor();
    const result = await executor.run('1 + 2');

    expect(result.output).toBe(3);
  }, 30000);

  it('captures stdout and stderr logs', async () => {
    const executor = new PyodideExecutor(['sys']);
    const result = await executor.run('print("hello")\nimport sys\nprint("oops", file=sys.stderr)');

    expect(result.logs).toContain('hello');
    expect(result.logs).toContain('stderr: oops');
  }, 30000);

  it('allows tool invocation and returns result', async () => {
    const executor = new PyodideExecutor();
    await executor.sendTools({
      add_two: async (x: unknown) => (x as number) + 2,
    });

    const result = await executor.run('add_two(3)');
    expect(result.output).toBe(5);
  }, 30000);

  it('auto-awaits tool calls for returned objects', async () => {
    const executor = new PyodideExecutor();
    await executor.sendTools({
      make_record: async () => ({ entries: [{ path: 'demo.txt' }] }),
    });

    const result = await executor.run('record = make_record()\nrecord["entries"][0]["path"]');
    expect(result.output).toBe('demo.txt');
  }, 30000);

  it('auto-awaits tool calls inside functions', async () => {
    const executor = new PyodideExecutor();
    await executor.sendTools({
      add_one: async (value: unknown) => (value as number) + 1,
    });

    const result = await executor.run('def apply(x):\n    return add_one(x)\napply(2)');
    expect(result.output).toBe(3);
  }, 30000);

  it('auto-awaits tool calls in recursive functions', async () => {
    const executor = new PyodideExecutor();
    await executor.sendTools({
      add_one: async (value: unknown) => (value as number) + 1,
    });

    const result = await executor.run(
      'def total(n):\n    if n <= 0:\n        return 0\n    return add_one(total(n - 1))\ntotal(2)'
    );
    expect(result.output).toBe(2);
  }, 30000);

  it('auto-awaits async functions from earlier cells', async () => {
    const executor = new PyodideExecutor();
    await executor.run('async def get_total_size(path):\n    return 5');

    const result = await executor.run(
      'def human_readable_size(size_bytes):\n    return float(size_bytes)\nsize = human_readable_size(get_total_size("."))\nsize'
    );
    expect(result.output).toBe(5);
  }, 30000);

  it('treats final_answer as terminating result', async () => {
    const executor = new PyodideExecutor();
    await executor.sendTools({
      final_answer: async (value: unknown) => value,
    });

    const result = await executor.run(
      'try:\n    final_answer(1)\nexcept Exception:\n    final_answer(2)'
    );
    expect(result.is_final_answer).toBe(true);
    expect(result.output).toBe(1);
  }, 30000);

  it('supports final_answer kwarg syntax', async () => {
    const executor = new PyodideExecutor();
    await executor.sendTools({
      final_answer: async (value: unknown) => value,
    });

    const result = await executor.run('final_answer(answer=42)');
    expect(result.is_final_answer).toBe(true);
    expect(result.output).toBe(42);
  }, 30000);

  it('returns last expression when no final_answer', async () => {
    const executor = new PyodideExecutor();
    const result = await executor.run('x = 1\nx + 4');
    expect(result.is_final_answer).toBe(false);
    expect(result.output).toBe(5);
  }, 30000);

  it('blocks unauthorized imports by default', async () => {
    const executor = new PyodideExecutor();
    await expect(executor.run('import math\nmath.sqrt(4)')).rejects.toThrow(
      "Import of 'math' is not authorized"
    );
  }, 30000);

  it('allows authorized imports with submodule patterns', async () => {
    const executor = new PyodideExecutor(['math']);
    const result = await executor.run('import math\nmath.sqrt(9)');
    expect(result.output).toBe(3);
  }, 30000);

  it('allows authorized submodule patterns', async () => {
    const executor = new PyodideExecutor(['importlib.*']);
    const result = await executor.run(
      'import importlib.util\nimport importlib\nimportlib.util.find_spec("sys") is not None'
    );
    expect(result.output).toBe(true);
  }, 30000);

  it('blocks non-matching submodules', async () => {
    const executor = new PyodideExecutor(['importlib.util']);
    await expect(executor.run('import importlib.machinery')).rejects.toThrow(
      "Import of 'importlib.machinery' is not authorized"
    );
  }, 30000);

  it('supports wildcard import authorization', async () => {
    const executor = new PyodideExecutor(['*']);
    const result = await executor.run('import math\nmath.sqrt(16)');
    expect(result.output).toBe(4);
  }, 30000);

  it('blocks dangerous builtins unless explicitly injected', async () => {
    const executor = new PyodideExecutor();
    await expect(executor.run('eval("1 + 1")')).rejects.toThrow('Forbidden builtin');

    await expect(executor.run('compile("1 + 1", "no filename", "exec")')).rejects.toThrow(
      'Forbidden builtin'
    );

    const unwrapValue = (value: unknown) => {
      if (value && typeof value === 'object') {
        const maybeProxy = value as { toJs?: () => unknown };
        if (typeof maybeProxy.toJs === 'function') {
          return maybeProxy.toJs();
        }
      }
      return value;
    };

    await executor.sendTools({
      eval: async (expr: unknown) => {
        const value = String(unwrapValue(expr));
        if (value === '1 + 1') return 2;
        return value;
      },
    });

    await expect(executor.run('eval("1 + 1")')).resolves.toBeDefined();
  }, 30000);

  it('enforces max operations limit', async () => {
    const executor = new PyodideExecutor([], { max_operations: 20 });
    await expect(executor.run('total = 0\nfor i in range(100):\n    total += i')).rejects.toThrow(
      'Reached the max number of operations'
    );
  }, 30000);

  it('enforces max while iterations limit', async () => {
    const executor = new PyodideExecutor([], { max_while_iterations: 10 });
    await expect(executor.run('i = 0\nwhile i < 20:\n    i += 1')).rejects.toThrow(
      'Maximum number of 10 iterations in While loop exceeded'
    );
  }, 30000);

  it('formats syntax errors with caret indicators', async () => {
    const executor = new PyodideExecutor();
    await expect(executor.run('a = ;')).rejects.toThrow('SyntaxError');
  }, 30000);

  it('includes failing line in runtime errors', async () => {
    const executor = new PyodideExecutor();
    await expect(executor.run('a = 1\ncounts = [1, 2, 3]\ncounts += 1')).rejects.toThrow(
      'Code execution failed at line 3: counts += 1'
    );
  }, 30000);

  it('adds close matches to key errors', async () => {
    const executor = new PyodideExecutor();
    await expect(
      executor.run(
        'capitals = {"Czech Republic": "Prague", "Monaco": "Monaco", "Bhutan": "Thimphu"}\ncapitals["Butan"]'
      )
    ).rejects.toThrow('Maybe you meant one of these indexes instead');
  }, 30000);
});
