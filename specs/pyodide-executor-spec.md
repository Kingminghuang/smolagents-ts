# System Design Specification: Pyodide Python Executor (`PyodideExecutor`)

本文档定义 `src/utils/python-executor.ts` 的实现级规范。目标是让其他 coding agent 在不读取原实现源码的情况下，按本文档复刻出行为一致的 `PyodideExecutor`。

---

## Table of Contents

1. [Overview and Goals](#1-overview-and-goals)
2. [Architecture and Runtime Model](#2-architecture-and-runtime-model)
3. [Contracts and Data Model](#3-contracts-and-data-model)
4. [Lifecycle and Method Semantics](#4-lifecycle-and-method-semantics)
5. [Python Runtime Prelude Contract](#5-python-runtime-prelude-contract)
6. [Filesystem Mounting Model](#6-filesystem-mounting-model)
7. [Diagnostics and Error Model](#7-diagnostics-and-error-model)
8. [Definition of Done](#8-definition-of-done)
9. [Compatibility Notes](#9-compatibility-notes)
10. [Appendix A: Default Imports](#10-appendix-a-default-imports)
11. [Appendix B: Core Algorithms (Pseudocode)](#11-appendix-b-core-algorithms-pseudocode)
12. [Appendix C: Smoke Tests](#12-appendix-c-smoke-tests)
13. [Appendix D: CodeAgent Python System Prompt](#13-appendix-d-codeagent-python-system-prompt)

---

## 1. Overview and Goals

### 1.1 Scope

`PyodideExecutor` 负责：

- 加载 Pyodide 运行时（浏览器或 Node.js）。
- 注入变量和工具到 Python 全局命名空间。
- 对 Python 代码执行施加导入白名单与内建函数限制。
- 限制执行步数（`max_operations`）和 `while` 迭代数（`max_while_iterations`）。
- 捕获 `stdout/stderr` 日志并返回结构化结果 `{ output, logs, is_final_answer }`。
- 支持 `final_answer(...)` 作为“最终答案中断信号”。
- 在 Node.js/browser 场景挂载文件系统（`nodefs`/`nativefs`）。

### 1.2 Goals

- 与 `CodeAgent` 的调用链兼容：`sendVariables -> sendTools -> run`。
- 在不同环境下行为尽量一致（导入规则、错误格式、日志语义）。
- 可复现当前实现细节，而不是理想化重设计。

### 1.3 Non-Goals

- 不提供进程级安全沙箱。
- 不提供执行超时中断（当前实现没有 `timeoutMs` 机制）。
- 不实现并发安全（同实例并发调用未定义且不保证）。

### 1.4 Fidelity Policy

本文档是“行为对齐规范”：如果与理想设计冲突，以当前实现行为为准（包括已知局限）。

---

## 2. Architecture and Runtime Model

### 2.1 Components

`PyodideExecutor` 由以下层级组成：

1. **Host Loader Layer**  
   负责环境探测与 Pyodide 加载（browser CDN / Node local package / fallback）。
2. **Runtime Prelude Layer**  
   一次性注入 Python prelude（导入管控、AST 处理、trace 限流、错误格式化）。
3. **Bridge Layer**  
   负责 `globals.set` 注入、`stdout/stderr` 捕获、Python->JS 结果转换。
4. **FS Adapter Layer**  
   负责 `NODEFS` 或 `mountNativeFS` 挂载及清理时同步/卸载。

### 2.2 Environment Detection

`init()` 检测顺序必须一致：

1. 若 `window.loadPyodide` 可用：按浏览器模式加载（不传 `indexURL`）。
2. 否则若 `process.versions.node` 存在：按 Node 模式加载。  
   - `require.resolve('pyodide/pyodide.mjs')` 计算 pyodide 目录。  
   - `loadPyodide({ indexURL: <pyodideDir + path.sep> })`。
3. 否则：`loadPyodide()` 默认加载。

### 2.3 Runtime Persistence

- `pyodide` 实例在 executor 生命周期内持久化。
- Python prelude 通过 `runtimeReady` 只注入一次。
- 用户变量/工具保存在 `__smolagents_user_globals__`，跨多次 `run()` 持久存在。

---

## 3. Contracts and Data Model

### 3.1 TypeScript Contracts

```ts
export interface CodeOutput {
  output: unknown;
  logs: string;
  is_final_answer: boolean;
}

export interface FileSystemHandle {
  readonly kind: "file" | "directory";
  readonly name: string;
}

export interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: "directory";
  requestPermission(descriptor?: { mode: "read" | "readwrite" }): Promise<"granted" | "denied">;
}

export interface PyodideExecutorOptions {
  authorized_imports?: string[];
  max_operations?: number;
  max_while_iterations?: number;
  allowed_dangerous_builtins?: string[];
  fsMode?: "nodefs" | "nativefs";
  workDir?: string;
  mountPoint?: string;
  directoryHandle?: FileSystemDirectoryHandle;
}
```

### 3.2 Constructor Signature and Defaults

```ts
constructor(
  authorizedImports: string[] = BASE_BUILTIN_MODULES,
  options: PyodideExecutorOptions = {}
)
```

默认值与优先级：

| Field | Value | Priority |
|---|---|---|
| `authorizedImports` | `options.authorized_imports ?? constructorArg ?? BASE_BUILTIN_MODULES` | options > arg > default |
| `maxOperations` | `options.max_operations ?? 100000` | options > default |
| `maxWhileIterations` | `options.max_while_iterations ?? 10000` | options > default |
| `allowedDangerousBuiltins` | `options.allowed_dangerous_builtins ?? []` | options > default |
| `fsMode` | `options.fsMode ?? "nodefs"` | options > default |
| `workDir` | `options.workDir ?? process.cwd()` | options > default |
| `mountPoint` | `options.mountPoint ?? "/mnt"` | options > default |

强约束：

- 当 `fsMode === "nativefs"` 且 `directoryHandle` 缺失时，构造函数必须立即抛错：  
  `directoryHandle is required when fsMode is "nativefs"`。

### 3.3 Internal State (Behavioral)

实现中存在以下关键内部状态：

- `pyodide: PyodideInterface | null`
- `state: Record<string, unknown>`（最近注入变量的合并快照）
- `toolNames: string[]`
- `runtimeReady: boolean`
- `isMounted: boolean`
- `nativeFsSync?: { syncfs(): Promise<void> }`

---

## 4. Lifecycle and Method Semantics

### 4.1 `init(): Promise<void>`

行为：

1. 若 `this.pyodide` 已存在，直接返回（幂等）。
2. 否则执行环境探测并加载 Pyodide（见 2.2）。
3. Node 模式且 `fsMode === "nodefs"`：尝试挂载 NODEFS（见 Section 6）。
4. 若 `fsMode === "nativefs"` 且有 `directoryHandle`：尝试挂载 NativeFS（见 Section 6）。
5. 挂载失败仅 `console.error`，不抛出；Pyodide 继续可用。

### 4.2 `ensureRuntime(): Promise<void>` (internal)

行为：

1. 调用 `init()`。
2. 若 `runtimeReady === false`，执行 `runPythonAsync(getRuntimePrelude())`。
3. 成功后置 `runtimeReady = true`。

### 4.3 `sendTools(tools, pythonToolsMap?)`

行为顺序必须一致：

1. `ensureRuntime()`。
2. 设置 Python 环境变量：
   `os.environ['PYODIDE_MOUNT_POINT'] = mountPoint`。
3. 若存在 `pythonToolsMap`：逐条 `runPython(code)` 注入。  
   - 任何一条失败：记录 `console.error("Failed to inject Python tool ...")` 后抛出。
4. 将 JS 工具逐条 `pyodide.globals.set(name, tool)`。
5. `toolNames = [...Object.keys(pythonToolsMap ?? {}), ...Object.keys(tools)]`。
6. 调用 `registerAllowedDangerousBuiltins(toolNames)`。  
   - 仅当工具名是 `eval`/`exec`/`compile` 时，自动加入允许列表。
7. `updateUserGlobals(toolNames)`。

### 4.4 `sendVariables(variables)`

行为：

1. `ensureRuntime()`。
2. `state = { ...state, ...variables }`。
3. 对每个键值执行 `pyodide.globals.set(name, value)`。
4. `updateUserGlobals(Object.keys(variables))`。

### 4.5 `run(code): Promise<CodeOutput>`

行为：

1. `ensureRuntime()`。
2. 安装 stdout/stderr 捕获器：  
   - stdout 行写入 `logs += msg + "\n"`  
   - stderr 行写入 `logs += "stderr: " + msg + "\n"`
3. 注入运行参数：
   - `__smolagents_code__ = code`
   - `__smolagents_config__ = { authorized_imports, max_operations, max_while_iterations, allowed_dangerous_builtins, tool_names }`
4. 调用：
   `runPythonAsync('__smolagents_run(__smolagents_code__, __smolagents_config__)')`
5. 结果转换：
   - 先走 `toJs`（`pyodide.toJs` -> `pyodide.ffi.toJs` -> identity）。
   - 期望得到 `{ is_final_answer: boolean, value: string }`。
   - 尝试 `JSON.parse(value)`；失败则保留原值。
6. 返回：
   `{ output: parsedOrRawValue, logs, is_final_answer: Boolean(...) }`
7. 任意异常统一包装为：
   `throw new AgentExecutionError("Error executing code: ...\nLogs:\n...")`

### 4.6 `cleanup(): Promise<void>`

行为：

1. 若 `pyodide` 为空，直接返回。
2. 若 `fsMode === "nativefs"` 且存在 `nativeFsSync`，先 `await syncfs()`。
3. 若 `isMounted`，执行 `FS.unmount(mountPoint)`，并置 `isMounted=false`。
4. `pyodide = null`，`runtimeReady = false`。
5. 清理过程中发生异常：`console.error` 后重新抛出。

### 4.7 Ordering Guarantees and Caveats

- `sendTools/sendVariables/run` 都会隐式触发 `init + prelude`（通过 `ensureRuntime`）。
- `cleanup` 不重置 `state/toolNames/allowedDangerousBuiltins`；重建实例才是完整“冷启动”。
- 并发 `run()`、并发 `sendTools()` 不在保证范围内。

---

## 5. Python Runtime Prelude Contract

### 5.1 Exported Prelude Symbols

prelude 至少定义以下符号（名字必须一致）：

- `FinalAnswerException(BaseException)`
- `__smolagents_final_answer(value=None, **kwargs)`
- `__smolagents_set_user_globals(names)`
- `__smolagents_is_import_allowed(module_name, allowed)`
- `__smolagents_safe_import_factory(allowed)`
- `__smolagents_build_safe_builtins(allowed_imports, allowed_dangerous)`
- `__smolagents_transform_code(code)`
- `__smolagents_check_forbidden_calls(tree, forbidden)`
- `__smolagents_format_syntax_error(error)`
- `__smolagents_format_runtime_error(error, code)`
- `__smolagents_run(code, config)` (async)

### 5.2 Final Answer Semantics

- `final_answer` 注入到用户 globals，映射到 `__smolagents_final_answer`。
- `final_answer(value)` 或 `final_answer(answer=value)` 都应触发最终答案。
- 通过抛 `FinalAnswerException` 实现中断，不继续执行后续代码。

### 5.3 Import Authorization Semantics

授权判定规则（必须一致）：

1. 若白名单含 `*`，全部允许。
2. 对条目 `pkg.*`：允许 `pkg` 及其子模块。
3. 对条目 `pkg`：允许 `pkg` 及 `pkg.<submodule>`。
4. 不满足上述则抛 `ImportError("Import of '<module>' is not authorized")`。

相对导入：

- 当 `level > 0` 且有 `__package__` 时，尝试 `importlib.util.resolve_name` 解析后再判定。

### 5.4 Safe Builtins Policy

默认危险内建：

- `eval`, `exec`, `compile`, `open`, `input`

处理策略：

- 若不在 `allowed_dangerous_builtins` 中，对应 builtin 置为 `None`。
- `__import__` 被替换为受控 `safe_import`。

### 5.5 AST Transform and Last Expression Rules

`__smolagents_transform_code(code)` 行为：

1. `ast.parse(..., mode="exec")`。
2. 收集所有 `ast.While` 的 `lineno` 到 `while_lines`。
3. 若最后一条语句是表达式 `Expr`：替换为  
   `__smolagents_last_expr__ = <expr>`。
4. 若最后一条语句是简单赋值（单目标 `Name`）：在末尾追加  
   `__smolagents_last_expr__ = <that_name>`。

### 5.6 Execution Guarding (`sys.settrace`)

在 `__smolagents_run` 中安装 trace：

- 仅统计 `co_filename == "<smolagents>"` 的 `line` 事件。
- `op_count` 超过 `max_operations` 抛：
  `RuntimeError("Reached the max number of operations (<N>)")`
- 当前行号在 `while_lines` 时递增 `while_count`，超过 `max_while_iterations` 抛：
  `RuntimeError("Maximum number of <N> iterations in While loop exceeded")`

### 5.7 Forbidden Call Static Check

- 在 AST 层扫描 `ast.Call` 且 `func` 为 `ast.Name`。
- 若名称在 `{"eval","exec","compile"} - allowed_dangerous`，抛：
  `RuntimeError("Forbidden builtin: <name>")`
- 该检查不覆盖属性调用（如 `obj.eval(...)`）。

### 5.8 Error Formatting Behavior

- `SyntaxError`：格式化为多行字符串，带 caret 指向列。
- 其他异常：输出
  `"<Type>: <message>\nCode execution failed at line <lineno>: <line_text>"`
- 对 `KeyError`，尝试基于当前行 subscript 表达式提供近似 key 建议（`difflib.get_close_matches`）。

---

## 6. Filesystem Mounting Model

### 6.1 `nodefs` (Node.js)

在 Node 环境且 `fsMode==="nodefs"` 时：

1. `FS.mkdirTree(mountPoint)`
2. `FS.mount(FS.filesystems.NODEFS, { root: workDir }, mountPoint)`
3. 成功后 `isMounted = true`

失败处理：

- 记录 `console.error("Failed to mount NODEFS:", error)`，继续运行（不抛错）。

### 6.2 `nativefs` (Browser)

在 `fsMode==="nativefs"` 且有 `directoryHandle` 时：

1. 请求权限：`requestPermission({ mode: "readwrite" })`
2. 非 `granted` -> 抛错 `readwrite permission not granted for directory`
3. `nativeFsSync = await pyodide.mountNativeFS(mountPoint, directoryHandle)`
4. `isMounted = true`

失败处理：

- 记录 `console.error("Failed to mount NativeFS:", error)`，继续运行（不抛错）。

### 6.3 Python Tool Mount Point Contract

`sendTools` 中会设置：

```python
os.environ["PYODIDE_MOUNT_POINT"] = "<mountPoint>"
```

Python 工具（如 `src/tools/python-tools.ts`）通过该环境变量解析相对路径根目录。

### 6.4 Cleanup Persistence

- `nativefs`：`cleanup()` 时必须先 `syncfs()` 再 `unmount`，保证写回宿主目录。
- `nodefs`：`unmount` 即可，数据已直写 Node 文件系统。

---

## 7. Diagnostics and Error Model

### 7.1 Thrown Error Types

当前实现无错误码体系，采用异常类型+消息文本：

- 业务执行失败：`AgentExecutionError`
- 其他阶段（例如构造、注入工具）可能直接抛 `Error`

### 7.2 Canonical Message Patterns

| Scenario | Message Pattern |
|---|---|
| NativeFS 缺少目录句柄 | `directoryHandle is required when fsMode is "nativefs"` |
| 非授权导入 | `Import of '<module>' is not authorized` |
| 禁用 builtin 被调用 | `Forbidden builtin: <name>` |
| 操作步数超限 | `Reached the max number of operations (<N>)` |
| while 次数超限 | `Maximum number of <N> iterations in While loop exceeded` |
| 统一执行包装 | `Error executing code: <cause>\nLogs:\n<captured logs>` |

### 7.3 Logging Semantics

- stdout 按行拼接进入 `logs`。
- stderr 行统一前缀 `stderr: `。
- `run()` 只返回当前调用产生的日志，不跨调用累积。

---

## 8. Definition of Done

实现通过以下条目才算与当前 `PyodideExecutor` 行为等价：

### 8.1 API and Defaults

- [ ] 构造签名与选项字段与 Section 3 一致。
- [ ] 默认值与优先级一致（尤其 `authorized_imports`、`max_operations`）。
- [ ] `nativefs` 缺少 `directoryHandle` 在构造期直接失败。

### 8.2 Runtime Bootstrapping

- [ ] 按 Section 2.2 的顺序探测环境并加载 Pyodide。
- [ ] prelude 只注入一次（`runtimeReady` 门控）。

### 8.3 Security and Guards

- [ ] 受控 `__import__` 与白名单规则一致（支持 `*`、`pkg.*`）。
- [ ] 默认禁用 `eval/exec/compile/open/input`。
- [ ] AST 禁止调用与 trace 限流一致生效。

### 8.4 Execution Contract

- [ ] `final_answer(...)` 和 `final_answer(answer=...)` 都返回 `is_final_answer=true`。
- [ ] 最后表达式捕获规则一致（Expr 替换 / 简单赋值追加）。
- [ ] 返回值经 `json.dumps(..., default=str)` 后在 JS 侧尝试 `JSON.parse`。
- [ ] 失败路径统一抛 `AgentExecutionError` 且包含日志。

### 8.5 Filesystem

- [ ] Node.js `nodefs` 挂载到 `mountPoint`，失败只记录不抛。
- [ ] Browser `nativefs` 权限申请+挂载，失败只记录不抛。
- [ ] `cleanup()` 包含 `nativefs` sync + unmount。

---

## 9. Compatibility Notes

### 9.1 Coupling with `CodeAgent`

`CodeAgent` 每步执行采用：

1. `sendVariables(Object.fromEntries(state))`
2. `sendTools({}, pythonToolsMap)`
3. `run(code)`

因此复刻实现必须保证这三步顺序可重复且幂等，不应要求额外外部初始化顺序。

### 9.2 Behavior Gaps (Known and Intentional for Fidelity)

- 无超时中断机制。
- 并发不安全。
- `cleanup()` 后不重置所有内存字段（如 `state`）。
- 挂载失败容忍策略会把“文件能力失效”延迟到工具调用时暴露。

---

## 10. Appendix A: Default Imports

`BASE_BUILTIN_MODULES` 默认值：

```text
collections, datetime, itertools, json, math, queue, random, re,
stat, statistics, time, unicodedata
```

---

## 11. Appendix B: Core Algorithms (Pseudocode)

### B.1 `run(code)` (Host Side)

```text
ensureRuntime()
logs = ""
setStdout(log += msg + "\n")
setStderr(log += "stderr: " + msg + "\n")

globals["__smolagents_code__"] = code
globals["__smolagents_config__"] = {
  authorized_imports, max_operations, max_while_iterations,
  allowed_dangerous_builtins, tool_names
}

result = await runPythonAsync("__smolagents_run(...)")
jsResult = toJs(result)
try jsResult.value = JSON.parse(jsResult.value) catch ignore
return { output: jsResult.value, logs, is_final_answer: Boolean(jsResult.is_final_answer) }
```

### B.2 `__smolagents_run(code, config)` (Python Side)

```text
allowed_imports, allowed_dangerous, tool_names, max_operations, max_while_iterations <- config
user_globals <- __smolagents_user_globals__
user_globals["__builtins__"] <- safe_builtins(allowed_imports, allowed_dangerous)
user_globals["final_answer"] <- __smolagents_final_answer
user_globals["__smolagents_last_expr__"] <- None

tree, while_lines <- transform_code(code)
check_forbidden_calls(tree, {"eval","exec","compile"} - allowed_dangerous)
compiled <- compile(tree, "<smolagents>", "exec", PyCF_ALLOW_TOP_LEVEL_AWAIT)

install sys.settrace(trace_guard(op_limit, while_limit, while_lines))
result <- eval(compiled, user_globals)
if isawaitable(result): await result
restore previous trace

return {"is_final_answer": False, "value": json.dumps(last_expr, default=str)}
except FinalAnswerException as e:
  return {"is_final_answer": True, "value": json.dumps(e.value, default=str)}
except SyntaxError as e:
  raise RuntimeError(format_syntax_error(e))
except Exception as e:
  raise RuntimeError(format_runtime_error(e, code))
```

---

## 12. Appendix C: Smoke Tests

```ts
import { strict as assert } from "node:assert";
import { PyodideExecutor } from "../src/utils/python-executor.js";

const executor = new PyodideExecutor(undefined, {
  fsMode: "nodefs",
  workDir: process.cwd(),
  mountPoint: "/mnt",
});

await executor.sendVariables({ x: 41 });
await executor.sendTools({}, {
  add_one: `
def add_one(n):
    return n + 1
`,
});

// Case 1: normal output
{
  const r = await executor.run("y = add_one(x)\ny");
  assert.equal(r.is_final_answer, false);
  assert.equal(r.output, 42);
}

// Case 2: final answer
{
  const r = await executor.run(`final_answer({"ok": True, "n": 7})`);
  assert.equal(r.is_final_answer, true);
  assert.deepEqual(r.output, { ok: true, n: 7 });
}

// Case 3: unauthorized import
{
  const ex = new PyodideExecutor(["math"], {});
  let got = "";
  try {
    await ex.run("import os");
  } catch (e: any) {
    got = String(e.message || e);
  }
  assert.match(got, /Import of 'os' is not authorized/);
  await ex.cleanup();
}

await executor.cleanup();
```

---

## 13. Appendix D: CodeAgent Python System Prompt

本附录补充 `CodeAgent` 在 `template-loader.ts` 中与 `PyodideExecutor` 绑定使用的 Python system prompt 契约。目标是让复刻实现不仅执行器行为一致，还能得到与原实现一致的代码生成风格。

### 13.1 Source of Truth

规范来源：`src/prompts/template-loader.ts` 的 `CODE_AGENT_TEMPLATE.system_prompt`。

实现要求：

- 复刻版 prompt 至少满足本节的“硬约束语义”。
- 占位符名称必须兼容：  
  `{{code_block_opening_tag}}`、`{{code_block_closing_tag}}`、`{{{tools_prompt}}}`、`{{authorized_imports}}`、`{{#if has_managed_agents}}...{{/if}}`、`{{custom_instructions}}`。

### 13.2 Hard Constraints (Must Preserve)

1. 代理工作循环必须是：`Thought -> Code -> Observation -> ...`。
2. `Code` 必须是 Python，且必须包在 `{{code_block_opening_tag}} ... {{code_block_closing_tag}}` 中。
3. 工具调用必须按 Python 函数调用风格，不能把参数当作单一 dict 误传（除非工具签名本来就是 dict）。
4. 工具默认被视为同步函数：**不要**在工具调用前使用 `await`。
5. 中间结果通过 `print(...)` 输出，供下一轮 Observation 使用。
6. 最终答案必须通过 `final_answer(...)` 返回。
7. 只能导入 `{{authorized_imports}}` 列表中的模块。
8. 运行状态跨 step 持久化（变量与 import 会保留）。
9. 不允许把变量命名为工具名，尤其不能覆盖 `final_answer`。

### 13.3 Canonical Prompt Skeleton (Normative)

以下骨架需在语义上保持一致（文案可微调，但规则不可弱化）：

```text
You are an expert assistant who can solve any task using code blobs.
You have access to tools that behave like regular Python functions.
Solve tasks step by step with a cycle of Thought, Code, Observation.

At each step:
- First write Thought explaining your reasoning.
- Then write Python code between:
  {{code_block_opening_tag}}
  ...
  {{code_block_closing_tag}}
- Use print() for intermediate outputs.
- Do not use await with tool calls (tools are synchronous).

To finish, you must call final_answer(...).

Available tools:
{{code_block_opening_tag}}
{{{tools_prompt}}}
{{code_block_closing_tag}}

Rules:
1. Always provide Thought and a valid code block.
2. Use only variables that exist.
3. Use correct tool arguments directly.
4. If tool output shape is uncertain, avoid long dependent chains in one block; print first, continue next step.
5. Do not repeat identical tool calls unless needed.
6. Do not create variables named like tools (especially final_answer).
7. Only import from: {{authorized_imports}}.
8. State persists across code executions.
9. Do not give up before calling final_answer.

{{#if custom_instructions}}
{{custom_instructions}}
{{/if}}

Now Begin!
```

### 13.4 Canonical Example Style (Python)

复刻 prompt 至少应保留与下列示例等价的 few-shot 风格。

示例 A：文档问答 + 图像生成

```text
Task: "Generate an image of the oldest person in this document."

Thought: I will find the oldest person, then generate an image.
{{code_block_opening_tag}}
answer = document_qa(document=document, question="Who is the oldest person mentioned?")
print(answer)
{{code_block_closing_tag}}
Observation: "The oldest person ... John Doe ..."

Thought: I will generate the image now.
{{code_block_opening_tag}}
image = image_generator("A portrait of John Doe, a 55-year-old man living in Canada.")
final_answer(image)
{{code_block_closing_tag}}
```

示例 B：直接计算

```text
Task: "What is the result of 5 + 3 + 1294.678?"

Thought: I will compute the value in Python and return it.
{{code_block_opening_tag}}
result = 5 + 3 + 1294.678
final_answer(result)
{{code_block_closing_tag}}
```

示例 C：先翻译再图像问答

```text
Task: "Answer the question in `question` about image `image`. The question is in French."

Thought: I will translate to English, then call image_qa.
{{code_block_opening_tag}}
translated_question = translator(question=question, src_lang="French", tgt_lang="English")
print(f"The translated question is {translated_question}.")
answer = image_qa(image=image, question=translated_question)
final_answer(f"The answer is {answer}")
{{code_block_closing_tag}}
```

示例 D：网页检索后比较

```text
Task: "Which city has the highest population: Guangzhou or Shanghai?"

Thought: I need the population of both cities.
{{code_block_opening_tag}}
for city in ["Guangzhou", "Shanghai"]:
    print(f"Population {city}:", web_search(f"{city} population"))
{{code_block_closing_tag}}
Observation: "... Shanghai is larger ..."

Thought: I now know the answer.
{{code_block_opening_tag}}
final_answer("Shanghai")
{{code_block_closing_tag}}
```

### 13.5 Managed Agents Block (Conditional)

当 `has_managed_agents=true` 时，prompt 必须注入团队成员说明块。语义要点：

1. 调用方式类似工具：传 `task`，可带 `additional_args`。
2. `task` 需要详细、可执行。
3. 列表内容来自 `{{{managed_agents_prompt}}}`，并以代码块包裹。

### 13.6 Implementation Notes for Template Parity

如需与当前仓库 `template-loader.ts` 完全对齐，建议最小校验：

1. prompt 中明确声明 “tools are basically Python functions”。
2. prompt 中明确声明 “All tools are synchronous; do not use await with tool calls.”。
3. 包含 `final_answer` 强制收尾规则。
4. 包含 `authorized_imports` 限制文本。
5. 包含至少 3 个 few-shot 示例，且全部为 Python 语法。
