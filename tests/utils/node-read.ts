
import { readFileSync } from "node:fs";
import { ReadTool } from "../../src/tools/read.js";
import {
    formatSize,
    resolveToCwd,
    truncateHead
} from "./node-fs-utils.js";

// --- NodeReadTool ---

export class NodeReadTool extends ReadTool {
    async forward(args: { path: string; offset?: number; limit?: number }): Promise<any> {
        const { path, offset, limit } = args;
        const absolutePath = resolveToCwd(path, this.cwd);

        try {
            const buffer = readFileSync(absolutePath);

            // Check for common image magic numbers
            const magic = buffer.subarray(0, 12).toString("hex"); // Read first 12 bytes for magic checks
            let mimeType: string | undefined;

            if (magic.startsWith("89504e47")) {
                mimeType = "image/png";
            } else if (magic.startsWith("ffd8")) {
                mimeType = "image/jpeg";
            } else if (magic.startsWith("47494638")) {
                mimeType = "image/gif";
            } else if (magic.startsWith("52494646") && magic.endsWith("57454250")) {
                // RIFF....WEBP (simplified check for RIFF + WEBP at offset 8)
                // Hex: 52 49 46 46 (4 bytes size) 57 45 42 50
                mimeType = "image/webp";
            }

            // Fallback binary check if not identified as image
            let isBinary = mimeType !== undefined;
            if (!isBinary) {
                for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
                    if (buffer[i] === 0) {
                        isBinary = true;
                        break;
                    }
                }
            }

            if (isBinary) {
                if (mimeType) {
                    return {
                        content: [
                            { type: "text", text: `Read image file [${mimeType}]` },
                            { type: "image", mimeType, data: buffer.toString("base64") }
                        ]
                    };
                }
                return {
                    content: [
                        { type: "text", text: `Read binary file (${formatSize(buffer.length)})` }
                    ]
                };
            }

            const textContent = buffer.toString("utf-8");
            const allLines = textContent.split("\n");

            const startLine = offset ? Math.max(0, offset - 1) : 0;
            const startLineDisplay = startLine + 1;

            if (startLine >= allLines.length && allLines.length > 0) {
                throw new Error(`Offset ${offset} is beyond end of file (${allLines.length} lines total)`);
            }

            let selectedContent: string;
            let userLimitedLines: number | undefined;

            if (limit !== undefined) {
                const endLine = Math.min(startLine + limit, allLines.length);
                selectedContent = allLines.slice(startLine, endLine).join("\n");
                userLimitedLines = endLine - startLine;
            } else {
                selectedContent = allLines.slice(startLine).join("\n");
            }

            const truncation = truncateHead(selectedContent);
            let outputText = truncation.content;
            let details: any = undefined;

            if (truncation.firstLineExceedsLimit) {
                outputText = `[Line ${startLineDisplay} exceeds limit]`;
                details = { truncation };
            } else if (truncation.truncated) {
                const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
                const nextOffset = endLineDisplay + 1;
                let limitMsg = "";
                if (truncation.truncatedBy === "bytes") {
                    limitMsg = ` (${formatSize(truncation.maxBytes)} limit)`;
                }
                outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${allLines.length}${limitMsg}. Use offset=${nextOffset} to continue.]`;
                details = { truncation };
            } else if (userLimitedLines !== undefined && startLine + userLimitedLines < allLines.length) {
                const remaining = allLines.length - (startLine + userLimitedLines);
                const nextOffset = startLine + userLimitedLines + 1;
                outputText += `\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`;
            }

            return { content: [{ type: "text", text: outputText }], details };

        } catch (error: any) {
            throw error;
        }
    }
}
