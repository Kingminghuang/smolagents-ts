/**
 * Comprehensive CodeAgent validation test script
 * Tests CodeAgent's ability to use file system tools correctly
 */

import { config } from 'dotenv';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CodeAgent } from './src/agents/code-agent.js';
import { PyodideExecutor } from './src/utils/python-executor.js';
import { OpenAIModel } from './src/models/index.js';
import { EditTool } from './src/tools/edit.js';
import { ReadTool } from './src/tools/read.js';
import { WriteTool } from './src/tools/write.js';
import { LsTool } from './src/tools/ls.js';
import { FindTool } from './src/tools/find.js';
import { GrepTool } from './src/tools/grep.js';

// Load environment variables
config();

interface TestCase {
  name: string;
  task: string;
  setup?: (testDir: string) => void;
}

const testCases: TestCase[] = [
  // --- Read Tool Tests (1-11) ---
  {
    name: 'Test 1: Read normal file',
    task: "Create a file named 'test.txt' with content 'Hello, world!\nLine 2\nLine 3'. Then read it and return the content.",
  },
  {
    name: 'Test 2: Read non-existent file',
    task: "Try to read a file called 'nonexistent.txt' that doesn't exist. Catch the exception and return the error message.",
  },
  {
    name: 'Test 3: Read large file (line truncation)',
    setup: (testDir) => {
      const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
      writeFileSync(join(testDir, 'large.txt'), lines.join('\n'));
    },
    task: "Read the file 'large.txt' and check if truncation occurred. Return information about whether it was truncated.",
  },
  {
    name: 'Test 4: Read large file (byte truncation)',
    setup: (testDir) => {
      // Create lines that are long enough to hit byte limit before line limit
      const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: ${'x'.repeat(200)}`);
      writeFileSync(join(testDir, 'large-bytes.txt'), lines.join('\n'));
    },
    task: "Read the file 'large-bytes.txt'. It should be truncated by size. Return the last line read.",
  },
  {
    name: 'Test 5: Read with offset',
    setup: (testDir) => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      writeFileSync(join(testDir, 'offset-test.txt'), lines.join('\n'));
    },
    task: "Read file 'offset-test.txt' starting from line 51 (offset=51). Return the first line you see.",
  },
  {
    name: 'Test 6: Read with limit',
    setup: (testDir) => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      writeFileSync(join(testDir, 'limit-test.txt'), lines.join('\n'));
    },
    task: "Read the first 10 lines of 'limit-test.txt' (limit=10). Return the last line read.",
  },
  {
    name: 'Test 7: Read with offset and limit',
    setup: (testDir) => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      writeFileSync(join(testDir, 'offset-limit-test.txt'), lines.join('\n'));
    },
    task: "Read 'offset-limit-test.txt' starting at line 41 with a limit of 20 lines. Return the first and last lines read.",
  },
  {
    name: 'Test 8: Read offset beyond file',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'short.txt'), 'Line 1\nLine 2\nLine 3');
    },
    task: "Try to read 'short.txt' starting from line 100. Catch the error and return the error message.",
  },
  {
    name: 'Test 9: Truncation details',
    setup: (testDir) => {
      const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
      writeFileSync(join(testDir, 'large-file-details.txt'), lines.join('\n'));
    },
    task: "Read 'large-file-details.txt'. Verify that the output contains metadata about total lines and truncation. Return that metadata.",
  },
  {
    name: 'Test 10: Image MIME detection',
    setup: (testDir) => {
      const png1x1Base64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2Z0AAAAASUVORK5CYII=';
      const pngBuffer = Buffer.from(png1x1Base64, 'base64');
      writeFileSync(join(testDir, 'image.txt'), pngBuffer);
    },
    task: "Read 'image.txt'. Identify that it is an image and return its MIME type.",
  },
  {
    name: 'Test 11: Fake image as text',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'not-an-image.png'), 'definitely not a png');
    },
    task: "Read 'not-an-image.png'. Confirm it is read as text, not as an image.",
  },

  // --- Write Tool Tests (12-13) ---
  {
    name: 'Test 12: Write new file',
    task: "Write the text 'Test content' to a file called 'write-test.txt'. Return confirmation.",
  },
  {
    name: 'Test 13: Write with nested directories',
    task: "Write 'Nested content' to 'nested/dir/test.txt'. The parent directories don't exist yet. Return confirmation.",
  },

  // --- Edit Tool Tests (14-17) ---
  {
    name: 'Test 14: Edit file - replace text',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'edit-test.txt'), 'Hello, world!');
    },
    task: "Edit the file 'edit-test.txt' and replace 'world' with 'testing'. Return the new content.",
  },
  {
    name: 'Test 15: Edit file - text not found',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'edit-fail.txt'), 'Hello, world!');
    },
    task: "Try to edit 'edit-fail.txt' and replace 'nonexistent' (which doesn't exist) with 'testing'. Catch the exception and return the error message.",
  },
  {
    name: 'Test 16: Edit file - multiple occurrences',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'edit-dup.txt'), 'foo foo foo');
    },
    task: "Try to edit 'edit-dup.txt' to replace 'foo' with 'bar'. Since 'foo' appears multiple times, this should fail. Catch the error and return it.",
  },
  {
    name: 'Test 17: Edit file - trailing whitespace',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'trailing-ws.txt'), 'line one   \nline two  \nline three\n');
    },
    task: "Edit 'trailing-ws.txt'. Replace the block 'line one\nline two' (ignoring the trailing spaces in the file) with 'replaced'. Return the new content.",
  },

  // --- Grep Tool Tests (30-31) ---
  {
    name: 'Test 30: Grep search in file',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'search.txt'), 'first line\nmatch line\nlast line');
    },
    task: "Search for the pattern 'match' in the file 'search.txt'. Return the matching line with line number.",
  },
  {
    name: 'Test 31: Grep with limit and context',
    setup: (testDir) => {
      const content = ['before', 'match one', 'after', 'middle', 'match two', 'after two'].join(
        '\n'
      );
      writeFileSync(join(testDir, 'context.txt'), content);
    },
    task: "Search for 'match' in 'context.txt' with limit=1 and context=1. Return the result showing the match and context lines.",
  },

  // --- Find Tool Tests (32-33) ---
  {
    name: 'Test 32: Find hidden files',
    setup: (testDir) => {
      mkdirSync(join(testDir, '.secret'));
      writeFileSync(join(testDir, '.secret', 'hidden.txt'), 'hidden content');
      writeFileSync(join(testDir, 'visible.txt'), 'visible content');
    },
    task: 'Find all text files (**/*.txt) in the current directory, including hidden ones. Return the list of files found.',
  },
  {
    name: 'Test 33: Find respecting .gitignore',
    setup: (testDir) => {
      writeFileSync(join(testDir, '.gitignore'), 'ignored.txt\n');
      writeFileSync(join(testDir, 'ignored.txt'), 'ignored content');
      writeFileSync(join(testDir, 'kept.txt'), 'kept content');
    },
    task: "Find all text files (**/*.txt). Ensure 'ignored.txt' is NOT in the results because of the .gitignore file. Return the list of files found.",
  },

  // --- Ls Tool Tests (34) ---
  {
    name: 'Test 34: List directory contents',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'file1.txt'), 'content');
      mkdirSync(join(testDir, 'subdir'));
      writeFileSync(join(testDir, '.hidden'), 'secret');
    },
    task: 'List all files and directories in the current directory, including hidden files. Return the list.',
  },
];

async function runTests() {
  console.log('=== CodeAgent Comprehensive Validation ===\n');

  // Initialize OpenAI model
  const model = new OpenAIModel({
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.OPENAI_BASE_URL,
    defaultModel: process.env.OPENAI_MODEL || 'gpt-4',
  });

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Test: ${testCase.name}`);
    console.log('='.repeat(80));

    // Create fresh test directory for each test
    const testDir = join(tmpdir(), `codeagent-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    try {
      // Setup test environment
      if (testCase.setup) {
        testCase.setup(testDir);
      }

      // Initialize CodeAgent with tools
      // We pass an explicit executor to configure the workDir to match the test directory
      // We pass undefined for authorizedImports to use the default BASE_BUILTIN_MODULES
      const executor = new PyodideExecutor(undefined, { workDir: testDir });

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

      console.log(`Task: ${testCase.task}\n`);

      // Run the agent
      const result = await agent.run(testCase.task);

      console.log(`\n✅ PASS: ${testCase.name}`);
      console.log(
        `Result: ${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}`
      );
      passCount++;
    } catch (error: any) {
      console.log(`\n❌ FAIL: ${testCase.name}`);
      console.log(`Error: ${error.message}`);
      failCount++;
    } finally {
      // Cleanup
      rmSync(testDir, { recursive: true, force: true });
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(
    `Test Summary: ${passCount} passed, ${failCount} failed out of ${testCases.length} tests`
  );
  console.log('='.repeat(80));

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(console.error);
