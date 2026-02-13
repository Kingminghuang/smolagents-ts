
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

describe("Node FS Tools", () => {
    let testDir: string;
    let readTool: NodeReadTool;
    let writeTool: NodeWriteTool;
    let editTool: NodeEditTool;
    let lsTool: NodeLsTool;
    let grepTool: NodeGrepTool;
    let findTool: NodeFindTool;

    beforeEach(() => {
        testDir = join(tmpdir(), `smolagents-fs-test-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });

        readTool = new NodeReadTool(testDir);
        writeTool = new NodeWriteTool(testDir);
        editTool = new NodeEditTool(testDir);
        lsTool = new NodeLsTool(testDir);
        grepTool = new NodeGrepTool(testDir);
        findTool = new NodeFindTool(testDir);
    });

    afterEach(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    describe("read tool", () => {
        it("should read file contents that fit within limits", async () => {
            const testFile = join(testDir, "test.txt");
            const content = "Hello, world!\nLine 2\nLine 3";
            writeFileSync(testFile, content);

            const result = await readTool.forward({ path: testFile });
            expect(getTextOutput(result)).toBe(content);
        });

        it("should handle non-existent files", async () => {
            const testFile = "nonexistent.txt";
            await expect(readTool.forward({ path: testFile })).rejects.toThrow(/ENOENT|not found/i);
        });

        it("should truncate files exceeding line limit", async () => {
            const testFile = join(testDir, "large-2500.txt");
            const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
            writeFileSync(testFile, lines.join("\n"));

            const result = await readTool.forward({ path: testFile });
            const output = getTextOutput(result);

            expect(output).toContain("Line 1");
            expect(output).toContain("Line 2000");
            expect(output).not.toContain("Line 2001");
            expect(output).toContain("[Showing lines 1-2000 of 2500. Use offset=2001 to continue.]");
        });

        it("should truncate when byte limit exceeded", async () => {
            const testFile = join(testDir, "large-bytes.txt");
            // Create file that exceeds 50KB byte limit but has fewer than 2000 lines
            const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: ${"x".repeat(200)}`);
            writeFileSync(testFile, lines.join("\n"));

            const result = await readTool.forward({ path: testFile });
            const output = getTextOutput(result);

            expect(output).toContain("Line 1:");
            // Check for byte limit message pattern
            // "[Showing lines 1-X of 500 (50.0KB limit). Use offset=Y to continue.]"
            expect(output).toMatch(/\[Showing lines 1-\d+ of 500 \(.*[KM]B limit\)\. Use offset=\d+ to continue\.\]/);
        });

        it("should handle offset parameter", async () => {
            const testFile = join(testDir, "offset-test.txt");
            const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
            writeFileSync(testFile, lines.join("\n"));

            const result = await readTool.forward({ path: testFile, offset: 51 });
            const output = getTextOutput(result);

            expect(output).not.toContain("Line 50");
            expect(output).toContain("Line 51");
            expect(output).toContain("Line 100");
            expect(output).not.toContain("Use offset=");
        });

        it("should handle limit parameter", async () => {
            const testFile = join(testDir, "limit-test.txt");
            const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
            writeFileSync(testFile, lines.join("\n"));

            const result = await readTool.forward({ path: testFile, limit: 10 });
            const output = getTextOutput(result);

            expect(output).toContain("Line 1");
            expect(output).toContain("Line 10");
            expect(output).not.toContain("Line 11");
            expect(output).toContain("[90 more lines in file. Use offset=11 to continue.]");
        });

        it("should handle offset + limit together", async () => {
            const testFile = join(testDir, "offset-limit-test.txt");
            const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
            writeFileSync(testFile, lines.join("\n"));

            const result = await readTool.forward({ path: testFile, offset: 41, limit: 20 });
            const output = getTextOutput(result);

            expect(output).not.toContain("Line 40");
            expect(output).toContain("Line 41");
            expect(output).toContain("Line 60");
            expect(output).not.toContain("Line 61");
            expect(output).toContain("[40 more lines in file. Use offset=61 to continue.]");
        });

        it("should show error when offset is beyond file length", async () => {
            const testFile = join(testDir, "short.txt");
            writeFileSync(testFile, "Line 1\nLine 2\nLine 3");

            await expect(readTool.forward({ path: testFile, offset: 100 })).rejects.toThrow(
                /Offset 100 is beyond end of file \(3 lines total\)/,
            );
        });

        it("should include truncation details when truncated", async () => {
            const testFile = join(testDir, "large-file-details.txt");
            const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
            writeFileSync(testFile, lines.join("\n"));

            const result = await readTool.forward({ path: testFile });

            expect(result.details).toBeDefined();
            expect(result.details?.truncation).toBeDefined();
            expect(result.details?.truncation?.truncated).toBe(true);
            expect(result.details?.truncation?.truncatedBy).toBe("lines");
            expect(result.details?.truncation?.totalLines).toBe(2500);
            expect(result.details?.truncation?.outputLines).toBe(2000);
        });

        it("should detect image MIME type from file magic (not extension)", async () => {
            const png1x1Base64 =
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2Z0AAAAASUVORK5CYII=";
            const pngBuffer = Buffer.from(png1x1Base64, "base64");

            const testFile = join(testDir, "image.txt");
            writeFileSync(testFile, pngBuffer);

            const result = await readTool.forward({ path: testFile });

            expect(result.content[0]?.type).toBe("text");
            expect(getTextOutput(result)).toContain("Read image file [image/png]");

            const imageBlock = result.content.find(
                (c: any) => c.type === "image",
            );
            expect(imageBlock).toBeDefined();
            expect(imageBlock?.mimeType).toBe("image/png");
            expect(typeof imageBlock?.data).toBe("string");
            expect((imageBlock?.data ?? "").length).toBeGreaterThan(0);
        });

        it("should treat files with image extension but non-image content as text", async () => {
            const testFile = join(testDir, "not-an-image.png");
            writeFileSync(testFile, "definitely not a png");

            const result = await readTool.forward({ path: testFile });
            const output = getTextOutput(result);

            expect(output).toContain("definitely not a png");
            expect(result.content.some((c: any) => c.type === "image")).toBe(false);
        });
    });

    describe("write tool", () => {
        it("should write file contents", async () => {
            const testFile = "write-test.txt"; // relative
            const content = "Test content";

            await writeTool.forward({ path: testFile, content });

            const absolutePath = join(testDir, testFile);
            expect(readFileSync(absolutePath, "utf-8")).toBe(content);
        });

        it("should create parent directories", async () => {
            const testFile = join("nested", "dir", "test.txt");
            const content = "Nested content";

            const result = await writeTool.forward({ path: testFile, content });

            expect(getTextOutput(result)).toContain("Successfully wrote");
            const absolutePath = join(testDir, testFile);
            expect(readFileSync(absolutePath, "utf-8")).toBe(content);
        });
    });

    describe("edit tool", () => {
        it("should replace text in file", async () => {
            const testFile = "edit-test.txt";
            const originalContent = "Hello, world!";
            writeFileSync(join(testDir, testFile), originalContent);

            const result = await editTool.forward({ path: testFile, oldText: "world", newText: "testing" });

            expect(getTextOutput(result)).toContain("Successfully replaced");
            expect(result.details.diff).toContain("testing");

            const content = readFileSync(join(testDir, testFile), "utf-8");
            expect(content).toBe("Hello, testing!");
        });

        it("should fail if text not found", async () => {
            const testFile = "edit-fail.txt";
            writeFileSync(join(testDir, testFile), "Hello, world!");

            await expect(
                editTool.forward({ path: testFile, oldText: "nonexistent", newText: "testing" }),
            ).rejects.toThrow(/Could not find the exact text/);
        });

        it("should fail if text appears multiple times", async () => {
            const testFile = "edit-dup.txt";
            writeFileSync(join(testDir, testFile), "foo foo foo");

            await expect(
                editTool.forward({ path: testFile, oldText: "foo", newText: "bar" }),
            ).rejects.toThrow(/Found 3 occurrences/);
        });

        it("should match text with trailing whitespace stripped", async () => {
            const testFile = join(testDir, "trailing-ws.txt");
            // File has trailing spaces on lines
            writeFileSync(testFile, "line one   \nline two  \nline three\n");

            // oldText without trailing whitespace should still match
            const result = await editTool.forward({ path: testFile, oldText: "line one\nline two\n", newText: "replaced\n" });

            expect(getTextOutput(result)).toContain("Successfully replaced");
            const content = readFileSync(testFile, "utf-8");
            expect(content).toBe("replaced\nline three\n");
        });

        it("should match smart single quotes to ASCII quotes", async () => {
            const testFile = join(testDir, "smart-quotes.txt");
            // File has smart/curly single quotes (U+2018, U+2019)
            writeFileSync(testFile, "console.log(\u2018hello\u2019);\n");

            // oldText with ASCII quotes should match
            const result = await editTool.forward({ path: testFile, oldText: "console.log('hello');", newText: "console.log('world');" });

            expect(getTextOutput(result)).toContain("Successfully replaced");
            const content = readFileSync(testFile, "utf-8");
            expect(content).toContain("world");
        });

        it("should match smart double quotes to ASCII quotes", async () => {
            const testFile = join(testDir, "smart-double-quotes.txt");
            // File has smart/curly double quotes (U+201C, U+201D)
            writeFileSync(testFile, "const msg = \u201CHello World\u201D;\n");

            // oldText with ASCII quotes should match
            const result = await editTool.forward({ path: testFile, oldText: 'const msg = "Hello World";', newText: 'const msg = "Goodbye";' });

            expect(getTextOutput(result)).toContain("Successfully replaced");
            const content = readFileSync(testFile, "utf-8");
            expect(content).toContain("Goodbye");
        });

        it("should match Unicode dashes to ASCII hyphen", async () => {
            const testFile = join(testDir, "unicode-dashes.txt");
            // File has en-dash (U+2013) and em-dash (U+2014)
            writeFileSync(testFile, "range: 1\u20135\nbreak\u2014here\n");

            // oldText with ASCII hyphens should match
            const result = await editTool.forward({ path: testFile, oldText: "range: 1-5\nbreak-here", newText: "range: 10-50\nbreak--here" });

            expect(getTextOutput(result)).toContain("Successfully replaced");
            const content = readFileSync(testFile, "utf-8");
            expect(content).toContain("10-50");
        });

        it("should match non-breaking space to regular space", async () => {
            const testFile = join(testDir, "nbsp.txt");
            // File has non-breaking space (U+00A0)
            writeFileSync(testFile, "hello\u00A0world\n");

            // oldText with regular space should match
            const result = await editTool.forward({ path: testFile, oldText: "hello world", newText: "hello universe" });

            expect(getTextOutput(result)).toContain("Successfully replaced");
            const content = readFileSync(testFile, "utf-8");
            expect(content).toContain("universe");
        });

        it("should prefer exact match over fuzzy match", async () => {
            const testFile = join(testDir, "exact-preferred.txt");
            // File has both exact and fuzzy-matchable content
            writeFileSync(testFile, "const x = 'exact';\nconst y = 'other';\n");

            const result = await editTool.forward({ path: testFile, oldText: "const x = 'exact';", newText: "const x = 'changed';" });

            expect(getTextOutput(result)).toContain("Successfully replaced");
            const content = readFileSync(testFile, "utf-8");
            expect(content).toBe("const x = 'changed';\nconst y = 'other';\n");
        });

        it("should still fail when text is not found even with fuzzy matching", async () => {
            const testFile = join(testDir, "no-match.txt");
            writeFileSync(testFile, "completely different content\n");

            await expect(
                editTool.forward({ path: testFile, oldText: "this does not exist", newText: "replacement" }),
            ).rejects.toThrow(/Could not find the exact text/);
        });

        it("should detect duplicates after fuzzy normalization", async () => {
            const testFile = join(testDir, "fuzzy-dups.txt");
            // Two lines that are identical after trailing whitespace is stripped
            writeFileSync(testFile, "hello world   \nhello world\n");

            await expect(
                editTool.forward({ path: testFile, oldText: "hello world", newText: "replaced" }),
            ).rejects.toThrow(/Found 2 occurrences/);
        });

        it("should match LF oldText against CRLF file content", async () => {
            const testFile = join(testDir, "crlf-test.txt");

            writeFileSync(testFile, "line one\r\nline two\r\nline three\r\n");

            const result = await editTool.forward({ path: testFile, oldText: "line two\n", newText: "replaced line\n" });

            expect(getTextOutput(result)).toContain("Successfully replaced");
        });

        it("should preserve CRLF line endings after edit", async () => {
            const testFile = join(testDir, "crlf-preserve.txt");
            writeFileSync(testFile, "first\r\nsecond\r\nthird\r\n");

            await editTool.forward({ path: testFile, oldText: "second\n", newText: "REPLACED\n" });

            const content = readFileSync(testFile, "utf-8");
            expect(content).toBe("first\r\nREPLACED\r\nthird\r\n");
        });

        it("should preserve LF line endings for LF files", async () => {
            const testFile = join(testDir, "lf-preserve.txt");
            writeFileSync(testFile, "first\nsecond\nthird\n");

            await editTool.forward({ path: testFile, oldText: "second\n", newText: "REPLACED\n" });

            const content = readFileSync(testFile, "utf-8");
            expect(content).toBe("first\nREPLACED\nthird\n");
        });

        it("should detect duplicates across CRLF/LF variants", async () => {
            const testFile = join(testDir, "mixed-endings.txt");

            writeFileSync(testFile, "hello\r\nworld\r\n---\r\nhello\nworld\n");

            await expect(
                editTool.forward({ path: testFile, oldText: "hello\nworld\n", newText: "replaced\n" }),
            ).rejects.toThrow(/Found 2 occurrences/);
        });

        it("should preserve UTF-8 BOM after edit", async () => {
            const testFile = join(testDir, "bom-test.txt");
            writeFileSync(testFile, "\uFEFFfirst\r\nsecond\r\nthird\r\n");

            await editTool.forward({ path: testFile, oldText: "second\n", newText: "REPLACED\n" });

            const content = readFileSync(testFile, "utf-8");
            expect(content).toBe("\uFEFFfirst\r\nREPLACED\r\nthird\r\n");
        });
    });

    describe("grep tool", () => {
        it("should find text in file", async () => {
            const testFile = join(testDir, "grep-test.txt");
            writeFileSync(testFile, "first line\nmatch this\nlast line");

            const result = await grepTool.forward({ pattern: "match", path: testFile });
            const output = getTextOutput(result);
            expect(output).toContain("match this");
        });

        it("should respect context", async () => {
            const testFile = join(testDir, "context.txt");
            writeFileSync(testFile, "before\nmatch\nafter");

            const result = await grepTool.forward({ pattern: "match", path: testFile, context: 1 });
            const output = getTextOutput(result);

            expect(output).toContain("before");
            expect(output).toContain("match");
            expect(output).toContain("after");
        });

        it("should include filename when searching a single file", async () => {
            const testFile = join(testDir, "example.txt");
            writeFileSync(testFile, "first line\nmatch line\nlast line");

            const result = await grepTool.forward({ pattern: "match", path: testFile });

            const output = getTextOutput(result);
            expect(output).toContain("example.txt:2: match line");
        });

        it("should respect global limit and include context lines", async () => {
            const testFile = join(testDir, "context.txt");
            const content = ["before", "match one", "after", "middle", "match two", "after two"].join("\n");
            writeFileSync(testFile, content);

            const result = await grepTool.forward({ pattern: "match", path: testFile, limit: 1, context: 1 });

            const output = getTextOutput(result);
            expect(output).toContain("context.txt-1- before");
            expect(output).toContain("context.txt:2: match one");
            expect(output).toContain("context.txt-3- after");
            expect(output).toContain("[1 matches limit reached. Use limit=2 for more, or refine pattern]");
            // Ensure second match is not present
            expect(output).not.toContain("match two");
        });
    });

    describe("find tool", () => {
        it("should include hidden files that are not gitignored", async () => {
            const hiddenDir = join(testDir, ".secret");
            mkdirSync(hiddenDir);
            writeFileSync(join(hiddenDir, "hidden.txt"), "hidden");
            writeFileSync(join(testDir, "visible.txt"), "visible");

            const result = await findTool.forward({ pattern: "**/*.txt", path: testDir });

            const outputLines = getTextOutput(result)
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);

            expect(outputLines).toContain("visible.txt");
            expect(outputLines).toContain(".secret/hidden.txt");
        });

        it("should respect .gitignore", async () => {
            writeFileSync(join(testDir, ".gitignore"), "ignored.txt\n");
            writeFileSync(join(testDir, "ignored.txt"), "ignored");
            writeFileSync(join(testDir, "kept.txt"), "kept");

            const result = await findTool.forward({ pattern: "**/*.txt", path: testDir });

            const output = getTextOutput(result);
            expect(output).toContain("kept.txt");
            expect(output).not.toContain("ignored.txt");
        });
    });

    describe("ls tool", () => {
        it("should list dotfiles and directories", async () => {
            writeFileSync(join(testDir, ".hidden-file"), "secret");
            mkdirSync(join(testDir, ".hidden-dir"));

            const result = await lsTool.forward({ path: testDir });
            const output = getTextOutput(result);

            expect(output).toContain(".hidden-file");
            expect(output).toContain(".hidden-dir/");
        });
    });
});
