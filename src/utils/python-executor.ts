import { loadPyodide, type PyodideInterface } from 'pyodide';
import { AgentExecutionError } from './errors.js';

interface PyodideGlobalSetter {
  globals: {
    set: (name: string, value: unknown) => void;
  };
  setStdout: (handler: { batched: (msg: string) => void }) => void;
  setStderr: (handler: { batched: (msg: string) => void }) => void;
  runPythonAsync: (code: string) => Promise<unknown>;
}

type ToolRegistry = Record<string, (...args: unknown[]) => Promise<unknown>>;

type ToPyDefaultConverter = (
  value: unknown,
  convert: (value: unknown) => unknown,
  cacheConversion: (input: unknown, output: unknown) => void
) => unknown;

type ToPyOptions = {
  depth?: number;
  defaultConverter?: ToPyDefaultConverter;
};

type JsProxyValue = {
  typeof?: string;
  constructor?: { name?: string } | null;
  as_py_json?: () => unknown;
  to_py?: (options?: unknown) => unknown;
};

export interface CodeOutput {
  output: unknown;
  logs: string;
  is_final_answer: boolean;
}

export interface PyodideExecutorOptions {
  authorized_imports?: string[];
  max_operations?: number;
  max_while_iterations?: number;
  allowed_dangerous_builtins?: string[];
  // NODEFS configuration
  workDir?: string;  // Node.js directory to mount (default: process.cwd())
  mountPoint?: string;  // Pyodide mount path (default: "/mnt")
}

export const BASE_BUILTIN_MODULES = [
  "collections",
  "datetime",
  "itertools",
  "math",
  "queue",
  "random",
  "re",
  "stat",
  "statistics",
  "time",
  "unicodedata",
];

export class PyodideExecutor {
  private pyodide: (PyodideInterface & PyodideGlobalSetter) | null = null;
  private state: Record<string, unknown> = {};
  private authorizedImports: string[] = [];
  private maxOperations: number | null = null;
  private maxWhileIterations: number | null = null;
  private allowedDangerousBuiltins: string[] = [];
  private toolNames: string[] = [];
  private runtimeReady = false;
  // NODEFS configuration and state
  private workDir: string;
  private mountPoint: string;
  private isMounted = false;

  private getConverters() {
    const api = this.pyodide as unknown as {
      toPy?: (value: unknown, options?: ToPyOptions) => unknown;
      toJs?: (value: unknown) => unknown;
      ffi?: { toPy?: (value: unknown) => unknown; toJs?: (value: unknown) => unknown };
    };
    const toPy = api.toPy
      ? (value: unknown, options?: ToPyOptions) => api.toPy?.(value, options) ?? value
      : api.ffi?.toPy
        ? (value: unknown) => api.ffi?.toPy?.(value) ?? value
        : (value: unknown) => value;
    const toJs = api.toJs
      ? (value: unknown) => api.toJs?.(value) ?? value
      : api.ffi?.toJs
        ? (value: unknown) => api.ffi?.toJs?.(value) ?? value
        : (value: unknown) => value;
    return { toPy, toJs };
  }

  private getJsProxyDescriptor(value: JsProxyValue): { jsType: string; jsConstructor?: string } {
    const jsType = typeof value.typeof === 'string' ? value.typeof : 'object';
    const jsConstructor =
      value.constructor && value.constructor.name ? value.constructor.name : undefined;
    return { jsType, jsConstructor };
  }

