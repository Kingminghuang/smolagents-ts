import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { GrepTool } from "../../src/tools/grep.js";
import { join, basename, relative } from "node:path";
import { globSync } from "glob";
import { DEFAULT_MAX_BYTES } from "../../src/tools/fs-utils.js";
import {
    formatSize,
    resolveToCwd,
    truncateHead,
    truncateLine
} from "./node-fs-utils.js";

// --- NodeGrepTool ---
const DEFAULT_LIMIT = 100;

export class NodeGrepTool extends GrepTool {
    async forward(args: {
        pattern: string;
        path?: string;
        glob?: string;
        ignoreCase?: boolean;
        literal?: boolean;
        limit?: number;
        context?: number;
    }): Promise<any> {
        const { pattern, path: pathInput, glob, ignoreCase, literal, limit, context } = args;
        const searchPath = resolveToCwd(pathInput || ".", this.cwd);
        const effectiveLimit = limit ?? DEFAULT_LIMIT;

        const cliArgs = ["--json", "--line-number", "--color=never", "--hidden"];

        if (ignoreCase) {
            cliArgs.push("--ignore-case");
        }

        if (literal) {
            cliArgs.push("--fixed-strings");
        }

        if (glob) {
            cliArgs.push("--glob", glob);
        }



        // Context
        if (context && context > 0) {
            cliArgs.push(`-C${context}`);
        }

        cliArgs.push("--no-ignore-vcs");

        // Include .gitignore files
        const gitignoreFiles = new Set<string>();
        const rootGitignore = join(searchPath, ".gitignore");
        if (existsSync(rootGitignore)) {
            gitignoreFiles.add(rootGitignore);
        }

        try {
            const nestedGitignores = globSync("**/.gitignore", {
                cwd: searchPath,
                dot: true,
                absolute: true,
                ignore: ["**/node_modules/**", "**/.git/**"],
            });
            for (const file of nestedGitignores) {
                gitignoreFiles.add(file);
            }
        } catch {
            // Ignore glob errors
        }

        for (const gitignorePath of gitignoreFiles) {
            cliArgs.push("--ignore-file", gitignorePath);
        }

        // Pattern and path
        cliArgs.push(pattern, searchPath);

        return new Promise((resolve, reject) => {
            const child = spawn("rg", cliArgs, { cwd: this.cwd });
            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (data) => stdout += data.toString());
            child.stderr.on("data", (data) => stderr += data.toString());

            child.on("close", (code) => {
                if (code !== 0 && code !== 1) { // 1 means no matches
                    reject(new Error(`rg failed: ${stderr}`));
                    return;
                }

                if (!stdout) {
                    resolve({ content: [{ type: "text", text: "No matches found" }] });
                    return;
                }

                const lines = stdout.split("\n");
                let matchCount = 0;
                let outputLines: string[] = [];

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const event = JSON.parse(line);

                        if (event.type === "match") {
                            if (matchCount >= effectiveLimit) {
                                break;
                            }
                            matchCount++;
                        }

                        if (event.type === "match" || event.type === "context") {
                            const filePath = event.data.path.text;
                            const lineNum = event.data.line_number;
                            const content = event.data.lines.text.replace(/\n$/, "");
                            let relativePath = relative(searchPath, filePath); // Make relative to search path
                            if (!relativePath || relativePath === "") {
                                relativePath = basename(filePath);
                            }

                            // Format: file:line: content (for match) or file-line- content (for context)
                            const separator = event.type === "match" ? ":" : "-";
                            const formatted = `${relativePath}${separator}${lineNum}${separator} ${content}`;

                            const truncated = truncateLine(formatted);
                            outputLines.push(truncated.text);
                        }
                    } catch (e) {
                        // ignore parse errors
                    }
                }

                if (outputLines.length === 0) {
                    resolve({ content: [{ type: "text", text: "No matches found" }] });
                    return;
                }

                let output = outputLines.join("\n");

                const truncation = truncateHead(output, { maxLines: Number.MAX_SAFE_INTEGER });
                output = truncation.content;

                const notices: string[] = [];
                if (matchCount >= effectiveLimit) {
                    notices.push(`${effectiveLimit} matches limit reached. Use limit=${effectiveLimit + 1} for more, or refine pattern`);
                }
                if (truncation.truncated) {
                    notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
                }

                if (notices.length > 0) {
                    output += `\n\n[${notices.join(". ")}]`;
                }

                resolve({ content: [{ type: "text", text: output }] });
            });
        });
    }
}
