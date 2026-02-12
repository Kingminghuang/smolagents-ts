## 1. DOT DSL Schema

### 1.1 Supported Subset

Attractor accepts a strict subset of the Graphviz DOT language. The restrictions exist for predictability: one graph per file, directed edges only, no HTML labels, and typed attributes with defaults.

### 1.2 BNF-Style Grammar

```
Graph           ::= 'digraph' Identifier '{' Statement* '}'

Statement       ::= GraphAttrStmt
                   | NodeDefaults
                   | EdgeDefaults
                   | SubgraphStmt
                   | NodeStmt
                   | EdgeStmt
                   | GraphAttrDecl

GraphAttrStmt   ::= 'graph' AttrBlock ';'?
NodeDefaults    ::= 'node' AttrBlock ';'?
EdgeDefaults    ::= 'edge' AttrBlock ';'?
GraphAttrDecl   ::= Identifier '=' Value ';'?

SubgraphStmt    ::= 'subgraph' Identifier? '{' Statement* '}'

NodeStmt        ::= Identifier AttrBlock? ';'?
EdgeStmt        ::= Identifier ( '->' Identifier )+ AttrBlock? ';'?

AttrBlock       ::= '[' Attr ( ',' Attr )* ']'
Attr            ::= Key '=' Value

Key             ::= Identifier | QualifiedId
QualifiedId     ::= Identifier ( '.' Identifier )+

Value           ::= String | Integer | Float | Boolean | Duration
Identifier      ::= [A-Za-z_][A-Za-z0-9_]*
String          ::= '"' ( '\\"' | '\\n' | '\\t' | '\\\\' | [^"\\] )* '"'
Integer         ::= '-'? [0-9]+
Float           ::= '-'? [0-9]* '.' [0-9]+
Boolean         ::= 'true' | 'false'
Duration        ::= Integer ( 'ms' | 's' | 'm' | 'h' | 'd' )

Direction       ::= 'TB' | 'LR' | 'BT' | 'RL'
```

### 1.3 Key Constraints

- **One digraph per file.** Multiple graphs, undirected graphs, and `strict` modifiers are rejected.
- **Bare identifiers for node IDs.** Node IDs must match `[A-Za-z_][A-Za-z0-9_]*`. Human-readable names go in the `label` attribute.
- **Commas required between attributes.** Inside attribute blocks, commas separate key-value pairs for unambiguous parsing.
- **Directed edges only.** `->` is the only edge operator. `--` (undirected) is rejected.
- **Comments supported.** Both `// line` and `/* block */` comments are stripped before parsing.
- **Semicolons optional.** Statement-terminating semicolons are accepted but not required.

### 1.4 Value Types

| Type     | Syntax                          | Examples                             |
|----------|---------------------------------|--------------------------------------|
| String   | Double-quoted with escapes      | `"Hello world"`, `"line1\nline2"`    |
| Integer  | Optional sign, digits           | `42`, `-1`, `0`                      |
| Float    | Decimal number                  | `0.5`, `-3.14`                       |
| Boolean  | Literal keywords                | `true`, `false`                      |
| Duration | Integer + unit suffix           | `900s`, `15m`, `2h`, `250ms`, `1d`   |

### 1.5 Graph-Level Attributes

Graph attributes are declared in a `graph [ ... ]` block or as top-level `key = value` declarations. They configure the entire workflow.

| Key                       | Type     | Default   | Description |
|---------------------------|----------|-----------|-------------|
| `goal`                    | String   | `""`      | Human-readable goal for the pipeline. Exposed as `$goal` in prompt templates and mirrored into the run context as `graph.goal`. |
| `label`                   | String   | `""`      | Display name for the graph (used in visualization). |
| `model_stylesheet`        | String   | `""`      | CSS-like stylesheet for per-node LLM model/provider defaults. See Section 8. |
| `default_max_retry`       | Integer  | `50`      | Global retry ceiling for nodes that omit `max_retries`. |
| `retry_target`            | String   | `""`      | Node ID to jump to if exit is reached with unsatisfied goal gates. |
| `fallback_retry_target`   | String   | `""`      | Secondary jump target if `retry_target` is missing or invalid. |
| `default_fidelity`        | String   | `""`      | Default context fidelity mode (see Section 5.4). |

