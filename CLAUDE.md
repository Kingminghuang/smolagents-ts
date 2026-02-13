# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

smolagents-ts is a TypeScript-native AI agent framework with tool calling capabilities. It is a port of the Python [smolagents](https://github.com/huggingface/smolagents) library by Hugging Face.

## Common Commands

### Build
- `npm run build` - Build the library (uses `tsup.config.ts`)
- `npm run build:browser` - Build browser bundle for demos/E2E tests (uses `tsup.browser.config.ts`)
- `npm run dev` - Watch mode for development
- `npm run type-check` - TypeScript type checking only

### Test
- `npm test` - Run unit tests with Vitest (uses mock data by default)
- `npm run test:wasm` - Run WASM/Pyodide tests (separate vitest config)
- `npm run test:real` - Run tests with real OpenAI API (requires `OPENAI_API_KEY`)
- `npm run test:e2e` - Run Playwright E2E browser tests (requires build:browser first)
- `npm run test:ui` - Open Vitest UI for interactive testing
- `npm run test:coverage` - Run tests with coverage report

**Running a single test file:**
```bash
npm test -- tests/unit/agents/tool-calling-agent.test.ts
# or with Vitest directly
npx vitest run tests/unit/agents/tool-calling-agent.test.ts
```

### Lint/Format
- `npm run lint` - Run ESLint on `src/`
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Format with Prettier
- `npm run format:check` - Check formatting without writing

## Architecture

### Core Agent Hierarchy

```
MultiStepAgent (abstract base)
├── ToolCallingAgent - Uses LLM tool-calling to execute tools
└── CodeAgent - Generates and executes Python code via Pyodide
```

**Key method signatures:**
- `agent.run(task, options)` - Main entry point; returns Promise or AsyncGenerator if `stream: true`
- `_step_stream()` - Abstract method subclasses implement for step logic
- `write_memory_to_messages()` - Converts memory to LLM message format

### Model Interface

```typescript
interface Model {
  generate(messages, options?): Promise<ChatMessage>
  generate_stream?(messages, options?): AsyncGenerator<ChatMessageStreamDelta>
  parse_tool_calls(message): ChatMessage
}
```

- `OpenAIModel` is the primary implementation
- Streaming is optional (`generate_stream?`)
- Models must convert responses to `ChatMessage` format with `tool_calls` array

### Tool System

All tools extend `BaseTool` and implement:
- `name`, `description`, `inputs` - Metadata for LLM function calling
- `forward(args)` - Execution logic
- `to_dict()` - Converts to OpenAI function-calling format (inherited from base)

Tools are registered in `src/tools/index.ts` exports.

### Memory System

- `AgentMemory` manages conversation history as an array of `MemoryStep` objects
- Steps include: `TaskStep`, `ActionStep`, `FinalAnswerStep`
- Memory converts to `ChatMessage[]` via `to_messages()` for LLM context window

### Python Execution (CodeAgent)

`PyodideExecutor` (in `src/utils/python-executor.ts`) runs Python in-browser or Node.js:
- Loads Pyodide from CDN in browser
- Supports `authorized_imports` whitelist
- Tools can provide `pythonCode` property for Python implementations
- **File System Modes**:
  - `fsMode: 'nodefs'` (default): Mounts local directory via NODEFS (Node.js only)
  - `fsMode: 'nativefs'`: Mounts browser File System Access API directory via `mountNativeFS` (browser only)

**Configuration example:**
```typescript
// Node.js with NODEFS (default)
const agent = new CodeAgent({
  tools: [],
  model: model,
  fsMode: 'nodefs',
  workDir: '/path/to/files',  // Node.js directory to mount
  mountPoint: '/mnt',         // Pyodide mount point
});

// Browser with File System Access API
const dirHandle = await showDirectoryPicker();
const agent = new CodeAgent({
  tools: [],
  model: model,
  fsMode: 'nativefs',
  directoryHandle: dirHandle,  // FileSystemDirectoryHandle
  mountPoint: '/mnt',
});
```

### Prompt Templates

YAML templates in `src/prompts/` define system prompts:
- `code-agent.yaml` - For CodeAgent (Python code generation)
- `toolcalling-agent.yaml` - For ToolCallingAgent (JSON tool calls)
- `template-loader.ts` - Loads and processes Handlebars-style templates

## Testing Patterns

### Mock Model Pattern
Tests use `createMockModel()` from `tests/fixtures/mock-model.ts`:

```typescript
const mockModel = createMockModel();
mockModel.addResponse({
  role: 'assistant',
  content: '',
  tool_calls: [{ id: '1', function: { name: 'tool', arguments: '{}' } }]
});
const agent = new ToolCallingAgent({ tools: [], model: mockModel });
```

### Environment Variables
- `USE_REAL_DATA=true` - Use real OpenAI API instead of mocks
- `OPENAI_API_KEY` - Required for real data tests
- `OPENAI_BASE_URL` - Optional custom endpoint
- `OPENAI_MODEL` - Optional model override

## Build System

### tsup Configurations
- `tsup.config.ts` - Node.js library build (ESM + CJS), multiple entry points
- `tsup.browser.config.ts` - Browser IIFE bundle, bundles all dependencies

### Export Structure
Package exports three subpaths:
- `smolagents-ts` - Core agents, memory, logger
- `smolagents-ts/models` - Model implementations
- `smolagents-ts/tools` - Built-in tools

## File Organization

```
src/
├── agents/          # Agent implementations
├── models/          # LLM model integrations
├── tools/           # Tool implementations (fs-tools, python-tools, etc.)
├── memory/          # AgentMemory, MemoryStep classes
├── prompts/         # YAML templates and template loader
├── types/           # TypeScript interfaces
├── utils/           # python-executor, validation, code parsing
└── logger/          # AgentLogger

tests/
├── utils/           # Utility and tool tests
└── README.md        # Testing documentation
```
