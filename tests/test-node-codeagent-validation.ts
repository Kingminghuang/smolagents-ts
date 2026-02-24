/**
 * Node-WASM CodeAgent Baseline Generator
 * 
 * This script runs all test cases using Node-WASM (NODEFS mode) and generates
 * a JSON baseline file for comparison with Web-WASM (nativefs mode).
 * 
 * Usage:
 *   npx tsx test-node-codeagent-validation.ts
 * 
 * Output:
 *   test-node-baseline.json - Contains all test results
 */

import { config } from 'dotenv';
import { mkdirSync, rmSync, writeFileSync, rmdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CodeAgent } from '../src/agents/code-agent.js';
import { PyodideExecutor } from '../src/utils/python-executor.js';
import { OpenAIModel } from '../src/models/index.js';
import { ReadTool } from '../src/tools/read.js';
import { WriteTool } from '../src/tools/write.js';
import { EditTool } from '../src/tools/edit.js';
import { GrepTool } from '../src/tools/grep.js';
import { FindTool } from '../src/tools/find.js';
import { LsTool } from '../src/tools/ls.js';

// Load environment variables
config();

// Test result interface
interface TestResult {
  testId: string;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  output: string;
  error?: string;
  duration: number;
}

interface BaselineOutput {
  timestamp: string;
  environment: 'node-wasm';
  fsMode: 'nodefs';
  totalTests: number;
  passed: number;
  failed: number;
  results: TestResult[];
}

interface TestCase {
  id: string;
  name: string;
  setup?: (testDir: string) => void;
  task: string;
}

// All test cases from the spec
const testCases: TestCase[] = [
  // --- Read Tool Tests (1-11) ---
  {
    id: 'test_read_01',
    name: 'Test 1: Read normal file',
    task: `Create a file named 'test.txt' with the content:
Hello, world!
Line 2
Line 3
Then read the file test.txt.
Finally output the read result.`,
  },
  {
    id: 'test_read_02',
    name: 'Test 2: Read non-existent file',
    task: `Ensure that a file named 'nonexistent.txt' does not exist (delete it if it does). 
Then try to read the file nonexistent.txt and catch any error.
Finally output the error message.`,
  },
  {
    id: 'test_read_03',
    name: 'Test 3: Truncate line limit',
    setup: (testDir) => {
      const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
      writeFileSync(join(testDir, 'large.txt'), lines.join('\n'));
    },
    task: `Read the file 'large.txt' and return information about whether it was truncated.`,
  },
  {
    id: 'test_read_04',
    name: 'Test 4: Truncate byte limit',
    setup: (testDir) => {
      const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: ${'x'.repeat(200)}`);
      writeFileSync(join(testDir, 'large-bytes.txt'), lines.join('\n'));
    },
    task: `Read the file 'large-bytes.txt'. It should be truncated by size. Return the last line read.`,
  },
  {
    id: 'test_read_05',
    name: 'Test 5: Read with offset',
    setup: (testDir) => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      writeFileSync(join(testDir, 'offset-test.txt'), lines.join('\n'));
    },
    task: `Read file 'offset-test.txt' starting from line 51 (offset=51). Return the first line you see.`,
  },
  {
    id: 'test_read_06',
    name: 'Test 6: Read with limit',
    setup: (testDir) => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      writeFileSync(join(testDir, 'limit-test.txt'), lines.join('\n'));
    },
    task: `Read the first 10 lines of 'limit-test.txt' (limit=10). Return the last line read.`,
  },
  {
    id: 'test_read_07',
    name: 'Test 7: Read with offset and limit',
    setup: (testDir) => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      writeFileSync(join(testDir, 'offset-limit-test.txt'), lines.join('\n'));
    },
    task: `Read 'offset-limit-test.txt' starting at line 41 with a limit of 20 lines. Return the first and last lines read.`,
  },
  {
    id: 'test_read_08',
    name: 'Test 8: Offset beyond file',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'short.txt'), 'Line 1\nLine 2\nLine 3');
    },
    task: `Try to read 'short.txt' starting from line 100. Catch the error and return the error message.`,
  },
  {
    id: 'test_read_09',
    name: 'Test 9: Truncation details',
    setup: (testDir) => {
      const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
      writeFileSync(join(testDir, 'large-file-details.txt'), lines.join('\n'));
    },
    task: `Read 'large-file-details.txt'. Verify that the output contains metadata about total lines and truncation. Return that metadata.`,
  },
  {
    id: 'test_read_10',
    name: 'Test 10: Image MIME detection',
    setup: (testDir) => {
      const png1x1Base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2Z0AAAAASUVORK5CYII=';
      const pngBuffer = Buffer.from(png1x1Base64, 'base64');
      writeFileSync(join(testDir, 'image.txt'), pngBuffer);
    },
    task: `Read 'image.txt'. Identify that it is an image and return its MIME type.`,
  },
  {
    id: 'test_read_11',
    name: 'Test 11: Fake image as text',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'not-an-image.png'), 'definitely not a png');
    },
    task: `Read 'not-an-image.png'. Confirm it is read as text, not as an image.`,
  },

  // --- Write Tool Tests (12-13) ---
  {
    id: 'test_write_12',
    name: 'Test 12: Write new file',
    task: `Write the text 'Test content' to a file called 'write-test.txt'. Return confirmation.`,
  },
  {
    id: 'test_write_13',
    name: 'Test 13: Write with nested directories',
    task: `Write 'Nested content' to 'nested/dir/test.txt'. The parent directories don't exist yet. Return confirmation.`,
  },

  // --- Edit Tool Tests (14-17) ---
  {
    id: 'test_edit_14',
    name: 'Test 14: Edit file - replace text',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'edit-test.txt'), 'Hello, world!');
    },
    task: `Edit the file 'edit-test.txt' and replace 'world' with 'testing'. Return the new content.`,
  },
  {
    id: 'test_edit_15',
    name: 'Test 15: Edit file - text not found',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'edit-fail.txt'), 'Hello, world!');
    },
    task: `Try to edit 'edit-fail.txt' and replace 'nonexistent' (which doesn't exist) with 'testing'. Catch the exception and return the error message.`,
  },
  {
    id: 'test_edit_16',
    name: 'Test 16: Edit file - multiple occurrences',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'edit-dup.txt'), 'foo foo foo');
    },
    task: `Try to edit 'edit-dup.txt' to replace 'foo' with 'bar'. Since 'foo' appears multiple times, this should fail. Catch the error and return it.`,
  },
  {
    id: 'test_edit_17',
    name: 'Test 17: Edit file - trailing whitespace',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'trailing-ws.txt'), 'line one   \nline two  \nline three\n');
    },
    task: `Edit 'trailing-ws.txt'. Replace the block 'line one\nline two' (ignoring the trailing spaces in the file) with 'replaced'. Return the new content.`,
  },

  // --- Grep Tool Tests (30-31) ---
  {
    id: 'test_grep_30',
    name: 'Test 30: Grep search in file',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'search.txt'), 'first line\nmatch line\nlast line');
    },
    task: `Search for the pattern 'match' in the file 'search.txt'. Return the matching line with line number.`,
  },
  {
    id: 'test_grep_31',
    name: 'Test 31: Grep with limit and context',
    setup: (testDir) => {
      const content = ['before', 'match one', 'after', 'middle', 'match two', 'after two'].join('\n');
      writeFileSync(join(testDir, 'context.txt'), content);
    },
    task: `Search for 'match' in 'context.txt' with limit=1 and context=1. Return the result showing the match and context lines.`,
  },

  // --- Find Tool Tests (32) ---
  {
    id: 'test_find_32',
    name: 'Test 32: Find hidden files',
    setup: (testDir) => {
      mkdirSync(join(testDir, '.secret'));
      writeFileSync(join(testDir, '.secret', 'hidden.txt'), 'hidden content');
      writeFileSync(join(testDir, 'visible.txt'), 'visible content');
    },
    task: `Find all text files (**/*.txt) in the current directory, including hidden ones. Return the list of files found.`,
  },

  // --- Ls Tool Tests (33) ---
  {
    id: 'test_ls_33',
    name: 'Test 33: List directory contents',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'file1.txt'), 'content');
      mkdirSync(join(testDir, 'subdir'));
      writeFileSync(join(testDir, '.hidden'), 'secret');
    },
    task: `List all files and directories in the current directory, including hidden files. Return the list.`,
  },
];