  private buildToPyDefaultConverter(forLog: boolean): ToPyDefaultConverter {
    return (value, convert) => {
      if (value === null || value === undefined) return value;
      if (typeof value !== 'object') return value;

      if (value instanceof Error) {
        const data = {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
        return forLog ? { __js_type__: 'Error', ...data } : data;
      }

      if (typeof File !== 'undefined' && value instanceof File) {
        const data = {
          name: value.name,
          size: value.size,
          type: value.type,
          lastModified: value.lastModified,
        };
        return forLog ? { __js_type__: 'File', ...data } : data;
      }

      if (typeof Blob !== 'undefined' && value instanceof Blob) {
        const data = {
          size: value.size,
          type: value.type,
        };
        return forLog ? { __js_type__: 'Blob', ...data } : data;
      }

      if (value instanceof Date) {
        const data = value.toISOString();
        return forLog ? { __js_type__: 'Date', value: data } : data;
      }

      if (ArrayBuffer.isView(value)) {
        const data = Array.from(value as unknown as ArrayLike<number>);
        return forLog ? { __js_type__: 'TypedArray', value: data } : data;
      }

      if (value instanceof ArrayBuffer) {
        const data = Array.from(new Uint8Array(value));
        return forLog ? { __js_type__: 'ArrayBuffer', value: data } : data;
      }

      if (value instanceof Map) {
        const data: Array<[unknown, unknown]> = Array.from(value.entries()).map(([key, entry]) => [
          key,
          convert(entry),
        ]);
        return forLog ? { __js_type__: 'Map', value: data } : data;
      }

      if (value instanceof Set) {
        const data = Array.from(value.values()).map((entry) => convert(entry));
        return forLog ? { __js_type__: 'Set', value: data } : data;
      }

      if (
        typeof (value as JsProxyValue).as_py_json === 'function' ||
        typeof (value as JsProxyValue).to_py === 'function'
      ) {
        const jsProxy = value as JsProxyValue;
        const descriptor = this.getJsProxyDescriptor(jsProxy);
        if (typeof jsProxy.as_py_json === 'function') {
          try {
            const converted = jsProxy.as_py_json();
            return forLog
              ? { __js_type__: descriptor.jsConstructor ?? descriptor.jsType, value: converted }
              : converted;
          } catch {
            // fall through
          }
        }
        if (typeof jsProxy.to_py === 'function') {
          try {
            const converted = jsProxy.to_py({
              depth: -1,
              default_converter: this.buildToPyDefaultConverter(forLog),
            });
            return forLog
              ? { __js_type__: descriptor.jsConstructor ?? descriptor.jsType, value: converted }
              : converted;
          } catch {
            // fall through
          }
        }
        const fallbackValue = Object.prototype.toString.call(value);
        return forLog
          ? { __js_type__: descriptor.jsConstructor ?? descriptor.jsType, value: fallbackValue }
          : fallbackValue;
      }

      const maybeToJson = value as { toJSON?: () => unknown };
      if (typeof maybeToJson.toJSON === 'function') {
        return maybeToJson.toJSON();
      }

      if ('name' in value && 'kind' in value) {
        const handle = value as { name?: unknown; kind?: unknown };
        const data = {
          name: typeof handle.name === 'string' ? handle.name : undefined,
          kind: typeof handle.kind === 'string' ? handle.kind : undefined,
        };
        return forLog ? { __js_type__: 'FileSystemHandle', ...data } : data;
      }

      const fallbackValue = Object.prototype.toString.call(value);
      return forLog ? { __js_type__: 'Unknown', value: fallbackValue } : fallbackValue;
    };
  }



  constructor(authorizedImports: string[] = BASE_BUILTIN_MODULES, options: PyodideExecutorOptions = {}) {
    this.authorizedImports = options.authorized_imports ?? authorizedImports;
    this.maxOperations = options.max_operations ?? 100000;
    this.maxWhileIterations = options.max_while_iterations ?? 10000;
    this.allowedDangerousBuiltins = options.allowed_dangerous_builtins ?? [];
    // Initialize NODEFS configuration
    this.workDir = options.workDir ?? process.cwd();
    this.mountPoint = options.mountPoint ?? '/mnt';
  }

  async init() {
    if (!this.pyodide) {
      const globalWindow = (
        globalThis as typeof globalThis & {
          window?: { loadPyodide?: (options?: { indexURL?: string }) => Promise<unknown> };
        }
      ).window;
      const isNode =
        typeof process !== 'undefined' &&
        typeof process.versions === 'object' &&
        typeof process.versions.node === 'string';
      if (globalWindow && typeof globalWindow.loadPyodide === 'function') {
        // Browser environment with CDN script
        this.pyodide = (await globalWindow.loadPyodide()) as PyodideInterface & PyodideGlobalSetter;
      } else if (isNode) {
        const [{ createRequire }, pathModule] = await Promise.all([
          import('node:module'),
          import('node:path'),
        ]);
        const require = createRequire(import.meta.url);
        const pyodideEntry = require.resolve('pyodide/pyodide.mjs');
        const pyodideDir = pathModule.dirname(pyodideEntry);
        const indexURL = `${pyodideDir}${pathModule.sep}`;
        this.pyodide = (await loadPyodide({ indexURL })) as PyodideInterface & PyodideGlobalSetter;

        // Mount NODEFS in Node.js environment
        // Maps Pyodide's {mountPoint} → Node.js's {workDir}
        try {
          this.pyodide.FS.mkdirTree(this.mountPoint);
          this.pyodide.FS.mount(
            this.pyodide.FS.filesystems.NODEFS,
            { root: this.workDir },
            this.mountPoint
          );
          this.isMounted = true;
        } catch (error) {
          console.error('Failed to mount NODEFS:', error);
          // Continue without mounting - tools will fail but Pyodide still works
        }
      } else {
        // Non-browser environment (use default indexURL)
        this.pyodide = (await loadPyodide()) as PyodideInterface & PyodideGlobalSetter;
      }
    }
  }

  async sendTools(tools: ToolRegistry, pythonToolsMap?: Record<string, string>) {
    await this.ensureRuntime();
    if (!this.pyodide) throw new Error('Pyodide not initialized');

    // Set mount point environment variable for Python tools
    this.pyodide.runPython(`
import os
os.environ['PYODIDE_MOUNT_POINT'] = '${this.mountPoint}'
    `);

    // Execute injected Python tool definitions
    if (pythonToolsMap) {
      for (const [name, code] of Object.entries(pythonToolsMap)) {
        try {
          this.pyodide.runPython(code);
        } catch (error) {
          console.error(`Failed to inject Python tool '${name}':`, error);
          throw error;
        }
      }
    }

    const fsToolNames = pythonToolsMap ? Object.keys(pythonToolsMap) : [];

    // Register additional tools passed to the function
    for (const [name, tool] of Object.entries(tools)) {
      this.pyodide.globals.set(name, tool);
    }

    this.toolNames = [...fsToolNames, ...Object.keys(tools)];
    this.registerAllowedDangerousBuiltins(this.toolNames);

    await this.updateUserGlobals(this.toolNames);
  }

  async sendVariables(variables: Record<string, unknown>) {
    await this.ensureRuntime();
    if (!this.pyodide) throw new Error('Pyodide not initialized');
    this.state = { ...this.state, ...variables };
    for (const [name, value] of Object.entries(variables)) {
      this.pyodide.globals['set'](name, value);
    }
    await this.updateUserGlobals(Object.keys(variables));
  }

  async run(code: string): Promise<CodeOutput> {
    await this.ensureRuntime();
    if (!this.pyodide) throw new Error('Pyodide not initialized');

    const pyodide = this.pyodide;
    const { toJs } = this.getConverters();

    let logs = '';
    pyodide.setStdout({
      batched: (msg) => {
        logs += msg + '\n';
      },
    });
    pyodide.setStderr({
      batched: (msg) => {
        logs += 'stderr: ' + msg + '\n';
      },
    });

    try {
      pyodide.globals['set']('__smolagents_code__', code);
      pyodide.globals['set']('__smolagents_config__', {
        authorized_imports: this.authorizedImports,
        max_operations: this.maxOperations,
        max_while_iterations: this.maxWhileIterations,
        allowed_dangerous_builtins: this.allowedDangerousBuiltins,
        tool_names: this.toolNames,
      });

      const result: unknown = await pyodide.runPythonAsync(
        '__smolagents_run(__smolagents_code__, __smolagents_config__)'
      );
      const jsResult = toJs(result) as { is_final_answer: boolean; value: unknown };

      return {
        output: jsResult.value,
        logs: logs,
        is_final_answer: Boolean(jsResult.is_final_answer),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AgentExecutionError(`Error executing code: ${message}\nLogs:\n${logs}`);
    }
  }

  private async ensureRuntime() {
    await this.init();
    if (!this.pyodide) throw new Error('Pyodide not initialized');
    if (this.runtimeReady) return;
    await this.pyodide.runPythonAsync(this.getRuntimePrelude());
    this.runtimeReady = true;
  }

  /**
   * Cleanup method: unmount NODEFS and release resources
   * MUST be called when PyodideExecutor is no longer needed
   */
  async cleanup() {
    if (!this.pyodide) return;

    try {
      // Unmount NODEFS if mounted
      if (this.isMounted) {
        this.pyodide.FS.unmount(this.mountPoint);
        this.isMounted = false;
      }

      // Release reference to allow GC
      // Note: Pyodide doesn't have a destroy() method
      this.pyodide = null;
      this.runtimeReady = false;
    } catch (error) {
      console.error('Error during PyodideExecutor cleanup:', error);
      throw error;
    }
  }

  private async updateUserGlobals(names: string[]) {
    if (!this.pyodide || names.length === 0) return;
    const python = `__smolagents_set_user_globals(${JSON.stringify(names)})`;
    await this.pyodide.runPythonAsync(python);
  }

  private registerAllowedDangerousBuiltins(names: string[]) {
    const dangerous = new Set(['eval', 'exec', 'compile']);
    for (const name of names) {
      if (dangerous.has(name) && !this.allowedDangerousBuiltins.includes(name)) {
        this.allowedDangerousBuiltins.push(name);
      }
    }
  }

  private getRuntimePrelude() {
    return `
import ast
import builtins
import difflib
import importlib
import inspect
import sys

__SMOLAGENTS_FILENAME__ = "<smolagents>"

if "__smolagents_user_globals__" not in globals():
    __smolagents_user_globals__ = {}

class FinalAnswerException(BaseException):
    def __init__(self, value):
        self.value = value

def __smolagents_final_answer(value=None, **kwargs):
    if "answer" in kwargs and value is None:
        value = kwargs["answer"]
    raise FinalAnswerException(value)

def __smolagents_set_user_globals(names):
    for name in names:
        if name in globals():
            __smolagents_user_globals__[name] = globals()[name]

def __smolagents_is_import_allowed(module_name, allowed):
    if "*" in allowed:
        return True
    for entry in allowed:
        if entry.endswith(".*"):
            base = entry[:-2]
            if module_name == base or module_name.startswith(base + "."):
                return True
        elif module_name == entry or module_name.startswith(entry + "."):
            return True
    return False

def __smolagents_safe_import_factory(allowed):
    def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
        module_name = name
        if level and globals and "__package__" in globals:
            try:
                module_name = importlib.util.resolve_name(name, globals.get("__package__") or "")
            except Exception:
                module_name = name
        if not __smolagents_is_import_allowed(module_name, allowed):
            raise ImportError(f"Import of '{module_name}' is not authorized")
        module = importlib.import_module(module_name)
        if fromlist:
            for item in fromlist:
                if item == "*":
                    continue
                full = f"{module_name}.{item}"
                if __smolagents_is_import_allowed(full, allowed):
                    try:
                        importlib.import_module(full)
                    except Exception:
                        pass
            return module
        if "." in module_name:
            return importlib.import_module(module_name.split(".")[0])
        return module
    return safe_import

def __smolagents_build_safe_builtins(allowed_imports, allowed_dangerous):
    safe = dict(builtins.__dict__)
    dangerous = {"eval", "exec", "compile", "open", "input"}
    for name in dangerous:
        if name not in allowed_dangerous:
            safe[name] = None
    safe["__import__"] = __smolagents_safe_import_factory(allowed_imports)
    return safe


def __smolagents_config_get(config, key, default=None):
    try:
        return config[key]
    except Exception:
        try:
            return getattr(config, key)
        except Exception:
            return default

def __smolagents_transform_code(code):
    tree = ast.parse(code, filename=__SMOLAGENTS_FILENAME__, mode="exec")
    while_lines = {node.lineno for node in ast.walk(tree) if isinstance(node, ast.While)}
    if tree.body:
        last = tree.body[-1]
        if isinstance(last, ast.Expr):
            tree.body[-1] = ast.Assign(
                targets=[ast.Name(id="__smolagents_last_expr__", ctx=ast.Store())],
                value=last.value,
            )
        elif isinstance(last, ast.Assign) and len(last.targets) == 1 and isinstance(last.targets[0], ast.Name):
            tree.body.append(
                ast.Assign(
                    targets=[ast.Name(id="__smolagents_last_expr__", ctx=ast.Store())],
                    value=ast.Name(id=last.targets[0].id, ctx=ast.Load()),
                )
            )
    ast.fix_missing_locations(tree)
    return tree, while_lines

def __smolagents_check_forbidden_calls(tree, forbidden):
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in forbidden:
                raise RuntimeError(f"Forbidden builtin: {node.func.id}")

def __smolagents_format_syntax_error(error):
    text = error.text or ""
    caret = ""
    if error.offset and text:
        caret = " " * max(0, error.offset - 1) + "^"
    return f"SyntaxError: {error.msg}\\n    {text.rstrip()}\\n    {caret}"

def __smolagents_key_suggestions(error, frame, line):
    try:
        key = error.args[0]
        node = ast.parse(line, mode="exec")
        subscript = None
        for candidate in ast.walk(node):
            if isinstance(candidate, ast.Subscript):
                subscript = candidate
                break
        if not subscript:
            return None
        expr = ast.get_source_segment(line, subscript.value)
        if not expr:
            return None
        base = eval(expr, frame.f_globals, frame.f_locals)
        if not isinstance(base, dict):
            return None
        keys = [str(k) for k in base.keys()]
        matches = difflib.get_close_matches(str(key), keys, n=3, cutoff=0.6)
        if matches:
            return str(matches)
    except Exception:
        return None
    return None

def __smolagents_format_runtime_error(error, code):
    tb = error.__traceback__
    target_frame = None
    lineno = None
    while tb:
        if tb.tb_frame.f_code.co_filename == __SMOLAGENTS_FILENAME__:
            target_frame = tb.tb_frame
            lineno = tb.tb_lineno
        tb = tb.tb_next
    message = f"{type(error).__name__}: {error}"
    if lineno:
        lines = code.splitlines()
        line = lines[lineno - 1] if lineno - 1 < len(lines) else ""
        message += f"\\nCode execution failed at line {lineno}: {line}"
        if isinstance(error, KeyError) and target_frame:
            suggestion = __smolagents_key_suggestions(error, target_frame, line)
            if suggestion:
                message += f"\\nMaybe you meant one of these indexes instead: {suggestion}"
    return message



async def __smolagents_run(code, config):
    allowed_imports = list(__smolagents_config_get(config, "authorized_imports", []) or [])
    allowed_dangerous = list(__smolagents_config_get(config, "allowed_dangerous_builtins", []) or [])
    tool_names = list(__smolagents_config_get(config, "tool_names", []) or [])
    max_operations = __smolagents_config_get(config, "max_operations", None)
    max_while_iterations = __smolagents_config_get(config, "max_while_iterations", None)

    user_globals = __smolagents_user_globals__
    user_globals["__builtins__"] = __smolagents_build_safe_builtins(allowed_imports, allowed_dangerous)
    user_globals["final_answer"] = __smolagents_final_answer
    user_globals["__smolagents_last_expr__"] = None

    try:
        tree, while_lines = __smolagents_transform_code(code)
        forbidden_calls = {"eval", "exec", "compile"} - set(allowed_dangerous)
        if forbidden_calls:
            __smolagents_check_forbidden_calls(tree, forbidden_calls)
        compiled = compile(tree, __SMOLAGENTS_FILENAME__, "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)

        op_count = 0
        while_count = 0

        def trace(frame, event, arg):
            nonlocal op_count, while_count
            if event == "line" and frame.f_code.co_filename == __SMOLAGENTS_FILENAME__:
                op_count += 1
                if max_operations is not None and op_count > max_operations:
                    raise RuntimeError(f"Reached the max number of operations ({max_operations})")
                if max_while_iterations is not None and frame.f_lineno in while_lines:
                    while_count += 1
                    if while_count > max_while_iterations:
                        raise RuntimeError(
                            f"Maximum number of {max_while_iterations} iterations in While loop exceeded"
                        )
            return trace

        previous_trace = sys.gettrace()
        sys.settrace(trace)
        try:
            result = eval(compiled, user_globals)
            if inspect.isawaitable(result):
                await result
        finally:
            sys.settrace(previous_trace)
        last_expr = user_globals.get("__smolagents_last_expr__")
        user_globals["__smolagents_last_expr__"] = last_expr

        return {"is_final_answer": False, "value": last_expr}
    except FinalAnswerException as error:
        return {"is_final_answer": True, "value": error.value}
    except SyntaxError as error:
        raise RuntimeError(__smolagents_format_syntax_error(error))
    except Exception as error:
        raise RuntimeError(__smolagents_format_runtime_error(error, code))
`;
  }
}
