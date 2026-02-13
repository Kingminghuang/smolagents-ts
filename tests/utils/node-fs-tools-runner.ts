/**
 * Test runner that outputs tool execution results without assertions.
 * This file is used to generate expected outputs for CodeAgent validation.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
    NodeReadTool,
    NodeWriteTool,
    NodeEditTool,
    NodeLsTool,
    NodeGrepTool,
    NodeFindTool
} from "./node-fs-tools.js";

function getTextOutput(result: any): string {
    return (
        result.content
            ?.filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n") || ""
    );
}

async function runTests() {
    const testDir = join(tmpdir(), `smolagents-fs-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    const readTool = new NodeReadTool(testDir);
    const writeTool = new NodeWriteTool(testDir);
    const editTool = new NodeEditTool(testDir);
    const lsTool = new NodeLsTool(testDir);
    const grepTool = new NodeGrepTool(testDir);
    const findTool = new NodeFindTool(testDir);

    console.log("=== Node FS Tools Test Output ===\n");

    // Test 1: Read file contents that fit within limits
    console.log("--- Test 1: Read file contents that fit within limits ---");
    try {
        const testFile = join(testDir, "test.txt");
        const content = "Hello, world!\nLine 2\nLine 3";
        writeFileSync(testFile, content);
        const result = await readTool.forward({ path: testFile });
        console.log(getTextOutput(result));
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 2: Handle non-existent files
    console.log("--- Test 2: Handle non-existent files ---");
    try {
        const testFile = "nonexistent.txt";
        const result = await readTool.forward({ path: testFile });
        console.log(getTextOutput(result));
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 3: Truncate files exceeding line limit
    console.log("--- Test 3: Truncate files exceeding line limit ---");
    try {
        const testFile = join(testDir, "large-2500.txt");
        const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
        writeFileSync(testFile, lines.join("\n"));
        const result = await readTool.forward({ path: testFile });
        const output = getTextOutput(result);
        console.log(output.substring(0, 200) + "...");
        console.log("Contains 'Line 1':", output.includes("Line 1"));
        console.log("Contains 'Line 2000':", output.includes("Line 2000"));
        console.log("Contains 'Line 2001':", output.includes("Line 2001"));
        console.log("Contains truncation message:", output.includes("[Showing lines 1-2000 of 2500"));
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 4: Truncate when byte limit exceeded
    console.log("--- Test 4: Truncate when byte limit exceeded ---");
    try {
        const testFile = join(testDir, "large-bytes.txt");
        const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: ${"x".repeat(200)}`);
        writeFileSync(testFile, lines.join("\n"));
        const result = await readTool.forward({ path: testFile });
        const output = getTextOutput(result);
        console.log(output.substring(0, 200) + "...");
        console.log("Contains 'Line 1:':", output.includes("Line 1:"));
        console.log("Contains byte limit pattern:", /\[Showing lines 1-\d+ of 500 \(.*[KM]B limit\)\. Use offset=\d+ to continue\.\]/.test(output));
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 5: Handle offset parameter
    console.log("--- Test 5: Handle offset parameter ---");
    try {
        const testFile = join(testDir, "offset-test.txt");
        const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
        writeFileSync(testFile, lines.join("\n"));
        const result = await readTool.forward({ path: testFile, offset: 51 });
        const output = getTextOutput(result);
        console.log("Contains 'Line 50':", output.includes("Line 50"));
        console.log("Contains 'Line 51':", output.includes("Line 51"));
        console.log("Contains 'Line 100':", output.includes("Line 100"));
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 6: Handle limit parameter
    console.log("--- Test 6: Handle limit parameter ---");
    try {
        const testFile = join(testDir, "limit-test.txt");
        const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
        writeFileSync(testFile, lines.join("\n"));
        const result = await readTool.forward({ path: testFile, limit: 10 });
        const output = getTextOutput(result);
        console.log("Contains 'Line 1':", output.includes("Line 1"));
        console.log("Contains 'Line 10':", output.includes("Line 10"));
        console.log("Contains 'Line 11':", output.includes("Line 11"));
        console.log("Contains '90 more lines':", output.includes("[90 more lines in file"));
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 7: Handle offset + limit together
    console.log("--- Test 7: Handle offset + limit together ---");
    try {
        const testFile = join(testDir, "offset-limit-test.txt");
        const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
        writeFileSync(testFile, lines.join("\n"));
        const result = await readTool.forward({ path: testFile, offset: 41, limit: 20 });
        const output = getTextOutput(result);
        console.log("Contains 'Line 40':", output.includes("Line 40"));
        console.log("Contains 'Line 41':", output.includes("Line 41"));
        console.log("Contains 'Line 60':", output.includes("Line 60"));
        console.log("Contains 'Line 61':", output.includes("Line 61"));
        console.log("Contains '40 more lines':", output.includes("[40 more lines in file"));
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 8: Show error when offset is beyond file length
    console.log("--- Test 8: Show error when offset is beyond file length ---");
    try {
        const testFile = join(testDir, "short.txt");
        writeFileSync(testFile, "Line 1\nLine 2\nLine 3");
        const result = await readTool.forward({ path: testFile, offset: 100 });
        console.log(getTextOutput(result));
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 9: Include truncation details when truncated
    console.log("--- Test 9: Include truncation details when truncated ---");
    try {
        const testFile = join(testDir, "large-file-details.txt");
        const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
        writeFileSync(testFile, lines.join("\n"));
        const result = await readTool.forward({ path: testFile });
        console.log("Has details:", result.details !== undefined);
        console.log("Has truncation:", result.details?.truncation !== undefined);
        console.log("Is truncated:", result.details?.truncation?.truncated === true);
        console.log("Truncated by:", result.details?.truncation?.truncatedBy);
        console.log("Total lines:", result.details?.truncation?.totalLines);
        console.log("Output lines:", result.details?.truncation?.outputLines);
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 10: Detect image MIME type from file magic
    console.log("--- Test 10: Detect image MIME type from file magic ---");
    try {
        const png1x1Base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2Z0AAAAASUVORK5CYII=";
        const pngBuffer = Buffer.from(png1x1Base64, "base64");
        const testFile = join(testDir, "image.txt");
        writeFileSync(testFile, pngBuffer);
        const result = await readTool.forward({ path: testFile });
        console.log("Text block type:", result.content[0]?.type);
        console.log("Text output:", getTextOutput(result));
        const imageBlock = result.content.find((c: any) => c.type === "image");
        console.log("Has image block:", imageBlock !== undefined);
        console.log("Image MIME type:", imageBlock?.mimeType);
        console.log("Has image data:", typeof imageBlock?.data === "string" && imageBlock.data.length > 0);
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 11: Treat files with image extension but non-image content as text
    console.log("--- Test 11: Treat files with image extension but non-image content as text ---");
    try {
        const testFile = join(testDir, "not-an-image.png");
        writeFileSync(testFile, "definitely not a png");
        const result = await readTool.forward({ path: testFile });
        const output = getTextOutput(result);
        console.log(output);
        console.log("Has image block:", result.content.some((c: any) => c.type === "image"));
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 12: Write file contents
    console.log("--- Test 12: Write file contents ---");
    try {
        const testFile = "write-test.txt";
        const content = "Test content";
        const result = await writeTool.forward({ path: testFile, content });
        console.log(getTextOutput(result));
        const absolutePath = join(testDir, testFile);
        console.log("File content matches:", readFileSync(absolutePath, "utf-8") === content);
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 13: Create parent directories
    console.log("--- Test 13: Create parent directories ---");
    try {
        const testFile = join("nested", "dir", "test.txt");
        const content = "Nested content";
        const result = await writeTool.forward({ path: testFile, content });
        console.log(getTextOutput(result));
        const absolutePath = join(testDir, testFile);
        console.log("File content matches:", readFileSync(absolutePath, "utf-8") === content);
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 14: Replace text in file
    console.log("--- Test 14: Replace text in file ---");
    try {
        const testFile = "edit-test.txt";
        const originalContent = "Hello, world!";
        writeFileSync(join(testDir, testFile), originalContent);
        const result = await editTool.forward({ path: testFile, oldText: "world", newText: "testing" });
        console.log(getTextOutput(result));
        console.log("Has diff:", result.details?.diff !== undefined);
        const content = readFileSync(join(testDir, testFile), "utf-8");
        console.log("File content:", content);
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 15: Fail if text not found
    console.log("--- Test 15: Fail if text not found ---");
    try {
        const testFile = "edit-fail.txt";
        writeFileSync(join(testDir, testFile), "Hello, world!");
        const result = await editTool.forward({ path: testFile, oldText: "nonexistent", newText: "testing" });
        console.log(getTextOutput(result));
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 16: Fail if text appears multiple times
    console.log("--- Test 16: Fail if text appears multiple times ---");
    try {
        const testFile = "edit-dup.txt";
        writeFileSync(join(testDir, testFile), "foo foo foo");
        const result = await editTool.forward({ path: testFile, oldText: "foo", newText: "bar" });
        console.log(getTextOutput(result));
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 17: Match text with trailing whitespace stripped
    console.log("--- Test 17: Match text with trailing whitespace stripped ---");
    try {
        const testFile = join(testDir, "trailing-ws.txt");
        writeFileSync(testFile, "line one   \nline two  \nline three\n");
        const result = await editTool.forward({ path: testFile, oldText: "line one\nline two\n", newText: "replaced\n" });
        console.log(getTextOutput(result));
        const content = readFileSync(testFile, "utf-8");
        console.log("File content:", content);
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 18-29: Edit tool edge cases (abbreviated for brevity)
    // ... (Add remaining edit tool tests)

    // Test 30: Include filename in single file search
    console.log("--- Test 30: Include filename in single file search ---");
    try {
        const testFile = join(testDir, "example.txt");
        writeFileSync(testFile, "first line\nmatch line\nlast line");
        const result = await grepTool.forward({ pattern: "match", path: testFile });
        const output = getTextOutput(result);
        console.log(output);
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 31: Respect global limit and include context lines
    console.log("--- Test 31: Respect global limit and include context lines ---");
    try {
        const testFile = join(testDir, "context.txt");
        const content = ["before", "match one", "after", "middle", "match two", "after two"].join("\n");
        writeFileSync(testFile, content);
        const result = await grepTool.forward({ pattern: "match", path: testFile, limit: 1, context: 1 });
        const output = getTextOutput(result);
        console.log(output);
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 32: Include hidden files
    console.log("--- Test 32: Include hidden files ---");
    try {
        const hiddenDir = join(testDir, ".secret");
        mkdirSync(hiddenDir);
        writeFileSync(join(hiddenDir, "hidden.txt"), "hidden");
        writeFileSync(join(testDir, "visible.txt"), "visible");
        const result = await findTool.forward({ pattern: "**/*.txt", path: testDir });
        const output = getTextOutput(result);
        console.log(output);
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Test 33: List dotfiles and directories
    console.log("--- Test 33: List dotfiles and directories ---");
    try {
        writeFileSync(join(testDir, ".hidden-file"), "secret");
        mkdirSync(join(testDir, ".hidden-dir"));
        const result = await lsTool.forward({ path: testDir });
        const output = getTextOutput(result);
        console.log(output);
    } catch (error: any) {
        console.log("ERROR:", error.message);
    }
    console.log();

    // Cleanup
    rmSync(testDir, { recursive: true, force: true });
    console.log("=== Tests Complete ===");
}

runTests().catch(console.error);
