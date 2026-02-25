# System Design Specification: SES JavaScript Executor (`SESExecutor`)

`SESExecutor` 是 `smolagents-ts` 的原生 JavaScript 执行器规范。它基于 Endo SES（Secure ECMAScript）在同一 JS 运行时内提供隔离执行、工具桥接、日志采集、超时与死循环防护。

---

## Table of Contents

1. [Overview and Goals](#1-overview-and-goals)
2. [Architecture and Runtime Model](#2-architecture-and-runtime-model)
3. [Contracts and Data Model](#3-contracts-and-data-model)
4. [Lifecycle and State Machine](#4-lifecycle-and-state-machine)
5. [Security and Isolation Model](#5-security-and-isolation-model)
6. [Validation and AST Instrumentation](#6-validation-and-ast-instrumentation)
7. [Execution Semantics](#7-execution-semantics)
8. [Diagnostics and Error Model](#8-diagnostics-and-error-model)
9. [Definition of Done](#9-definition-of-done)
10. [Extensibility and Compatibility](#10-extensibility-and-compatibility)
11. [Appendix A: Default Lockdown Policy](#11-appendix-a-default-lockdown-policy)
12. [Appendix B: Built-In Validation Rules](#12-appendix-b-built-in-validation-rules)
13. [Appendix C: Smoke Test Baseline](#13-appendix-c-smoke-test-baseline)
14. [Appendix D: JavaScript CodeAgent System Prompt](#14-appendix-d-javascript-codeagent-system-prompt)

---

## 1. Overview and Goals

### 1.1 Problem Statement

`CodeAgent` 生成的 JS 代码需要在宿主内安全执行，并与宿主工具（文件、网络、业务函数）进行同步/异步互操作。纯字符串 `eval` 无法满足以下要求：

- 隔离性：禁止访问 `globalThis` 的危险能力（如 `process`、`require`、DOM、Node 内置资源）。
- 可控性：限制无限循环、长时间阻塞、恶意导入。
- 可运维性：可观察（logs）、可诊断（结构化错误）、可恢复（污染后重建）。

### 1.2 Goals

- 通过 `lockdown()` + `Compartment` 实现执行隔离。
- 提供与 `PyodideExecutor` 对齐的执行器接口（`init/sendVariables/sendTools/run/cleanup`）。
- 使用 AST 注入进行操作步数防护（`maxOperations`）。
- 支持 `final_answer(...)` 作为 Agent 终态中断语义。
- 提供统一错误码、诊断模型和可测试验收标准。

### 1.3 Non-Goals

- 不提供进程级硬隔离（SES 不是 OS sandbox）。
- 不承诺抢占式中断同步死循环（依赖 AST guard 防护）。
- 不实现通用模块解析器；仅支持白名单导入策略。

### 1.4 Normative Keywords

本文中的 `MUST`、`SHOULD`、`MAY` 使用 RFC 2119 语义：

- `MUST`：实现必需。
- `SHOULD`：强烈建议，偏离需有明确理由。
- `MAY`：可选能力。

---

## 2. Architecture and Runtime Model

### 2.1 Core Components

`SESExecutor` 由四层构成：

1. **Host Bootstrap Layer**  
   负责 `lockdown()` 的一次性初始化与全局策略配置。
2. **Validation/Transform Layer**  
   对输入代码进行静态检查与 AST 注入（loop guard、可选导入校验）。
3. **SES Compartment Layer**  
   每个执行器实例持有独立 `Compartment`，注入 endowments（变量、工具、`final_answer`）。
4. **Runtime Bridge Layer**  
   负责日志采集、错误归一化、超时包裹、执行结果封装。

### 2.2 Run Lifecycle

单次 `run(code)` 生命周期必须遵循：

```
VALIDATE -> TRANSFORM -> EVALUATE -> NORMALIZE_OUTPUT -> RETURN
```

- `VALIDATE`: 静态规则校验，失败即阻断执行。
- `TRANSFORM`: 注入计步守卫与必要运行时辅助。
- `EVALUATE`: 在 `Compartment` 内执行并等待 Promise 完成或超时。
- `NORMALIZE_OUTPUT`: 转为 `CodeOutput` 或结构化错误。

### 2.3 Concurrency Model

- 单个 `SESExecutor` 实例是**串行执行模型**：同一实例同一时间最多一个 `run()` 在执行。
- 默认并发策略（`runConcurrency="reject"`）：并发调用 `run()` `MUST` 抛出 `ERR_INVALID_STATE`。
- 若显式配置 `runConcurrency="queue"`：并发调用 `run()` `MUST` 进入 FIFO 队列，且队列容量受 `maxQueuedRuns` 限制；超限 `MUST` 抛出 `ERR_INVALID_STATE`。

---

## 3. Contracts and Data Model

### 3.1 TypeScript Contracts

```ts
export type ExecutorState = "NEW" | "INITIALIZING" | "READY" | "RUNNING" | "DIRTY" | "DEAD";

export interface ExecutorOptions {
  maxOperations?: number;            // default: 50000, min: 1
  timeoutMs?: number;                // default: 10000, min: 1
  runConcurrency?: "reject" | "queue"; // default: "reject"
  maxQueuedRuns?: number;            // default: 0, min: 0 (only used when runConcurrency="queue")
  authorizedImports?: string[];      // default: []
  maxLogBytes?: number;              // default: 262144 (256 KiB), min: 1024
  collectConsoleLevels?: Array<"log" | "info" | "warn" | "error">; // default: all 4
}

export interface LogEntry {
  level: "log" | "info" | "warn" | "error";
  message: string;
  ts: string; // ISO-8601
}

export interface CodeOutput {
  output: unknown;
  logs: string;                      // newline-joined formatted logs
  is_final_answer: boolean;
}

export interface ExecutorError extends Error {
  code: ExecutorErrorCode;
  severity: "FATAL" | "ERROR" | "WARN";
  retryable: boolean;
  details?: Record<string, unknown>;
  logs?: string;
}

export type ExecutorErrorCode =
  | "ERR_INVALID_STATE"
  | "ERR_SES_INIT_FAILED"
  | "ERR_VALIDATION_FAILED"
  | "ERR_IMPORT_NOT_ALLOWED"
  | "ERR_MAX_OPS_EXCEEDED"
  | "ERR_EXEC_TIMEOUT"
  | "ERR_RUNTIME_EXCEPTION"
  | "ERR_TOOL_PROXY_FAIL"
  | "ERR_CLEANUP_FAILED";

export interface Diagnostic {
  rule: string;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
  location?: { line: number; column: number };
  fix?: string;
}

export interface PreparedProgram {
  originalCode: string;
  transformedCode: string;
  diagnostics: Diagnostic[];
}
```

### 3.2 API Contract

```ts
export interface ICodeExecutor {
  init(): Promise<void>;
  sendVariables(variables: Record<string, unknown>): Promise<void>;
  sendTools(tools: Record<string, (...args: unknown[]) => unknown>): Promise<void>;
  run(code: string): Promise<CodeOutput>;
  cleanup(): Promise<void>;
}
```

### 3.3 Defaults and Invariants

| Field | Default | Invariant |
|---|---:|---|
| `maxOperations` | `50000` | `>= 1` |
| `timeoutMs` | `10000` | `>= 1` |
| `runConcurrency` | `"reject"` | `"reject"` 或 `"queue"` |
| `maxQueuedRuns` | `0` | `>= 0`；仅 `runConcurrency="queue"` 时生效 |
| `authorizedImports` | `[]` | 所有导入名必须是非空字符串 |
| `maxLogBytes` | `262144` | `>= 1024` |
| `is_final_answer` | `false` | 仅当捕获 `FinalAnswerSignal` 时为 `true` |

---

## 4. Lifecycle and State Machine

### 4.1 State Definitions

- `NEW`: 刚创建，未初始化。
- `INITIALIZING`: 正在 `init()`，仅作为内部过渡态。
- `READY`: 可执行 `run()`。
- `RUNNING`: 正在执行。
- `DIRTY`: 运行时污染或超时，必须重建。
- `DEAD`: 已清理；除 `init()/cleanup()` 以外的方法不可用。可通过 `init()` 重建到 `READY`。

### 4.2 Allowed Transitions

| From | Event | To | Requirement |
|---|---|---|---|
| `NEW` | `init()` begin | `INITIALIZING` | 进入初始化流程 |
| `DEAD` | `init()` begin | `INITIALIZING` | 允许重建实例 |
| `INITIALIZING` | success | `READY` | 创建 Compartment |
| `INITIALIZING` | fail | `DEAD` | 抛 `ERR_SES_INIT_FAILED` |
| `READY` | `init()` | `READY` | no-op（幂等） |
| `READY` | `run()` start | `RUNNING` | 单实例互斥 |
| `RUNNING` | `run()` success/fail (recoverable) | `READY` | 输出或抛错返回 |
| `RUNNING` | timeout / corruption | `DIRTY` | 需要 `cleanup()+init()` |
| `DIRTY` | `cleanup()` success | `DEAD` | 释放引用 |
| `READY` | `cleanup()` success | `DEAD` | 正常关闭 |
| `DEAD` | `cleanup()` | `DEAD` | no-op（幂等） |

### 4.3 Method Preconditions and Postconditions

1. `init()`  
   - Preconditions: state in `{NEW, DEAD, READY}`。  
   - Postconditions: state=`READY`，Compartment 就绪。  
   - Idempotency: 对 `READY` 再次调用 `MUST` 为 no-op。

2. `sendVariables(vars)`  
   - Preconditions: state=`READY`。  
   - Postconditions: 变量注入到 Compartment endowments 命名空间。  
   - Behavior: 同名键覆盖旧值。

3. `sendTools(tools)`  
   - Preconditions: state=`READY`。  
   - Postconditions: 工具函数可在沙箱中直接调用（支持 Promise）。

4. `run(code)`  
   - Preconditions:  
     - `runConcurrency="reject"` 时：state=`READY` 且 `code` 非空字符串。  
     - `runConcurrency="queue"` 时：state in `{READY, RUNNING}` 且 `code` 非空字符串。  
   - Behavior: `queue` 模式下若 state=`RUNNING`，本次调用进入队列等待执行。  
   - Postconditions: state 回到 `READY` 或进入 `DIRTY`（超时/污染）。

5. `cleanup()`  
   - Preconditions: state in `{READY, DIRTY, DEAD}`。  
   - Postconditions: state=`DEAD`。  
   - Idempotency: 对 `DEAD` 再次调用 `MUST` 为 no-op。

---

## 5. Security and Isolation Model

### 5.1 Global Lockdown

- `lockdown()` `MUST` 在进程生命周期内只执行一次。
- 实现 `MUST` 具备并发安全的“一次初始化”机制（例如 `once` 或全局 promise 锁）。
- `lockdown()` 失败 `MUST` 终止初始化并抛 `ERR_SES_INIT_FAILED`。

### 5.2 Compartment Endowments

- 只注入显式传入能力（variables/tools/final_answer/console wrapper）。
- 不得注入 `process`、`require`、`module`、`global`、`fetch`（除非业务显式允许）。
- 注入对象 `SHOULD` 通过 `harden()` 或等效只读包装降低被篡改风险。
- `setTimeout/clearTimeout` 默认不作为全局能力注入；需要等待语义时，`SHOULD` 通过显式工具函数暴露（例如 `sleepTool`）。

### 5.3 Import Policy

- 默认禁止所有 import（`authorizedImports=[]`）。
- 运行基线是 **script 模式**（Section 7.2 的 async-wrapper 执行模型）。
- 若启用白名单：导入名 `MUST` 完全匹配 `authorizedImports`。
- 对静态 import 与动态 `import(...)` 都 `MUST` 做 AST 校验：
  - 静态 `import ... from`：在 script 基线下 `MUST` 直接拒绝（`ERR_IMPORT_NOT_ALLOWED`）。
  - 动态 `import(...)`：仅白名单模块可通过。
- 违反白名单 `MUST` 抛 `ERR_IMPORT_NOT_ALLOWED`。

### 5.4 Final Answer Capability

执行器向沙箱注入：

```ts
function final_answer(value: unknown): never;
```

其行为是抛出内部信号 `FinalAnswerSignal`，由执行器捕获并转换为：

- `CodeOutput.is_final_answer = true`
- `CodeOutput.output = value`

### 5.5 Threat Model Boundary

- 本规范防护“同进程 JS 代码越权和 DoS 常见路径”。
- 对 CPU 饥饿型死循环，依赖 AST guard；对 I/O 挂起，依赖 `timeoutMs`。
- 不覆盖内核级/容器级隔离需求；高风险场景应使用独立进程沙箱。

---

## 6. Validation and AST Instrumentation

### 6.1 Validation API

```ts
function validateCode(code: string, options: ExecutorOptions): Diagnostic[];
function prepareProgram(code: string, options: ExecutorOptions): PreparedProgram;
```

规则：存在 `ERROR` 级诊断时，`run()` `MUST` 抛 `ERR_VALIDATION_FAILED` 且不执行用户代码。

### 6.2 Minimum Built-In Validation Rules

| Rule ID | Severity | Description |
|---|---|---|
| `code_non_empty` | ERROR | 代码为空或仅空白字符 |
| `syntax_valid` | ERROR | 解析失败 |
| `max_operations_valid` | ERROR | `maxOperations` 非法 |
| `timeout_valid` | ERROR | `timeoutMs` 非法 |
| `import_allowed` | ERROR | import 不在白名单 |
| `static_import_in_script_mode` | ERROR | script 执行模型下出现静态 import |
| `forbidden_global_access` | WARNING | 命中明显高危标识符（如 `process`） |

### 6.3 Loop Guard Injection Algorithm

```text
FUNCTION injectLoopGuards(ast, maxOps):
    insert at program top:
        let __smol_op_counter = 0;
        const __smol_max_ops = <maxOps>;
        class MaxOperationsExceededError extends Error {
            constructor(limit) {
                super(`Max operations exceeded (${limit})`);
                this.name = "MaxOperationsExceededError";
                this.code = "ERR_MAX_OPS_EXCEEDED";
            }
        }
        function __smol_guard() {
            __smol_op_counter++;
            if (__smol_op_counter > __smol_max_ops) {
                throw new MaxOperationsExceededError(__smol_max_ops);
            }
        }

    FOR EACH node IN ast:
        IF node.type IN {ForStatement, ForInStatement, ForOfStatement, WhileStatement, DoWhileStatement}:
            ensure node.body is BlockStatement
            prepend "__smol_guard();" to loop body

    RETURN transformedAst
```

### 6.4 Transformation Invariants

- 注入后代码语义应保持等价，除 guard 带来的副作用外。
- 注入逻辑不得改变用户变量名解析（内部标识符统一 `__smol_*` 前缀）。
- transform 失败 `MUST` 抛 `ERR_VALIDATION_FAILED`。

---

## 7. Execution Semantics

### 7.1 Internal Runtime Signals

```ts
class FinalAnswerSignal extends Error {
  readonly name = "FinalAnswerSignal";
  constructor(public value: unknown) { super("final_answer"); }
}

class MaxOperationsExceededError extends Error {
  readonly name = "MaxOperationsExceededError";
  readonly code = "ERR_MAX_OPS_EXCEEDED";
  constructor(public limit: number) {
    super(`Max operations exceeded (${limit})`);
  }
}
```

### 7.2 Deterministic Run Algorithm

```text
ASYNC FUNCTION run(code):
    if state != READY:
        if options.runConcurrency == "queue" AND state == RUNNING:
            if queue.length >= options.maxQueuedRuns:
                throw ERR_INVALID_STATE
            enqueue current run and await queued result
            return queued result
        throw ERR_INVALID_STATE
    state = RUNNING

    prepared = prepareProgram(code, options)
    if prepared has ERROR diagnostics:
        state = READY
        throw ERR_VALIDATION_FAILED with diagnostics

    reset in-memory log buffer

    wrappedCode = """
    (async () => {
      try {
        const __smol_user_fn = async () => {
          <prepared.transformedCode>
        };
        const value = await __smol_user_fn();
        return { kind: "VALUE", value };
      } catch (e) {
        if (e instanceof FinalAnswerSignal) {
          return { kind: "FINAL", value: e.value };
        }
        throw e;
      }
    })()
    """

    try:
        result = await Promise.race([
            compartment.evaluate(wrappedCode),
            timeoutPromise(options.timeoutMs)
        ])
    catch timeout:
        state = DIRTY
        throw ERR_EXEC_TIMEOUT with logs
    catch err:
        state = READY
        if err is MaxOperationsExceededError OR err.code == "ERR_MAX_OPS_EXCEEDED":
            throw ERR_MAX_OPS_EXCEEDED with logs
        if err tagged as tool invocation failure:
            throw ERR_TOOL_PROXY_FAIL with logs
        throw ERR_RUNTIME_EXCEPTION with logs

    state = READY
    if result.kind == "FINAL":
        return CodeOutput(output=result.value, logs=joinLogs(), is_final_answer=true)
    return CodeOutput(output=result.value, logs=joinLogs(), is_final_answer=false)
```

### 7.3 Console Capture Contract

- 执行器 `MUST` 提供 `console.log/info/warn/error` 包装器并记录日志。
- `logs` 字段是按时间顺序拼接的文本（`\n` 分隔）。
- 若累计日志超过 `maxLogBytes`，后续日志 `MUST` 截断并追加 `"...[TRUNCATED]"`。

### 7.4 Tool Invocation Contract

- 执行器 `MUST` 在工具桥接层包装每次工具调用，并标记调用边界（例如 `withToolBoundary(toolName, fn)`）。
- 满足以下条件时 `MUST` 映射为 `ERR_TOOL_PROXY_FAIL`：
  - 错误直接来源于工具函数本身（同步抛错或 Promise reject）。
  - 参数序列化/反序列化、桥接调用协议失败。
- 以下情况 `MUST` 映射为 `ERR_RUNTIME_EXCEPTION`：
  - 非工具上下文抛错（用户代码逻辑异常、引用错误等）。
  - 工具调用成功返回后，用户代码后续处理阶段抛错。
- Promise 工具必须被 `await` 支持，不应强制 callback 风格。

### 7.5 Timeout Semantics

- `timeoutMs` 仅保证对可等待异步路径生效（`Promise.race`）。
- 对纯 CPU 忙循环，主要依赖 `maxOperations` guard，而非宿主抢占中断。
- 超时后状态进入 `DIRTY`，调用方必须执行 `cleanup()` 并重建实例。

### 7.6 DIRTY State Criteria

以下事件触发后实例 `MUST` 进入 `DIRTY`：

- `ERR_EXEC_TIMEOUT`（无法确认沙箱任务是否仍占用资源）。
- 宿主检测到 Compartment 级关键运行时损坏（例如 console bridge、tool bridge 内部不可恢复异常）。

以下事件不应进入 `DIRTY`（保持 `READY`）：

- 普通用户代码异常（`ERR_RUNTIME_EXCEPTION`）。
- 工具调用失败（`ERR_TOOL_PROXY_FAIL`）。
- 校验失败（`ERR_VALIDATION_FAILED`、`ERR_IMPORT_NOT_ALLOWED`）。

---

## 8. Diagnostics and Error Model

### 8.1 Normalized Error Payload

```ts
interface NormalizedExecutorError {
  code: ExecutorErrorCode;
  severity: "FATAL" | "ERROR" | "WARN";
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
  logs?: string;
}
```

### 8.2 Error Categories

| Severity | Code | Retryable | Trigger | Message Template | Recovery |
|---|---|---:|---|---|---|
| FATAL | `ERR_SES_INIT_FAILED` | No | `lockdown()` 或 Compartment 初始化失败 | `SES init failed: {details}` | 终止当前实例，外层可重启进程 |
| ERROR | `ERR_INVALID_STATE` | No | 生命周期非法调用 | `Invalid executor state: {state}` | 修正调用顺序 |
| ERROR | `ERR_VALIDATION_FAILED` | Yes | 静态校验失败 | `Code validation failed` | 让模型重写代码 |
| ERROR | `ERR_IMPORT_NOT_ALLOWED` | Yes | 非白名单导入 | `Import not allowed: {module}` | 调整导入或白名单 |
| ERROR | `ERR_MAX_OPS_EXCEEDED` | Yes | guard 计步超限 | `Max operations exceeded ({maxOps})` | 重写算法 |
| ERROR | `ERR_EXEC_TIMEOUT` | Yes | 超时 | `Execution timed out after {timeoutMs}ms` | 重建实例后重试 |
| ERROR | `ERR_TOOL_PROXY_FAIL` | Depends | 工具调用失败 | `Tool execution failed: {cause}` | 视业务错误可重试 |
| ERROR | `ERR_RUNTIME_EXCEPTION` | Depends | 其他运行时异常 | `Runtime exception: {cause}` | 由上层策略决定 |
| WARN | `ERR_CLEANUP_FAILED` | No | 清理失败 | `Cleanup failed: {cause}` | 记录告警并丢弃实例 |

### 8.3 Validation Diagnostics Contract

- `validateCode` 返回 `Diagnostic[]`。
- `ERROR` 必须阻断执行。
- `WARNING/INFO` 不阻断执行，但应暴露给上层日志或调试面板。

---

## 9. Definition of Done

本节用于验证实现是否完整且正确。实现完成的判定标准是：以下检查项全部勾选通过。

### 9.1 API and Lifecycle

- [ ] `ICodeExecutor` 五个方法签名与行为满足 Section 3/4。
- [ ] 状态机转移符合 Section 4.2。
- [ ] 非法状态调用抛 `ERR_INVALID_STATE`。
- [ ] `DEAD -> init() -> READY` 重建路径可用，`READY -> init()` 为 no-op。
- [ ] `runConcurrency="queue"` 时 FIFO 与 `maxQueuedRuns` 行为可验证。

### 9.2 Security

- [ ] `lockdown()` 全局只执行一次，且并发安全。
- [ ] 默认不暴露 Node/DOM 高危全局。
- [ ] Endowments 通过 `harden` 或等效不可变策略保护。
- [ ] 静态 import 在 script 基线下被拒绝（`ERR_IMPORT_NOT_ALLOWED`）。
- [ ] 动态 import 仅允许 `authorizedImports` 白名单模块。

### 9.3 Validation and Transform

- [ ] 代码解析失败可返回结构化诊断。
- [ ] 至少包含 Section 6.2 的内建规则。
- [ ] 所有循环语句都注入 guard。
- [ ] `maxOperations` 触发时抛 `ERR_MAX_OPS_EXCEEDED`。
- [ ] `ERR_MAX_OPS_EXCEEDED` 通过结构化标识识别（`code` 或 error type），不依赖 message 子串。

### 9.4 Runtime Semantics

- [ ] `final_answer(value)` 被捕获并返回 `is_final_answer=true`。
- [ ] 普通执行返回 `is_final_answer=false`。
- [ ] `timeoutMs` 触发 `ERR_EXEC_TIMEOUT`，实例进入 `DIRTY`。
- [ ] `logs` 顺序稳定、截断策略可验证。
- [ ] 超时验证用例不依赖沙箱全局 `setTimeout`（通过显式工具函数构造等待路径）。

### 9.5 Error Model

- [ ] 错误码与 Section 8.2 对齐。
- [ ] 错误对象包含 `code/severity/retryable/message`。
- [ ] 运行时错误可附带当前 `logs`。
- [ ] 工具桥接失败与非工具运行时失败可稳定区分（`ERR_TOOL_PROXY_FAIL` vs `ERR_RUNTIME_EXCEPTION`）。

### 9.6 Integration Baseline

- [ ] 与 `specs/web-wasm-codeagent-validation.md` 的工具链验证兼容。
- [ ] 至少通过 Appendix C 冒烟测试。

### 9.7 Cross-Feature Parity Matrix

运行此验证矩阵时，每个测试项都必须通过。

| Test Case | Pass |
|---|---|
| `NEW -> init -> READY -> cleanup -> DEAD -> init -> READY` 生命周期闭环 | [ ] |
| `runConcurrency="reject"`：并发 `run()` 第二次调用抛 `ERR_INVALID_STATE` | [ ] |
| `runConcurrency="queue"`：并发 `run()` 按 FIFO 排队执行 | [ ] |
| `maxQueuedRuns=1`：第 3 个并发请求触发超限错误 | [ ] |
| script 基线下静态 import 被拒绝且错误码正确 | [ ] |
| 动态 import 命中白名单通过，非白名单失败 | [ ] |
| 工具抛错映射到 `ERR_TOOL_PROXY_FAIL` | [ ] |
| 非工具代码异常映射到 `ERR_RUNTIME_EXCEPTION` | [ ] |
| 循环超限抛 `ERR_MAX_OPS_EXCEEDED`（结构化识别） | [ ] |
| 超时后状态进入 `DIRTY`，且 `cleanup()+init()` 后可恢复执行 | [ ] |

### 9.8 Assertion Templates (Normative)

以下模板用于实现 9.7。每个模板中的断言均为 `MUST`，不得以“行为近似”替代。

| Case ID | Setup / Action | Required Assertions |
|---|---|---|
| `CF-01` 生命周期闭环 | 创建实例（默认配置）并依次执行：`init()` -> `cleanup()` -> `init()`。 | 第 1 次 `init()` 后 state=`READY`；`cleanup()` 后 state=`DEAD`；第 2 次 `init()` 后 state=`READY`；三步均不抛错。 |
| `CF-02` reject 并发策略 | 配置：`runConcurrency="reject"`。准备一个长任务代码 `await sleepTool(300)`，并发触发两次 `run()`。 | 第一个 `run()` 正常执行；第二个 `run()` 抛错且 `error.code === "ERR_INVALID_STATE"`。 |
| `CF-03` queue FIFO | 配置：`runConcurrency="queue"`, `maxQueuedRuns=10`。并发提交两个任务：`runA` 先 `await sleepTool(100)` 后 `final_answer("A")`；`runB` 直接 `final_answer("B")`。 | 两个 `run()` 都成功返回；完成顺序必须是 `runA` 再 `runB`（FIFO）；两个返回值分别为 `"A"` 与 `"B"`。 |
| `CF-04` queue 容量上限 | 配置：`runConcurrency="queue"`, `maxQueuedRuns=1`。并发提交三个任务：第一个长任务 + 两个后续任务。 | 第 1 个任务执行中，第 2 个进入队列；第 3 个立即失败且 `error.code === "ERR_INVALID_STATE"`。 |
| `CF-05` 静态 import 拒绝 | 配置：`authorizedImports=["node:fs"]`；执行代码：`import fs from "node:fs";`。 | `run()` 失败；`error.code === "ERR_IMPORT_NOT_ALLOWED"`；用户代码未执行（无副作用）。 |
| `CF-06` 动态 import 白名单 | 配置：`authorizedImports=["x-ok"]`。分别执行：`await import("x-ok")` 与 `await import("x-denied")`。 | 第一段代码可通过校验并执行；第二段代码失败且 `error.code === "ERR_IMPORT_NOT_ALLOWED"`。 |
| `CF-07` 工具异常映射 | 注入工具：`boomTool`（同步 `throw` 或 Promise reject）。执行：`await boomTool()`。 | `run()` 失败；`error.code === "ERR_TOOL_PROXY_FAIL"`；state 回到 `READY`。 |
| `CF-08` 非工具运行时异常映射 | 执行非工具异常代码（如 `throw new Error("x")` 或未定义变量访问）。 | `run()` 失败；`error.code === "ERR_RUNTIME_EXCEPTION"`；state 回到 `READY`。 |
| `CF-09` max operations 结构化识别 | 配置：`maxOperations` 为小值，执行 `while(true){}`。 | `run()` 失败；`error.code === "ERR_MAX_OPS_EXCEEDED"`；测试不得仅用 message 子串断言。 |
| `CF-10` DIRTY 恢复路径 | 配置：`timeoutMs` 为小值，执行 `await sleepTool(999999)` 触发超时；随后执行 `cleanup()` + `init()`，再运行简单代码 `final_answer("ok")`。 | 超时时 `error.code === "ERR_EXEC_TIMEOUT"` 且 state=`DIRTY`；`cleanup()` 后 state=`DEAD`；重建后可成功返回 `"ok"` 且 `is_final_answer=true`。 |

---

## 10. Extensibility and Compatibility

### 10.1 BaseExecutor Parity

`SESExecutor` 与其他执行器（如 `PyodideExecutor`）在调用面保持一致：

- 一致的方法签名。
- 一致的 `CodeOutput` 字段语义。
- 一致的错误标准化输出接口。

### 10.2 Optional Extensions

可选扩展（不影响本规范最小合规）：

- 自定义 lint 规则注册。
- 自定义 AST transform 管线。
- 细粒度工具权限（按工具名 ACL）。
- 结构化 logs（除文本 `logs` 外，返回 `LogEntry[]`）。

### 10.3 Versioning

- 对外契约破坏性修改必须提升 major 版本。
- 新增错误码、可选字段应保持向后兼容。

---

## 11. Appendix A: Default Lockdown Policy

以下为建议默认策略（实现可细化，但行为不应弱化）：

```ts
lockdown({
  errorTaming: "unsafe",
  stackFiltering: "concise",
  overrideTaming: "moderate",
  localeTaming: "safe",
  consoleTaming: "unsafe"
});
```

说明：

- `Date.now`、`Math.random` 是否移除取决于业务需求。若保留，需在威胁模型中明确接受风险。
- 锁定策略变更必须记录在发布说明并回归安全测试。

---

## 12. Appendix B: Built-In Validation Rules

最小规则集（可扩展）：

| Rule ID | Severity | Blocking | Notes |
|---|---|---:|---|
| `code_non_empty` | ERROR | Yes | 空代码禁止执行 |
| `syntax_valid` | ERROR | Yes | Babel/Parser 语法错误 |
| `max_operations_valid` | ERROR | Yes | 取值非法 |
| `timeout_valid` | ERROR | Yes | 取值非法 |
| `import_allowed` | ERROR | Yes | 非白名单导入 |
| `static_import_in_script_mode` | ERROR | Yes | script 基线禁止静态 import |
| `forbidden_global_access` | WARNING | No | 可疑访问提示 |
| `log_budget_too_small` | INFO | No | `maxLogBytes` 小于推荐值 |

---

## 13. Appendix C: Smoke Test Baseline

```ts
import { strict as assert } from "node:assert";

const executor = new SESExecutor({
  maxOperations: 1000,
  timeoutMs: 2000,
  authorizedImports: [],
});

await executor.init();
await executor.sendTools({
  readTool: async (path: string) => `content:${path}`,
  sleepTool: async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
});

// Case A: final_answer capture
{
  const code = `
    const text = await readTool("a.txt");
    final_answer(text + ":ok");
  `;
  const res = await executor.run(code);
  assert.equal(res.is_final_answer, true);
  assert.equal(res.output, "content:a.txt:ok");
}

// Case B: max operations guard
{
  const code = `while (true) {}`;
  let gotCode = "";
  try {
    await executor.run(code);
  } catch (e: any) {
    gotCode = e.code || "";
  }
  assert.equal(gotCode, "ERR_MAX_OPS_EXCEEDED");
}

// Case C: timeout
{
  const code = `
    await sleepTool(999999);
  `;
  let got = "";
  try {
    await executor.run(code);
  } catch (e: any) {
    got = e.code || e.message || "";
  }
  assert.match(String(got), /ERR_EXEC_TIMEOUT|timed out/);
}

await executor.cleanup();
```

---

## 14. Appendix D: JavaScript CodeAgent System Prompt

本附录定义面向 `SESExecutor` 的 JavaScript 版 `CodeAgent` system prompt，用于替换当前 Python 话术与示例。占位符命名与 `template-loader.ts` 保持兼容（如 `{{code_block_opening_tag}}`、`{{{tools_prompt}}}`、`{{authorized_imports}}`）。

### 14.1 Migration Requirements (Python -> JavaScript)

1. 所有“write Python code”改为“write JavaScript code”。
2. 所有 `print(...)` 改为 `console.log(...)`。
3. 工具调用说明改为“工具可能是同步或异步；不确定时可直接 `await` 调用结果”。
4. 保留 `Thought -> Code -> Observation` 工作流。
5. 终态输出必须通过 `final_answer(value)`，禁止自然语言直接收尾。
6. 导入规则改为“仅允许 `{{authorized_imports}}` 列表内模块”。

### 14.2 Recommended JavaScript `system_prompt` Text

```text
You are an expert assistant who can solve any task using JavaScript code blobs. You will be given a task to solve as best you can.
You have access to a list of tools. These tools behave like regular JavaScript functions available in your runtime.
To solve the task, you must think step by step in a loop of Thought, Code, and Observation.

At each step:
- In "Thought:", explain your reasoning and what you will do next.
- In "Code:", write JavaScript only.
- The code block must start with '{{code_block_opening_tag}}' and end with '{{code_block_closing_tag}}'.
- For intermediate results, use console.log(...). Logged output appears in the next Observation.

Tool calls may be synchronous or asynchronous. If unsure, use await (await works for both Promise and non-Promise values).
To finish, you MUST call final_answer(value). This is the only valid way to provide the final answer.

You only have access to these tools:
{{code_block_opening_tag}}
{{{tools_prompt}}}
{{code_block_closing_tag}}

Rules:
1. Always output both "Thought:" and one JavaScript code block.
2. Use only defined variables.
3. Pass tool arguments directly; do not pass a single dict/object unless the tool signature expects an object.
4. If a tool output format is uncertain, do not chain too many dependent tool calls in one block. Log first, then continue in the next step.
5. Do not re-run the exact same tool call with the same parameters unless required.
6. Do not create variables with the same name as a tool (especially final_answer).
7. Do not invent fake variables that do not exist in runtime state.
8. You may import only from: {{authorized_imports}}.
9. Runtime state persists across steps: declared variables and imports remain available.
10. Do not stop early; keep iterating until you can call final_answer.

{{#if custom_instructions}}
{{custom_instructions}}
{{/if}}

Now Begin!
```

### 14.3 JavaScript Example Rewrites

示例 A：读取文档并产出最终答案

```text
Task: "Generate an image of the oldest person in this document."

Thought: I will find the oldest person from the document, then generate an image.
{{code_block_opening_tag}}
const answer = await document_qa({ document, question: "Who is the oldest person mentioned?" });
console.log(answer);
{{code_block_closing_tag}}
Observation: "The oldest person in the document is John Doe, a 55 year old lumberjack living in Newfoundland."

Thought: I now have the person description and can generate the image.
{{code_block_opening_tag}}
const image = await image_generator("A portrait of John Doe, a 55-year-old man living in Canada.");
final_answer(image);
{{code_block_closing_tag}}
```

示例 B：数值计算

```text
Task: "What is the result of: 5 + 3 + 1294.678?"

Thought: I will compute it directly in JavaScript and return it.
{{code_block_opening_tag}}
const result = 5 + 3 + 1294.678;
final_answer(result);
{{code_block_closing_tag}}
```

示例 C：翻译后做图像问答

```text
Task: Answer French question in variable `question` for image variable `image`.

Thought: First translate French to English, then ask image_qa.
{{code_block_opening_tag}}
const translatedQuestion = await translator({ question, src_lang: "French", tgt_lang: "English" });
console.log(`Translated question: ${translatedQuestion}`);
const answer = await image_qa({ image, question: translatedQuestion });
final_answer(`The answer is ${answer}`);
{{code_block_closing_tag}}
```

示例 D：搜索并比较城市人口

```text
Task: "Which city has higher population: Guangzhou or Shanghai?"

Thought: I will search populations for both cities and compare.
{{code_block_opening_tag}}
const gz = await web_search("Guangzhou population");
const sh = await web_search("Shanghai population");
console.log({ gz, sh });
{{code_block_closing_tag}}
Observation: "{ gz: '15 million...', sh: '26 million...' }"

Thought: Shanghai is higher.
{{code_block_opening_tag}}
final_answer("Shanghai");
{{code_block_closing_tag}}
```

### 14.4 Template-Loader Alignment Notes

若后续改造 `src/prompts/template-loader.ts`，`CODE_AGENT_TEMPLATE.system_prompt` 至少应同步以下替换：

1. `Python` -> `JavaScript`。
2. `print()` -> `console.log()`。
3. `All tools are synchronous; do not use await` -> `Tools may be sync or async; use await when unsure`。
4. 所有示例代码语法改为 JS（`const`、对象字面量、模板字符串）。
5. 保留 `final_answer(...)` 终态约束和 `authorized_imports` 规则。
