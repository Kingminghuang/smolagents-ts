
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { LsTool } from "../../src/tools/ls.js";
import { DEFAULT_MAX_BYTES } from "../../src/tools/fs-utils.js";
import {
    formatSize,
    resolveToCwd,
    truncateHead
} from "./node-fs-utils.js";

// --- NodeLsTool ---
const DEFAULT_LIMIT = 500;

export class NodeLsTool extends LsTool {
    async forward(args: { path?: string; limit?: number }): Promise<any> {
        const { path: pathInput, limit } = args;
        const dirPath = resolveToCwd(pathInput || ".", this.cwd);

        try {
            const entries = readdirSync(dirPath);
            entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

            const results: string[] = [];
            const effectiveLimit = limit ?? DEFAULT_LIMIT;
            let entryLimitReached = false;

            for (const entry of entries) {
                if (results.length >= effectiveLimit) {
                    entryLimitReached = true;
                    break;
                }

                const fullPath = join(dirPath, entry);
                let suffix = "";
                try {
                    if (statSync(fullPath).isDirectory()) suffix = "/";
                } catch { }

                results.push(entry + suffix);
            }

            if (results.length === 0) {
                return { content: [{ type: "text", text: "(empty directory)" }] };
            }

            let output = results.join("\n");

            // Apply byte truncation
            const truncation = truncateHead(output, { maxLines: Number.MAX_SAFE_INTEGER });
            output = truncation.content;

            const notices: string[] = [];
            if (entryLimitReached) {
                notices.push(`${effectiveLimit} entries limit reached`);
            }
            if (truncation.truncated) {
                notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
            }

            if (notices.length > 0) {
                output += `\n\n[${notices.join(". ")}]`;
            }

            return { content: [{ type: "text", text: output }] };

        } catch (error: any) {
            throw error;
        }
    }
}
