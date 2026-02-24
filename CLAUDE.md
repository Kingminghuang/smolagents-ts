# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

smolagents-ts is a TypeScript-native AI agent framework with tool calling capabilities. It is a port of the Python [smolagents](https://github.com/huggingface/smolagents) library.

## Common Commands

### Build
- `npm run build` - Build the library (ESM + CJS) via `tsup`
- `npm run build:browser` - Build browser IIFE bundle for demos/E2E tests
- `npm run build:demo` - Build the demo application
- `npm run dev` - Watch mode for development
- `npm run type-check` - TypeScript type checking only
- `npm run docs` - Generate TypeDoc documentation

### Test
- `npm test` - Run unit tests with Vitest (uses mock data by default)
- `npm run test:real` - Run tests with real OpenAI API (requires `OPENAI_API_KEY`)
- `npm run test:wasm` - Run WASM/Pyodide tests (separate config)
- `npm run test:e2e` - Run Playwright E2E browser tests (requires `build:browser` first)
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:ui` - Open Vitest UI

**Running a single test:**
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

## Style Guidelines

- **TypeScript**: Strict mode enabled (`"strict": true`). No unused locals or parameters.
- **Target**: ES2022.
- **Formatting**: Prettier is the authority on formatting.
- **Imports**: Use `.js` extension for local imports in source files (e.g., `import { Foo } from './foo.js'`).
- **File Naming**: Kebab-case for files (e.g., `tool-calling-agent.ts`).

## Architecture

### Core Agent Hierarchy
```
MultiStepAgent (abstract base)
├── ToolCallingAgent - Uses LLM tool-calling (JSON mode) to execute tools
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
- `OpenAIModel` is the primary implementation.
- Streaming is optional (`generate_stream?`).
- Models must convert responses to `ChatMessage` format with `tool_calls` array.

### Tool System
All tools extend `BaseTool` (`src/tools/base-tool.ts`) and implement:
- `name`, `description`, `inputs` - Metadata for LLM function calling.
- `forward(args)` - Execution logic returning a Promise.
- `to_dict()` - Converts to OpenAI function-calling format (inherited from base).

Tools are registered in `src/tools/index.ts` exports.

### Python Execution (CodeAgent)
`PyodideExecutor` (`src/utils/python-executor.ts`) runs Python in-browser or Node.js:
- Loads Pyodide from CDN in browser.
- Supports `authorized_imports` whitelist.
- Tools can provide `pythonCode` property for Python implementations.
- **File System Modes**:
  - `fsMode: 'nodefs'` (default): Mounts local directory via NODEFS (Node.js only).
  - `fsMode: 'nativefs'`: Mounts browser File System Access API directory via `mountNativeFS` (browser only).

## Development Tasks

### Adding a New Tool
1. Create a new file in `src/tools/` (e.g., `my-tool.ts`).
2. Extend `BaseTool` and implement required abstract properties/methods.
3. Define strict input types using `ToolInput` interface.
4. Export the tool in `src/tools/index.ts`.
5. Add unit tests in `tests/`.

### Mock Model for Testing
Use `createMockModel()` from `tests/fixtures/mock-model.ts` to simulate LLM responses:

```typescript
import { createMockModel } from '../../fixtures/mock-model';

const mockModel = createMockModel();
mockModel.addResponse({
  role: 'assistant',
  content: '',
  tool_calls: [{ id: '1', function: { name: 'my_tool', arguments: '{}' } }]
});
const agent = new ToolCallingAgent({ tools: [], model: mockModel });
```

### Environment Variables
- `USE_REAL_DATA=true` - Use real OpenAI API instead of mocks.
- `OPENAI_API_KEY` - Required for real data tests.
- `OPENAI_BASE_URL` - Optional custom endpoint.
- `OPENAI_MODEL` - Optional model override.

## Build System

### tsup Configurations
- `tsup.config.ts`: Main library build (ESM + CJS). Entry points:
  - `src/index.ts` -> `dist/index.js`
  - `src/models/index.ts` -> `dist/models/index.js`
  - `src/tools/index.ts` -> `dist/tools/index.js`
  - `src/utils/index.ts` -> `dist/utils/index.js`
  - `src/logger/index.ts` -> `dist/logger/index.js`
- `tsup.browser.config.ts`: Browser IIFE bundle (`dist-browser/smolagents.browser.js`).

## File Organization
```
src/
├── agents/          # Agent implementations
├── models/          # LLM model integrations
├── tools/           # Tool implementations
├── memory/          # AgentMemory, MemoryStep classes
├── prompts/         # YAML templates and template loader
├── types/           # TypeScript interfaces
├── utils/           # python-executor, validation, code parsing
└── logger/          # AgentLogger

tests/
├── unit/            # Unit tests
├── e2e/             # Playwright E2E tests
└── fixtures/        # Test fixtures (mock models, etc.)
```
