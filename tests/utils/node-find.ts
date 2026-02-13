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

        try {
            // Use globSync for a native JS implementation that matches Python's simplified logic
            const matches = globSync(pattern, {
                cwd: searchPath,
                dot: true, // Include hidden files
                nodir: true, // FindTool usually returns files
                absolute: false,
            });

            if (matches.length === 0) {
                return { content: [{ type: "text", text: "No files found" }] };
            }

            // Apply limit
            const limitedMatches = matches.slice(0, effectiveLimit);
            let output = limitedMatches.join("\n");

            // Apply byte truncation
            const truncation = truncateHead(output, { maxLines: Number.MAX_SAFE_INTEGER });
            output = truncation.content;

            const notices: string[] = [];
            if (matches.length > effectiveLimit) {
                notices.push(`${effectiveLimit} results limit reached`);
            }

            if (truncation.truncated) {
                notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
            }

            if (notices.length > 0) {
                output += `\n\n[${notices.join(". ")}]`;
            }

            return { content: [{ type: "text", text: output }] };
        } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        }
    }
}
