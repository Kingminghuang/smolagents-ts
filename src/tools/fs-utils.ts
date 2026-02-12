
/**
 * Shared truncation utilities for tool outputs.
 */

export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB
export const GREP_MAX_LINE_LENGTH = 500; // Max chars per grep match line

export interface TruncationResult {
    /** The truncated content */
    content: string;
    /** Whether truncation occurred */
    truncated: boolean;
    /** Which limit was hit: "lines", "bytes", or null if not truncated */
    truncatedBy: "lines" | "bytes" | null;
    /** Total number of lines in the original content */
    totalLines: number;
    /** Total number of bytes in the original content */
    totalBytes: number;
    /** Number of complete lines in the truncated output */
    outputLines: number;
    /** Number of bytes in the truncated output */
    outputBytes: number;
    /** Whether the last line was partially truncated (only for tail truncation edge case) */
    lastLinePartial: boolean;
    /** Whether the first line exceeded the byte limit (for head truncation) */
    firstLineExceedsLimit: boolean;
    /** The max lines limit that was applied */
    maxLines: number;
    /** The max bytes limit that was applied */
    maxBytes: number;
}

export interface TruncationOptions {
    /** Maximum number of lines (default: 2000) */
    maxLines?: number;
    /** Maximum number of bytes (default: 50KB) */
    maxBytes?: number;
}
