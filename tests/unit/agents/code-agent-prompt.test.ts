import { describe, it, expect } from 'vitest';
import { CodeAgent } from '../../../src/agents/code-agent.js';
import {
  BrowserListDirectoryTool,
  BrowserReadTextFileTool,
  BrowserGetFileInfoTool,
  type FileSystemDirectoryHandle,
} from '../../../src/tools/fs-tools.js';
import { createMockModel } from '../../fixtures/mock-model.js';

describe('CodeAgent system prompt with fs-tools', () => {
  it('prints system prompt for inspection', () => {
    const mockModel = createMockModel();
    const handle = {} as unknown as FileSystemDirectoryHandle;

    const agent = new CodeAgent({
      model: mockModel,
      tools: [
        new BrowserListDirectoryTool(handle),
        new BrowserReadTextFileTool(handle),
        new BrowserGetFileInfoTool(handle),
      ],
    });

    const prompt = agent.get_memory().system_prompt.system_prompt;
    console.log('--- CodeAgent system prompt (fs-tools) ---\n' + prompt);

    expect(prompt).toContain('def list_directory');
    expect(prompt).toContain('Important: This tool returns structured output!');
    expect(prompt).toContain('"DirectoryListing"');
  });
});
