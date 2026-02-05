# smolagents-ts Tests

Comprehensive test suite for the smolagents-ts TypeScript project.

## Structure

```
tests/
├── setup.ts                    # Test configuration
├── fixtures/                   # Test fixtures and mocks
│   ├── mock-model.ts          # Mock LLM model
│   ├── mock-tools.ts          # Mock tools
│   └── test-data.ts           # Test data
├── unit/                      # Unit tests
│   ├── agents/                # Agent tests
│   ├── models/                # Model tests
│   ├── memory/                # Memory tests
│   ├── tools/                 # Tool tests
│   └── utils/                 # Utility tests
├── integration/               # Integration tests
│   ├── agent-run.test.ts      # Complete agent runs
│   ├── code-agent.test.ts     # Code agent integration
│   ├── code-agent-real.test.ts # Code agent with real Pyodide
│   ├── streaming.test.ts      # Streaming functionality
│   └── tool-execution.test.ts # Tool execution
└── wasm/                      # Wasm/Python executor tests
    ├── python-executor-default-tools.test.ts
    └── python-executor-fs-tools.test.ts
```

## Running Tests

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Run E2E demo tests (Playwright)
npm run test:e2e

# Run WASM tests (Pyodide)
npm run test:wasm

# Run specific test file
npm test tests/unit/agents/tool-calling-agent.test.ts

# Run in non-watch mode
npm test -- --run
```

## Running with Real Data

Integration tests can be configured to run against the real OpenAI API instead of using mock data. This is useful for verifying end-to-end functionality with a real LLM.

Use environment variables to opt in:

```bash
USE_REAL_DATA=true OPENAI_API_KEY=sk-... npm test
```

Or use the dedicated script:

```bash
OPENAI_API_KEY=sk-... npm run test:real
```

Optional:

```bash
OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_MODEL=gpt-4o
```

Note: Some tests that rely on specific mock behaviors (like error injection or precise timing) will still run in mock mode even when `USE_REAL_DATA` is enabled, to ensure test stability.

## Writing Tests

### Unit Tests

Unit tests should focus on testing individual components in isolation:

```typescript
import { describe, it, expect } from 'vitest';

describe('ComponentName', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = doSomething(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

### Integration Tests

Integration tests should test complete workflows:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolCallingAgent } from '../../src/agents/tool-calling-agent.js';
import { createMockModel, mockFinalAnswerResponse } from '../fixtures/mock-model.js';

describe('Feature Integration', () => {
  let agent: ToolCallingAgent;
  let mockModel: ReturnType<typeof createMockModel>;

  beforeEach(() => {
    mockModel = createMockModel();
    agent = new ToolCallingAgent({
      tools: [],
      model: mockModel,
    });
  });

  it('should complete a full workflow', async () => {
    mockModel.addResponse(mockFinalAnswerResponse('Done'));

    const result = await agent.run('Task');

    expect(result).toBe('Done');
  });
});
```

## Test Fixtures

### Mock Model

The `MockModel` allows you to simulate LLM responses:

```typescript
import { createMockModel, mockToolCallResponse } from './fixtures/mock-model.js';

const model = createMockModel();
model.addResponse(mockToolCallResponse('calculator', { operation: 'add', a: 1, b: 2 }));
```

### Mock Tools

Pre-built mock tools for testing:

```typescript
import { MockCalculatorTool, MockSearchTool } from './fixtures/mock-tools.js';

const calculator = new MockCalculatorTool();
const search = new MockSearchTool();
```

## Coverage

We aim for:

- 80%+ overall coverage
- 90%+ coverage for critical paths (agent logic, tool execution)
- 70%+ coverage for utility functions

Run `npm run test:coverage` to generate coverage reports.

## Continuous Integration

Tests are automatically run on:

- Every pull request
- Every commit to main branch
- Before publishing to npm

## Debugging Tests

To debug tests in VS Code:

1. Set breakpoints in test files
2. Run "Debug Current Test File" from the command palette
3. Or use the test UI: `npm run test:ui`

## Best Practices

1. **Isolation**: Each test should be independent
2. **Clear naming**: Test names should describe what is being tested
3. **Arrange-Act-Assert**: Structure tests clearly
4. **Mock external dependencies**: Use fixtures for LLM and API calls
5. **Test edge cases**: Include error cases and boundary conditions
6. **Keep tests fast**: Use mocks instead of real API calls
