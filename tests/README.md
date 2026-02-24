# smolagents-ts Tests

Comprehensive test suite for the smolagents-ts TypeScript project.

## Structure

```
tests/
├── setup.ts                    # Test configuration
└── utils/                      # Utility tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Run specific test file
npm test tests/utils/node-fs-tools.test.ts

# Run in non-watch mode
npm test -- --run
```

## Running with Real Data

Integration tests can be configured to run against the real OpenAI API instead of using mock data. This is useful for verifying end-to-end functionality with a real LLM.

Use environment variables to opt in:

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

Tests should test complete workflows:

```typescript
import { describe, it, expect } from 'vitest';
import { ToolCallingAgent } from '../../src/agents/tool-calling-agent.js';

describe('Feature Integration', () => {
  it('should complete a full workflow', async () => {
    const agent = new ToolCallingAgent({
      tools: [],
      model: mockModel,
    });

    const result = await agent.run('Task');
    expect(result).toBe('Done');
  });
});
```

## Test Setup

Tests use the standard Vitest setup defined in `setup.ts`.

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