### 1.6 Node Attributes

| Key                 | Type     | Default         | Description |
|---------------------|----------|-----------------|-------------|
| `label`             | String   | node ID         | Display name shown in UI, prompts, and telemetry. |
| `shape`             | String   | `"box"`         | Graphviz shape. Determines the default handler type (see mapping table below). |
| `type`              | String   | `""`            | Explicit handler type override. Takes precedence over shape-based resolution. |
| `prompt`            | String   | `""`            | Primary instruction for the stage. Supports `$goal` variable expansion. Falls back to `label` if empty for LLM stages. |
| `max_retries`       | Integer  | `0`             | Number of additional attempts beyond the initial execution. `max_retries=3` means up to 4 total executions. |
| `goal_gate`         | Boolean  | `false`         | If `true`, this node must reach SUCCESS before the pipeline can exit. |
| `retry_target`      | String   | `""`            | Node ID to jump to if this node fails and retries are exhausted. |
| `fallback_retry_target` | String | `""`          | Secondary retry target. |
| `fidelity`          | String   | inherited       | Context fidelity mode for this node's LLM session. See Section 5.4. |
| `thread_id`         | String   | derived         | Explicit thread identifier for LLM session reuse under `full` fidelity. |
| `class`             | String   | `""`            | Comma-separated class names for model stylesheet targeting. |
| `timeout`           | Duration | unset           | Maximum execution time for this node. |
| `llm_model`         | String   | inherited       | LLM model identifier. Overridable by stylesheet. |
| `llm_provider`      | String   | auto-detected   | LLM provider key. Auto-detected from model if unset. |
| `reasoning_effort`  | String   | `"high"`        | LLM reasoning effort: `low`, `medium`, `high`. |
| `auto_status`       | Boolean  | `false`         | If `true` and the handler writes no status, the engine auto-generates a SUCCESS outcome. |
| `allow_partial`     | Boolean  | `false`         | Accept PARTIAL_SUCCESS when retries are exhausted instead of failing. |

### 1.7 Edge Attributes

| Key          | Type     | Default | Description |
|--------------|----------|---------|-------------|
| `label`      | String   | `""`    | Human-facing caption and routing key. Used for preferred-label matching in edge selection. |
| `condition`  | String   | `""`    | Boolean guard expression evaluated against the current context and outcome. See Section 10. |
| `weight`     | Integer  | `0`     | Numeric priority for edge selection. Higher weight wins among equally eligible edges. |
| `fidelity`   | String   | unset   | Override fidelity mode for the target node. Highest precedence in fidelity resolution. |
| `thread_id`  | String   | unset   | Override thread ID for session reuse at the target node. |
| `loop_restart` | Boolean | `false` | When `true`, terminates the current run and re-launches with a fresh log directory. |

### 1.8 Shape-to-Handler-Type Mapping

The `shape` attribute on a node determines which handler executes it, unless overridden by an explicit `type` attribute. This table defines the canonical mapping:

| Shape             | Handler Type          | Description |
|-------------------|-----------------------|-------------|
| `Mdiamond`        | `start`               | Pipeline entry point. No-op handler. Every graph must have exactly one. |
| `Msquare`         | `exit`                | Pipeline exit point. No-op handler. Every graph must have exactly one. |
| `box`             | `codergen`            | LLM task (code generation, analysis, planning). The default for all nodes without an explicit shape. |
| `hexagon`         | `wait.human`          | Human-in-the-loop gate. Blocks until a human selects an option. |
| `diamond`         | `conditional`         | Conditional routing point. Routes based on edge conditions against current context. |
| `component`       | `parallel`            | Parallel fan-out. Executes multiple branches concurrently. |
| `tripleoctagon`   | `parallel.fan_in`     | Parallel fan-in. Waits for all branches and consolidates results. |
| `parallelogram`   | `tool`                | External tool execution (shell command, API call). |
| `house`           | `stack.manager_loop`  | Supervisor loop. Orchestrates observe/steer/wait cycles over a child pipeline. |