async function runTests(): Promise<BaselineOutput> {
  console.log('=== Node-WASM CodeAgent Baseline Generator ===\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  // Initialize OpenAI model
  const model = new OpenAIModel({
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.OPENAI_BASE_URL,
    defaultModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  });

  const results: TestResult[] = [];
  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Running: ${testCase.name}`);
    console.log('='.repeat(80));

    const testDir = join(tmpdir(), `codeagent-baseline-${testCase.id}-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    const startTime = Date.now();
    let result: TestResult = {
      testId: testCase.id,
      name: testCase.name,
      status: 'skip',
      output: '',
      duration: 0,
    };

    try {
      // Setup test environment
      if (testCase.setup) {
        testCase.setup(testDir);
      }

      // Initialize CodeAgent with NODEFS mode
      const executor = new PyodideExecutor(undefined, { 
        workDir: testDir,
        fsMode: 'nodefs',
      });

      const agent = new CodeAgent({
        model,
        executor,
        tools: [
          new ReadTool(testDir),
          new WriteTool(testDir),
          new EditTool(testDir),
          new GrepTool(testDir),
          new FindTool(testDir),
          new LsTool(testDir),
        ],
      });

      console.log(`Task: ${testCase.task.substring(0, 100)}...\n`);

      // Run the agent
      const output = await agent.run(testCase.task);
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);

      result = {
        testId: testCase.id,
        name: testCase.name,
        status: 'pass',
        output: outputStr,
        duration: Date.now() - startTime,
      };

      console.log(`\n✅ PASS: ${testCase.name}`);
      console.log(`Output: ${outputStr.substring(0, 200)}...`);
      passCount++;

      await agent.cleanup();
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      result = {
        testId: testCase.id,
        name: testCase.name,
        status: 'fail',
        output: '',
        error: errorMsg,
        duration: Date.now() - startTime,
      };

      console.log(`\n❌ FAIL: ${testCase.name}`);
      console.log(`Error: ${errorMsg}`);
      failCount++;
    } finally {
      // Cleanup
      rmSync(testDir, { recursive: true, force: true });
      results.push(result);
    }
  }

  const baseline: BaselineOutput = {
    timestamp: new Date().toISOString(),
    environment: 'node-wasm',
    fsMode: 'nodefs',
    totalTests: testCases.length,
    passed: passCount,
    failed: failCount,
    results,
  };

  // Save baseline to file
  const baselinePath = join(process.cwd(), 'test-node-baseline.json');
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Baseline Summary: ${passCount} passed, ${failCount} failed out of ${testCases.length} tests`);
  console.log(`Baseline saved to: ${baselinePath}`);
  console.log('='.repeat(80));

  return baseline;
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
