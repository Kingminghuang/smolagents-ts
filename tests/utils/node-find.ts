import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { relative, join } from "node:path";
import { globSync } from "glob";
import { FindTool } from "../../src/tools/find.js";
import { DEFAULT_MAX_BYTES } from "../../src/tools/fs-utils.js";
import {
    formatSize,
    resolveToCwd,
    truncateHead
} from "./node-fs-utils.js";

// --- NodeFindTool ---
const DEFAULT_LIMIT = 1000;

export class NodeFindTool extends FindTool {
    async forward(args: { pattern: string; path?: string; limit?: number }): Promise<any> {
        const { pattern, path: pathInput, limit } = args;
        const searchPath = resolveToCwd(pathInput || ".", this.cwd);
        const effectiveLimit = limit ?? DEFAULT_LIMIT;

        const cliArgs = [
            "--glob",
            "--color=never",
            "--hidden",
            "--no-ignore-vcs",
            "--max-results",
            String(effectiveLimit),
        ];

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

        cliArgs.push(pattern, searchPath);

        return new Promise((resolve, reject) => {
            const child = spawn("fd", cliArgs);
            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (data) => stdout += data.toString());
            child.stderr.on("data", (data) => stderr += data.toString());

            child.on("close", (code) => {
                if (code !== 0 && stderr) {
                    reject(new Error(`fd failed: ${stderr}`));
                    return;
                }

                if (!stdout) {
                    resolve({ content: [{ type: "text", text: "No files found" }] });
                    return;
                }

                const lines = stdout.split("\n").filter(l => l.trim());

                // Relativize paths
                const relativePaths = lines.map(line => relative(searchPath, line));

                let output = relativePaths.join("\n");

                // Apple byte truncation
                const truncation = truncateHead(output, { maxLines: Number.MAX_SAFE_INTEGER });
                output = truncation.content;

                const notices: string[] = [];
                // fd automatically handles the max-results limit, but doesn't tell us if it hit it clearly in exit code.
                // If we have exactly effectiveLimit results, we might have hit it.
                if (lines.length >= effectiveLimit) {
                    notices.push(`${effectiveLimit} results limit reached`);
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
