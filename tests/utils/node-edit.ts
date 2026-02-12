
import { readFileSync, writeFileSync } from "node:fs";
import { EditTool } from "../../src/tools/edit.js";
import {
    detectLineEnding,
    fuzzyFindText,
    generateDiffString,
    normalizeForFuzzyMatch,
    normalizeToLF,
    restoreLineEndings,
    stripBom
} from "./node-fs-diff.js";
import { resolveToCwd } from "./node-fs-utils.js";

// --- NodeEditTool ---

export class NodeEditTool extends EditTool {
    async forward(args: { path: string; oldText: string; newText: string }): Promise<any> {
        const { path, oldText, newText } = args;
        const absolutePath = resolveToCwd(path, this.cwd);

        try {
            const buffer = readFileSync(absolutePath);
            const rawContent = buffer.toString("utf-8");

            const { bom, text: content } = stripBom(rawContent);
            const originalEnding = detectLineEnding(content);
            const normalizedContent = normalizeToLF(content);
            const normalizedOldText = normalizeToLF(oldText);
            const normalizedNewText = normalizeToLF(newText);

            const matchResult = fuzzyFindText(normalizedContent, normalizedOldText);

            if (!matchResult.found) {
                throw new Error(`Could not find the exact text in ${path}.`);
            }

            const fuzzyContent = normalizeForFuzzyMatch(normalizedContent);
            const fuzzyOldText = normalizeForFuzzyMatch(normalizedOldText);
            const occurrences = fuzzyContent.split(fuzzyOldText).length - 1;

            if (occurrences > 1) {
                throw new Error(`Found ${occurrences} occurrences of the text in ${path}.`);
            }

            const baseContent = matchResult.contentForReplacement;
            const newContentNormalized =
                baseContent.substring(0, matchResult.index) +
                normalizedNewText +
                baseContent.substring(matchResult.index + matchResult.matchLength);

            if (baseContent === newContentNormalized) {
                throw new Error(`No changes made to ${path}.`);
            }

            const finalContent = bom + restoreLineEndings(newContentNormalized, originalEnding);
            writeFileSync(absolutePath, finalContent);

            const diffResult = generateDiffString(baseContent, newContentNormalized);

            return {
                content: [{ type: "text", text: `Successfully replaced text in ${path}.` }],
                details: { diff: diffResult.diff, firstChangedLine: diffResult.firstChangedLine }
            };

        } catch (error: any) {
            throw error;
        }
    }
}
