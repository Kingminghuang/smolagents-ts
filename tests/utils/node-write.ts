
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { WriteTool } from "../../src/tools/write.js";
import { resolveToCwd } from "./node-fs-utils.js";

// --- NodeWriteTool ---

export class NodeWriteTool extends WriteTool {
    async forward(args: { path: string; content: string }): Promise<any> {
        const { path, content } = args;
        const absolutePath = resolveToCwd(path, this.cwd);
        const dir = dirname(absolutePath);

        try {
            mkdirSync(dir, { recursive: true });
            writeFileSync(absolutePath, content, "utf-8");
            return {
                content: [{ type: "text", text: `Successfully wrote ${content.length} bytes to ${path}` }]
            };
        } catch (error: any) {
            throw error;
        }
    }
}
