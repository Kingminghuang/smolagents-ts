# System Design Specification: SES JavaScript Executor (`SESExecutor`)

## 1. 概述 (Overview)
本文档详细规定了 `smolagents-ts` 原生 JavaScript 执行组件 `SESExecutor` 的系统架构设计、接口契约以及内部的生命周期机制。

不同于原先构想的跨语言 C 虚拟机隔离 (`mquickjs`)，本系统采用 **Endo / SES (Hardened JavaScript)** 技术架构。此架构通过篡改和加固宿主运行时的 JavaScript 原生引擎，开辟出一个高度隔离的 `Compartment` 沙箱。该技术能够提供极其平移的宿主同步/异步方法互操作（毫无执行流切断痛点），以及最高级别的 ES 语法兼容。

### 1.1 核心诉求设计考量
*   **沙箱执行安全 (Security & Isolation)**: 绝对禁止 Agent 生成的动态代码越权访问宿主 DOM、Node 环境或任意 `globalThis` 对象资源（防堵恶意攻击）。
*   **宿主联动无缝性 (Continuity)**: 外部注册的 Tool 应当能在沙箱内天然表现为其对应的形态（如 Promise/Sync），允许 Agent 开箱即用地使用现代 JS 语法（如 `await Host.readDoc()`），避免因跨语言边界导致的回调地狱与流分裂。
*   **资源限制防线 (DoS Mitigation)**: 由于沙箱与宿主共享单线程 Event Loop，必须防范 LLM 产生的恶意死循环挂起宿主 UI。因此需前置 Babel 注入拦截指令。

---

## 1.2 结构化数据与模式 (Schema & Data Model)

系统运行时的输入与输出契约，必须严格遵循以下 TypeScript / JSON Schema 规范定义：

| 实体名称 | 字段/属性 | 类型 | 必填 | 默认值 | 描述与边界约束 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`ExecutorOptions`** | `maxOperations` | `Integer` | 否 | `50000` | AST 防爆注入的安全计步器阈值。超限抛错。 |
| | `authorizedImports` | `String[]` | 否 | `[]` | 允许在 Compartment 内使用的模块依赖表。 |
| **`CodeOutput`** | `output` | `Any` | 是 | - | 执行脚本反序列化后的最终返回值，或报错信息本身。 |
| | `logs` | `String` | 是 | `""` | 拦截到的 `console.log/error/warn` 流转储。 |
| | `is_final_answer`| `Boolean` | 是 | `false` | 若 AST 在执行中截获了 `final_answer()` 闭包阻断，标定为 true。 |

---

`SESExecutor` 的运作涉及三个关键层级：**宿主环境配置（Host）**、**代码预处理器（Babel AST Linter & Injector）**、**SES 沙箱隔离区（Compartment）**。

### 2.1 阶段一：宿主启动与底层锁定 (`lockdown`)
SES 规定，在其进程/线程生命周期中，必须存在一个**全局的、不可逆转的初始化过程**，称为 `lockdown()`。
1.  **全局锁定（Global Harden）**: `SESExecutor` 的单例初始化过程需调用 `lockdown(...)`，篡改当前 JS 引擎底层的内置原型链（`Object`, `Array`, `Function` 等），冻结其不可变性（Prevent Prototype Pollution）。
2.  **安全性配置**: `lockdown` 配置中默认移除内置的高危方法（如 `Date.now()`, `Math.random()` 等不可预测时间与旁路的测信道行为）。

### 2.2 阶段二：建立运行隔离室 (`Compartment`)
每当拉起一个全新的 Executor 实例，即实例化一个全新的 `Compartment`。
1.  **状态空置**: 该隔离室具备一张完全纯净的 `globalThis` 对象。
2.  **按需点卯 (Endowments)**: 宿主层通过 `sendVariables` 和 `sendTools` 方法，把需要透传的数据或函数以字典形式塞进该 `Compartment` 的配置中。
3.  **能力固化**: 所有注入的 Tool 和变量，通常需要通过 `harden(object)` 进行深冻结处理，防止被沙箱内的恶意代码改写引流。

### 2.3 伪代码化核心逻辑 (Algorithmic Pseudocode): AST 防爆注射
由于 Compartment 共享宿主单线程，必须依赖 Babel 预处理防止死循环挂死 UI。

