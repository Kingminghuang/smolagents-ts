/**
 * Find and Grep tool validation test script
 */

import { config } from 'dotenv';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CodeAgent } from './src/agents/code-agent.js';
import { PyodideExecutor } from './src/utils/python-executor.js';
import { OpenAIModel } from './src/models/index.js';
import { FindTool } from './src/tools/find.js';
import { GrepTool } from './src/tools/grep.js';
import { LsTool } from './src/tools/ls.js';

config();

interface TestCase {
  name: string;
  task: string;
  setup?: (testDir: string) => void;
  validate?: (result: any, testDir: string) => boolean | string;
}

const testCases: TestCase[] = [
  // --- Grep Tool Tests ---
  {
    name: 'Test 30: Grep search in file',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'search.txt'), 'first line\nmatch line\nlast line');
    },
    task: "Search for the pattern 'match' in the file 'search.txt'. Return the matching line with line number.",
    validate: (result) => {
      const str = typeof result === 'string' ? result : JSON.stringify(result);
      return str.includes('match') && (str.includes('2:') || str.includes('line'));
    }
  },
  {
    name: 'Test 31: Grep with limit and context',
    setup: (testDir) => {
      const content = ['before', 'match one', 'after', 'middle', 'match two', 'after two'].join('\n');
      writeFileSync(join(testDir, 'context.txt'), content);
    },
    task: "Search for 'match' in 'context.txt' with limit=1 and context=1. Return the result showing the match and context lines.",
    validate: (result) => {
      const str = typeof result === 'string' ? result : JSON.stringify(result);
      // Should show 3 lines: before, match one, after (context=1 on each side)
      return str.includes('before') && str.includes('match one') && str.includes('after');
    }
  },

  // --- Find Tool Tests ---
  {
    name: 'Test 32: Find hidden files',
    setup: (testDir) => {
      mkdirSync(join(testDir, '.secret'));
      writeFileSync(join(testDir, '.secret', 'hidden.txt'), 'hidden content');
      writeFileSync(join(testDir, 'visible.txt'), 'visible content');
    },
    task: 'Find all text files (**/*.txt) in the current directory, including hidden ones. Return the list of files found.',
    validate: (result, testDir) => {
      const str = typeof result === 'string' ? result : JSON.stringify(result);
      // Should find both .secret/hidden.txt and visible.txt
      return str.includes('.secret/hidden.txt') && str.includes('visible.txt');
    }
  },
  {
    name: 'Test 33: Find respecting .gitignore',
    setup: (testDir) => {
      writeFileSync(join(testDir, '.gitignore'), 'ignored.txt\n');
      writeFileSync(join(testDir, 'ignored.txt'), 'ignored content');
      writeFileSync(join(testDir, 'kept.txt'), 'kept content');
    },
    task: "Find all text files (**/*.txt). Ensure 'ignored.txt' is NOT in the results because of the .gitignore file. Return the list of files found.",
    validate: (result, testDir) => {
      const str = typeof result === 'string' ? result : JSON.stringify(result);
      // Should NOT contain ignored.txt but SHOULD contain kept.txt
      return !str.includes('ignored.txt') && str.includes('kept.txt');
    }
  },

  // --- Ls Tool Test ---
  {
    name: 'Test 34: List directory contents',
    setup: (testDir) => {
      writeFileSync(join(testDir, 'file1.txt'), 'content');
      mkdirSync(join(testDir, 'subdir'));
      writeFileSync(join(testDir, '.hidden'), 'secret');
    },
    task: 'List all files and directories in the current directory, including hidden files. Return the list.',
    validate: (result) => {
      const str = typeof result === 'string' ? result : JSON.stringify(result);
      return str.includes('file1.txt') && str.includes('subdir/') && str.includes('.hidden');
    }
  },
];

async function runTests() {
  console.log('=== Find/Grep Tool Validation ===\n');

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

    const testDir = join(tmpdir(), `codeagent-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    try {
      if (testCase.setup) {
        testCase.setup(testDir);
      }

      const executor = new PyodideExecutor(undefined, { workDir: testDir });
      const agent = new CodeAgent({
        model,
        executor,
        tools: [
          new GrepTool(testDir),
          new FindTool(testDir),
          new LsTool(testDir),
        ],
      });

      console.log(`Task: ${testCase.task}\n`);

      const result = await agent.run(testCase.task);

      // Validate result if validation function exists
      let validationPassed = true;
      if (testCase.validate) {
        const validation = testCase.validate(result, testDir);
        if (typeof validation === 'string') {
          console.log(`Validation failed: ${validation}`);
          validationPassed = false;
        } else {
          validationPassed = validation;
        }
      }

      if (validationPassed) {
        console.log(`\n✅ PASS: ${testCase.name}`);
        console.log(`Result: ${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}`);
        passCount++;
      } else {
        console.log(`\n❌ FAIL: ${testCase.name} (validation failed)`);
        console.log(`Result: ${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}`);
        failCount++;
      }
    } catch (error: any) {
      console.log(`\n❌ FAIL: ${testCase.name}`);
      console.log(`Error: ${error.message}`);
      failCount++;
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Test Summary: ${passCount} passed, ${failCount} failed out of ${testCases.length} tests`);
  console.log('='.repeat(80));

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(console.error);
