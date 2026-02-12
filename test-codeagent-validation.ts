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
    {
        name: "Read normal file",
        task: "Create a file named 'test.txt' with content 'Hello, world!\\nLine 2\\nLine 3'. Then read it and return the content.",
    },
    {
        name: "Read non-existent file",
        task: "Try to read a file called 'nonexistent.txt' that doesn't exist. Return the error message.",
    },
    {
        name: "Read large file (truncation)",
        setup: (testDir) => {
            const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
            writeFileSync(join(testDir, 'large.txt'), lines.join('\n'));
        },
        task: "Read the file 'large.txt' and check if truncation occurred. Return information about whether it was truncated.",
    },
    {
        name: "Read with offset",
        setup: (testDir) => {
            const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
            writeFileSync(join(testDir, 'offset-test.txt'), lines.join('\n'));
        },
        task: "Read file 'offset-test.txt' starting from line 51 (offset=51). Return the first line you see.",
    },
    {
        name: "Write new file",
        task: "Write the text 'Test content' to a file called 'new-file.txt'. Return confirmation.",
    },
    {
        name: "Write with nested directories",
        task: "Write 'Nested content' to 'nested/deep/dir/file.txt'. The parent directories don't exist yet. Return confirmation.",
    },
    {
        name: "Edit file - replace text",
        setup: (testDir) => {
            writeFileSync(join(testDir, 'edit-test.txt'), 'Hello, world!');
        },
        task: "Edit the file 'edit-test.txt' and replace 'world' with 'testing'. Return the new content.",
    },
    {
        name: "Edit file - text not found",
        setup: (testDir) => {
            writeFileSync(join(testDir, 'edit-fail.txt'), 'Hello, world!');
        },
        task: "Try to edit 'edit-fail.txt' and replace 'nonexistent' with 'testing'. Return the error message.",
    },
    {
        name: "Grep search in file",
        setup: (testDir) => {
            writeFileSync(join(testDir, 'search.txt'), 'first line\\nmatch line\\nlast line');
        },
        task: "Search for the pattern 'match' in the file 'search.txt'. Return the matching line with line number.",
    },
    {
        name: "Find files by pattern",
        setup: (testDir) => {
            writeFileSync(join(testDir, 'file1.txt'), 'content1');
            writeFileSync(join(testDir, 'file2.txt'), 'content2');
            mkdirSync(join(testDir, 'subdir'));
            writeFileSync(join(testDir, 'subdir', 'file3.txt'), 'content3');
        },
        task: "Find all .txt files in the current directory and subdirectories. Return the list of file paths.",
    },
    {
        name: "List directory contents",
        setup: (testDir) => {
            writeFileSync(join(testDir, 'file1.txt'), 'content');
            mkdirSync(join(testDir, 'subdir'));
            writeFileSync(join(testDir, '.hidden'), 'secret');
        },
        task: "List all files and directories in the current directory, including hidden files. Return the list.",
    },
];

async function runTests() {
    console.log('=== CodeAgent Comprehensive Validation ===\\n');

    // Initialize OpenAI model
    const model = new OpenAIModel({
        apiKey: process.env.OPENAI_API_KEY!,
        baseURL: process.env.OPENAI_BASE_URL,
        defaultModel: process.env.OPENAI_MODEL || 'gpt-4',
    });

    let passCount = 0;
    let failCount = 0;

    for (const testCase of testCases) {
        console.log(`\\n${'='.repeat(80)}`);
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
            const executor = new PyodideExecutor(
                undefined,
                { workDir: testDir }
            );

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

            console.log(`Task: ${testCase.task}\\n`);

            // Run the agent
            const result = await agent.run(testCase.task);

            console.log(`\\n✅ PASS: ${testCase.name}`);
            console.log(`Result: ${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}`);
            passCount++;

        } catch (error: any) {
            console.log(`\\n❌ FAIL: ${testCase.name}`);
            console.log(`Error: ${error.message}`);
            failCount++;
        } finally {
            // Cleanup
            rmSync(testDir, { recursive: true, force: true });
        }
    }

    console.log(`\\n${'='.repeat(80)}`);
    console.log(`Test Summary: ${passCount} passed, ${failCount} failed out of ${testCases.length} tests`);
    console.log('='.repeat(80));

    process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(console.error);