```python
FUNCTION inject_loop_guards(code: String, max_ops: Integer) -> String:
    # Step 1: 解析源码生成 AST
    ast_tree = Babel.parse(code)
    
    # Step 2: 遍历所有可能产生死循环的 AST 节点
    FOR node IN ast_tree.traverse():
        IF type(node) IN (ForStatement, WhileStatement, DoWhileStatement):
            # Step 3: 在循环体首行硬插入计数器断言
            guard_stmt = parse_stmt(
                "if (++__smol_op_counter > " + max_ops + ") throw new Error('AgentExecutionError: Max operations exceeded.');"
            )
            node.body.insert_at_top(guard_stmt)
            
    # Step 4: 返回转译后的安全代码
    RETURN Babel.generate(ast_tree)
```

### 2.4 伪代码化核心逻辑 (Algorithmic Pseudocode): 引擎执行与边界探测
处理 `CodeAgent` 真实执行挂载和 `final_answer` 中断转译。

```python
ASYNC FUNCTION evaluate_code(compartment: Compartment, code: String) -> CodeOutput:
    # Step 1: 重置计步器防御状态
    compartment.globalThis.__smol_op_counter = 0
    
    # Step 2: 构造顶层 Async 立即执行包装器，捕获 final_answer Exception
    wrapped_code = """
    (async () => {
        try {
            """ + code + """
            // 如果顺利跑完无抛出，判定为中间步骤代码
            return { is_final_answer: false, value: __last_expr() };
        } catch(e) {
            // 精准接管并消化 Agent 代码中 final_answer_tool 抛出的特殊中断类
            if (e && e.__is_final__) {
                return { is_final_answer: true, value: e.value };
            }
            throw e; // 其他语法/运行时报错向上透传
        }
    })()
    """
    
    # Step 3: 在沙箱内执行并利用宿主 Promise EventLoop 挂起等待
    TRY:
        raw_res = AWAIT compartment.evaluate(wrapped_code)
        RETURN CodeOutput(output=raw_res.value, logs=extract_logs(), is_final_answer=raw_res.is_final_answer)
    CATCH Error AS e:
        THROW AgentExecutionError(e.message, logs=extract_logs())
```

---

## 3. 契约与接口化 (Contracts & Extensibility)

### 3.1 抽象执行器接口 (`BaseExecutor` Contract)
`SESExecutor` 必须完全实现类似于 `PyodideExecutor` 中具备的签名。采用语言无关的伪代码定义此契约：

```python
INTERFACE ICodeExecutor:
    # ----------------------------------------
    # 初始化引擎环境。在宿主系统底层执行锁定环境 `lockdown()`，并构造专用的 Compartment。
    # 要求：全局 lockdown 需要保证幂等性；Compartment 初始化速度极快且无副作用。
    # ----------------------------------------
    ASYNC FUNCTION init() -> Void

    # ----------------------------------------
    # 向执行沙箱中一次性注入多个全局状态或变量字面量（Endowments）。
    # 要求：宿主应尽可能使用 `harden()` 处理这些引用数据。
    # ----------------------------------------
    ASYNC FUNCTION sendVariables(variables: Dict[String, Any]) -> Void
    
    # ----------------------------------------
    # 注入允许被 Agent 调用的函数（Tools）句柄集合。
    # 要求：异步函数允许维持 Promise 形态，无需包装，SES 会顺滑将其呈现给沙箱内部。
    # ----------------------------------------
    ASYNC FUNCTION sendTools(tools: Dict[String, Callable]) -> Void

    # ----------------------------------------
    # 核心执行管线，分为两段：
    # 1. Pipeline: 调取 Babel 进行强 AST 防爆注入。
    # 2. Evaluation: 在 Compartment 执行。
    # 期间收集脚本输出的标准日志，并探测最终返回的结果是否抛出了 final_answer 中断异常信号。
    # ----------------------------------------
    ASYNC FUNCTION run(code: String) -> CodeOutput

    # ----------------------------------------
    # 释放 Compartment 占用的堆内存引用。
    # ----------------------------------------
    ASYNC FUNCTION cleanup() -> Void
```

---

## 4. 诊断、异常与容错 (Diagnostics & Resilience)

为确保系统非 Happy Path 下的健壮性，必须实施以下错误分类与边界容错机制：

### 4.1 异常类型契约与报错格式
沙箱内外的异常必须被外壳按如下标准格式（Severity & Code）捕获并分类抛出给上层 Agent 调度域：

