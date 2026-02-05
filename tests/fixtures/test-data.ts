/**
 * Test data for various test scenarios
 */
import type { ChatMessage, ToolCall } from '../../src/types/index.js';

export const testMessages: ChatMessage[] = [
  {
    role: 'system',
    content: 'You are a helpful assistant.',
  },
  {
    role: 'user',
    content: 'What is 2 + 2?',
  },
  {
    role: 'assistant',
    content: 'Let me calculate that for you.',
    tool_calls: [
      {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'calculator',
          arguments: '{"operation":"add","a":2,"b":2}',
        },
      },
    ],
  },
  {
    role: 'tool',
    content: '4',
    tool_call_id: 'call_123',
  },
  {
    role: 'assistant',
    content: 'The answer is 4.',
  },
];

export const testToolCalls: ToolCall[] = [
  {
    id: 'call_1',
    name: 'calculator',
    arguments: { operation: 'add', a: 1, b: 2 },
  },
  {
    id: 'call_2',
    name: 'search',
    arguments: { query: 'AI news' },
  },
];

export const testTasks = {
  simple: 'What is 2 + 2?',
  complex: 'Search for the latest AI news and calculate the average sentiment score.',
  multiStep: 'First search for Python tutorials, then summarize the top 3 results.',
  error: 'This task will cause an error',
};

export const testSystemPrompts = {
  default: 'You are a helpful AI assistant with access to various tools.',
  calculator: 'You are a calculator assistant. Use the calculator tool to perform arithmetic operations.',
  search: 'You are a search assistant. Use the search tool to find information online.',
};

export const testPromptTemplates = {
  system_prompt: `You are a helpful AI assistant.

Available tools:
{{#each tools}}
- {{name}}: {{description}}
{{/each}}

Instructions:
{{custom_instructions}}`,
  planning: {
    initial_plan: 'Create a plan to complete the following task: {{task}}',
    update_plan_pre_messages: 'Previous plan:',
    update_plan_post_messages: 'Update the plan based on observations.',
  },
  managed_agent: {
    task: 'Delegate the following task: {{task}}',
    report: 'Report on the task: {{report}}',
  },
  final_answer: {
    pre_messages: 'Based on the information gathered:',
    post_messages: 'Provide your final answer.',
  },
};

export const testTokenUsage = {
  input_tokens: 100,
  output_tokens: 50,
};

export const testTiming = {
  start_time: Date.now(),
  end_time: Date.now() + 1000,
  duration: 1000,
};