### 1.9 Chained Edges

Chained edge declarations are syntactic sugar. The statement:

```
A -> B -> C [label="next"]
```

expands to two edges:

```
A -> B [label="next"]
B -> C [label="next"]
```

Edge attributes in a chained declaration apply to all edges in the chain.

### 1.10 Subgraphs

Subgraphs serve two purposes: **scoping defaults** and **deriving classes** for the model stylesheet.

**Scoping defaults:** Attributes declared in a subgraph's `node [ ... ]` block apply to nodes within that subgraph unless the node explicitly overrides them.

```
subgraph cluster_loop {
    label = "Loop A"
    node [thread_id="loop-a", timeout="900s"]

    Plan      [label="Plan next step"]
    Implement [label="Implement", timeout="1800s"]
}
```

Here `Plan` inherits `thread_id="loop-a"` and `timeout="900s"`, while `Implement` inherits `thread_id` but overrides `timeout`.

**Class derivation:** Subgraph labels can produce CSS-like classes for model stylesheet matching. Nodes inside a subgraph receive the derived class. The class name is derived by lowercasing the label, replacing spaces with hyphens, and stripping non-alphanumeric characters (except hyphens). For example, `label="Loop A"` yields class `loop-a`.

### 1.11 Node and Edge Default Blocks

Default blocks set baseline attributes for all subsequent nodes or edges within their scope:

```
node [shape=box, timeout="900s"]
edge [weight=0]
```

Explicit attributes on individual nodes or edges override these defaults.

### 1.12 Class Attribute

The `class` attribute assigns one or more CSS-like class names to a node for model stylesheet targeting:

```
review_code [shape=box, class="code,critical", prompt="Review the code"]
```

Classes are comma-separated. They can be referenced in the model stylesheet with dot-prefix selectors (`.code`, `.critical`).

### 1.13 Minimal Examples

**Simple linear workflow:**

```
digraph Simple {
    graph [goal="Run tests and report"]
    rankdir=LR

    start [shape=Mdiamond, label="Start"]
    exit  [shape=Msquare, label="Exit"]

    run_tests [label="Run Tests", prompt="Run the test suite and report results"]
    report    [label="Report", prompt="Summarize the test results"]

    start -> run_tests -> report -> exit
}
```

**Branching workflow with conditions:**

```
digraph Branch {
    graph [goal="Implement and validate a feature"]
    rankdir=LR
    node [shape=box, timeout="900s"]

    start     [shape=Mdiamond, label="Start"]
    exit      [shape=Msquare, label="Exit"]
    plan      [label="Plan", prompt="Plan the implementation"]
    implement [label="Implement", prompt="Implement the plan"]
    validate  [label="Validate", prompt="Run tests"]
    gate      [shape=diamond, label="Tests passing?"]

    start -> plan -> implement -> validate -> gate
    gate -> exit      [label="Yes", condition="outcome=success"]
    gate -> implement [label="No", condition="outcome!=success"]
}
```

**Human gate:**

```
digraph Review {
    rankdir=LR

    start [shape=Mdiamond, label="Start"]
    exit  [shape=Msquare, label="Exit"]

    review_gate [
        shape=hexagon,
        label="Review Changes",
        type="wait.human"
    ]

    start -> review_gate
    review_gate -> ship_it [label="[A] Approve"]
    review_gate -> fixes   [label="[F] Fix"]
    ship_it -> exit
    fixes -> review_gate
}
```