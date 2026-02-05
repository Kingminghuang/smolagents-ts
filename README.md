# smolagents-ts

A lightweight, TypeScript-native AI agent framework with tool calling capabilities. This is a TypeScript port of [smolagents](https://github.com/huggingface/smolagents).

## Features

- 🎯 **Tool Calling**: Native support for function calling with any LLM
- 🔄 **Streaming**: Stream agent events; optionally stream model deltas (if the model supports it)
- 🧩 **Modular**: Easy to extend with custom tools and models
- 🤖 **OpenAI Model Included**: `OpenAIModel` built on the official `openai` SDK
- 🐍 **Code Agent**: Optional `CodeAgent` that executes Python via Pyodide
- 🌐 **Browser Bundle**: Build a browser-friendly bundle for demos and E2E tests
- 🎨 **Type-Safe**: Full TypeScript support with comprehensive types
- 🚀 **Production Ready**: Built for both Node.js and browser environments

## Installation

```bash
npm install smolagents-ts
# or
yarn add smolagents-ts
# or
pnpm add smolagents-ts
```

You'll also need to install your preferred LLM client:

```bash
# For OpenAI
npm install openai

# Vercel AI SDK is listed as an optional peer dependency for future integrations
# (not currently used by the built-in models)
# npm install ai @ai-sdk/openai
```

## Quick Start

```typescript
import { ToolCallingAgent } from 'smolagents-ts';
import { OpenAIModel } from 'smolagents-ts/models';
import { SearchTool, CalculatorTool } from 'smolagents-ts/tools';

// Create an agent
const agent = new ToolCallingAgent({
  tools: [new SearchTool(), new CalculatorTool()],
  model: new OpenAIModel({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  }),
  // If true, yields token/tool-call deltas from the model during agent streaming.
  // Requires a model that implements generate_stream (OpenAIModel does).
  stream_outputs: true,
});

// Run a task
const result = await agent.run('What is 15 * 7?');
console.log(result); // 105

// Stream results
for await (const event of agent.run('Search for latest AI news', { stream: true })) {
  console.log(event);
}
```

## Notes

- `SearchTool` and `CodeExecutorTool` are placeholders in this repo (they don’t call a real web search / sandbox by default).
- `final_answer` is automatically added unless `add_base_tools: false` is set.

## Documentation

- Examples: [examples/](./examples/)
- Demo page: [demo/README.md](./demo/README.md)
- Tests overview: [tests/README.md](./tests/README.md)
- Generate TypeDoc locally: `npm run docs`

## Configuration

For production applications, we recommend loading configuration from environment variables.

```typescript
// .env
// OPENAI_API_KEY=sk-...
// OPENAI_BASE_URL=https://...
// OPENAI_MODEL=gpt-4o

import { OpenAIModel } from 'smolagents-ts/models';

const model = new OpenAIModel({
  apiKey: process.env.OPENAI_API_KEY, // Required
  baseURL: process.env.OPENAI_BASE_URL, // Optional: for custom endpoints
  defaultModel: process.env.OPENAI_MODEL, // Optional: defaults to 'gpt-4o'
});
```

See [examples/configuration.ts](./examples/configuration.ts) for a complete example using `dotenv`.

## Architecture

smolagents-ts follows a modular architecture:

- **Agents**: Core agent implementations (ToolCallingAgent, CodeAgent)
- **Models**: LLM integrations (currently OpenAI via `OpenAIModel`)
- **Tools**: Extensible tool system (includes a built-in `final_answer` tool)
- **Memory**: Conversation history and state management
- **Logger**: Configurable logging system

## Examples

Check out the [examples](./examples/) directory for more use cases:

- Basic usage
- Streaming responses
- Parallel tool execution
- Custom tools
- Multi-agent systems
- Browser integration
- Next.js integration

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Build browser bundle (demo + E2E)
npm run build:browser

# Run tests
npm test

# Run E2E demo tests (Playwright)
npm run test:e2e

# Run tests with UI
npm run test:ui

# Lint
npm run lint

# Format code
npm run format

# Type-check only
npm run type-check
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Credits

This project is a TypeScript port of [smolagents](https://github.com/huggingface/smolagents) by Hugging Face.