| Severity | Error Code | 触发场景 | Message Template | 容错/恢复策略 (Fallback) |
| :--- | :--- | :--- | :--- | :--- |
| `FATAL` | `ERR_SES_INIT_FAILED` | SES `lockdown()` 引擎初始化或原型链篡改失败。 | "SES Runtime failed to initialize: {details}" | 抛出至系统宿主，停止所有沙箱衍生，进程级报错。 |
| `ERROR` | `ERR_AST_LINT_VIOLATION` | Babel 检测到恶意越权代码（如规避隔离强取外层）。 | "Syntax/Security Blocked: {violation_reason}" | 阻断代码进入引擎，向 LLM 扔出格式化错误要求重写。 |
| `ERROR` | `ERR_EXEC_TIMEOUT` | （兜底防线）沙箱执行时间超出外部异步包裹块设定的硬超时。| "Agent execution timed out after {x}ms" | 从外层舍弃结果等待，触发垃圾回收，强制清理当前 Compartment。 |
| `ERROR` | `ERR_MAX_OPS_EXCEEDED`| 沙箱运行时 `__smol_op_counter` 计数超标（发生死循环）。 | "Max operations exceeded ({max_ops})" | 抛出被拦截栈结构，将已收集的局部 `logs` 返回大模型协助排障。 |
| `WARN` | `ERR_TOOL_PROXY_FAIL` | 注入的 Promise Tool 在通过异步桥执行时引发内部业务报错。| "Tool execution failed: {cause}" | 普通运行错误，不会炸毁 Compartment。 |

### 4.2 逃生路由与环境重置 (Teardown & Re-Init Route)
一旦当前 Executor 的单次 `run()` 任务触发了如 `ERR_EXEC_TIMEOUT` 等脱离 JavaScript 内部异常流控制的意外，我们假定当前共享的 `Compartment` 的全局状态词典已被深度污染且锁定：
1. **策略**: 执行器实例标记为 `DIRTY/DEAD`。
2. **销毁**: 触发 `cleanup()`，释放全部被 `globalThis` 持有的业务大数据变量图（Arrays/Strings）等待 V8 GC。
3. **恢复**: 对大模型的后续续写请求，外层调度端必须重新调用 `init() -> sendVariables() -> sendTools()` 重建一个具有独立内存区的新隔离室。

---

## 5. 竣工定义与可测试性 (Definition of Done & Testability)

本执行器的验收必须对标并 100% 通过 Node-WASM Baseline 定义的工具集成测试矩阵，并辅以架构层的防渗透验证。

### 5.1 核心测试矩阵 (Test Matrix Checklists)
所有基于 `SESExecutor` 驱动的 CodeAgent 必须无缝兼容并绿灯通过以下文件系统工具链（详见 `specs/web-wasm-codeagent-validation.md`）的行为验证：

- [ ] **ReadTool (11 Tests: test_read_01 - test_read_11)**: 涵盖受限截断（Line/Byte Limit）、非法偏移越界容错、文件 Magic Number 探测机制。
- [ ] **WriteTool (2 Tests: test_write_12 - test_write_13)**: 涵盖常规并发写入、嵌套父级目录的递归（`mkdir -p`）静默生成能力。
- [ ] **EditTool (16 Tests: test_edit_14 - test_edit_29)**: 涵盖文本精准靶标替换、模糊匹配容错、针对尾随空格/制表符/换行符乱码的标准化消除退避规则，以及防重复匹配。
- [ ] **Grep/Find/Ls Bootstrapping (4 Tests: test_grep_30 - test_ls_33)**: 确保能够顺滑跨越沙箱读取并序列化展现含有 `.` 的深层潜藏态目录。

### 5.2 端到端冒烟验证标尺 (Smoke Test Validation)
在交付真实业务联调前，系统核心驱动必须至少满足以下自动化测试桩（基于 Jest / Mocha）：

```javascript
// Step 1: 准备宿主端受控设施
const mockTools = {
    readTool: async (path) => { return `content of ${path}`; }
};
const executor = new SESExecutor({ maxOperations: 1000 });

// Step 2: 拉起隔离区，注水
await executor.init();
await executor.sendTools(mockTools);

// Step 3: 流测试 A - 平滑异步直录与 final_answer 退栈截获
const codeA = `
    const text = await readTool('test.txt'); // 在 SES 环境受原生 Top-level await 防具支持
    final_answer(text + ' was read successfully'); 
`;
const resA = await executor.run(codeA);
assert(resA.is_final_answer === true);
assert(resA.output === 'content of test.txt was read successfully');

// Step 4: 流测试 B - Babel 防爆注射（防 UI 卡死断言）
const codeB = `while (true) { let i = 0; }`;
try {
    await executor.run(codeB);
    assert.fail("Should have thrown Max operations exceeded error");
} catch(e) {
    // 拦截到的必是 AgentExecutionError: Max operations exceeded (1000)
    assert(e.message.includes('Max operations exceeded'));
}
```
