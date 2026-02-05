import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserReadTextFileTool, BrowserListDirectoryTool, BrowserGetFileInfoTool, FileSystemDirectoryHandle, FileSystemFileHandle, FileSystemHandleKind } from '../../../src/tools/fs-tools.js';

// --- Mocks ---

class MockFileSystemHandle {
    constructor(public name: string, public kind: FileSystemHandleKind) {}
    async isSameEntry(other: any): Promise<boolean> { return this === other; }
}

class MockFileSystemFileHandle extends MockFileSystemHandle implements FileSystemFileHandle {
    readonly kind = 'file';
    constructor(name: string, private content: string, private lastMod: number = Date.now()) {
        super(name, 'file');
    }
    
    async getFile(): Promise<File> {
        // Mock File object - relying on Node global File/Blob
        const blob = new Blob([this.content]);
        const file = new File([blob], this.name, { lastModified: this.lastMod });
        return file;
    }
}

class MockFileSystemDirectoryHandle extends MockFileSystemHandle implements FileSystemDirectoryHandle {
    readonly kind = 'directory';
    private entriesMap: Map<string, MockFileSystemHandle> = new Map();

    constructor(name: string) {
        super(name, 'directory');
    }

    addEntry(handle: MockFileSystemHandle) {
        this.entriesMap.set(handle.name, handle);
    }

    async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle> {
        const entry = this.entriesMap.get(name);
        if (entry) {
            if (entry.kind === 'directory') {
                return entry as FileSystemDirectoryHandle;
            }
            throw new Error('TypeMismatchError');
        }
        if (options?.create) {
             const newDir = new MockFileSystemDirectoryHandle(name);
             this.entriesMap.set(name, newDir);
             return newDir;
        }
        throw new Error('NotFoundError');
    }

    async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
        const entry = this.entriesMap.get(name);
        if (entry) {
            if (entry.kind === 'file') {
                return entry as FileSystemFileHandle;
            }
            throw new Error('TypeMismatchError');
        }
        if (options?.create) {
             const newFile = new MockFileSystemFileHandle(name, "");
             this.entriesMap.set(name, newFile);
             return newFile;
        }
        throw new Error('NotFoundError');
    }

    async removeEntry(name: string): Promise<void> {
        if (!this.entriesMap.delete(name)) {
             throw new Error('NotFoundError');
        }
    }

    async resolve(possibleDescendant: any): Promise<string[] | null> {
        return null; // Not implemented for now
    }

    async *keys(): AsyncIterableIterator<string> {
        for (const key of this.entriesMap.keys()) {
            yield key;
        }
    }

    async *values(): AsyncIterableIterator<any> {
        for (const val of this.entriesMap.values()) {
            yield val;
        }
    }

    async *entries(): AsyncIterableIterator<[string, any]> {
        for (const entry of this.entriesMap.entries()) {
            yield entry;
        }
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<[string, any]> {
        return this.entries();
    }
}

// --- Tests ---

describe('Browser FS Tools', () => {
    let root: MockFileSystemDirectoryHandle;
    let readTool: BrowserReadTextFileTool;
    let listTool: BrowserListDirectoryTool;
    let infoTool: BrowserGetFileInfoTool;

    beforeEach(() => {
        root = new MockFileSystemDirectoryHandle('');
        // Setup FS structure:
        // /file1.txt ("Hello World\nLine 2")
        // /dir1/
        // /dir1/file2.txt ("Nested content")
        
        const file1 = new MockFileSystemFileHandle('file1.txt', 'Hello World\nLine 2');
        root.addEntry(file1);

        const dir1 = new MockFileSystemDirectoryHandle('dir1');
        const file2 = new MockFileSystemFileHandle('file2.txt', 'Nested content');
        dir1.addEntry(file2);
        root.addEntry(dir1);

        readTool = new BrowserReadTextFileTool(root);
        listTool = new BrowserListDirectoryTool(root);
        infoTool = new BrowserGetFileInfoTool(root);
    });

    describe('read_text_file', () => {
        it('should read file content', async () => {
            const result = await readTool.forward('file1.txt');
            expect(result).toEqual({ content: 'Hello World\nLine 2' });
        });

        it('should read nested file', async () => {
            const result = await readTool.forward('dir1/file2.txt');
            expect(result).toEqual({ content: 'Nested content' });
        });

        it('should handle head', async () => {
            const result = await readTool.forward('file1.txt', 1);
            expect(result).toEqual({ content: 'Hello World' });
        });
        
         it('should handle tail', async () => {
            const result = await readTool.forward('file1.txt', null, 1);
            expect(result).toEqual({ content: 'Line 2' });
        });

        it('should return error if file not found', async () => {
            const result = await readTool.forward('nonexistent.txt');
            expect(result).toHaveProperty('error');
            expect(result.error).toContain('NotFoundError');
        });
        
        it('should return error if path is directory', async () => {
            const result = await readTool.forward('dir1');
             expect(result).toHaveProperty('error');
             expect(result.error).toContain('Not a regular file');
        });
    });

    describe('list_directory', () => {
        it('should list root directory', async () => {
            const result = await listTool.forward('.');
            expect(result.entries).toHaveLength(2);
            expect(result.total_files).toBe(1);
            expect(result.total_dirs).toBe(1);
            
            const fileEntry = result.entries.find((e: any) => e.path === 'file1.txt');
            expect(fileEntry).toBeDefined();
            expect(fileEntry.type).toBe('file');
            
            const dirEntry = result.entries.find((e: any) => e.path === 'dir1');
            expect(dirEntry).toBeDefined();
            expect(dirEntry.type).toBe('directory');
        });

        it('should list nested directory', async () => {
            const result = await listTool.forward('dir1');
            expect(result.entries).toHaveLength(1);
            expect(result.entries[0].path).toBe('file2.txt');
        });
        
        it('should return error if path not found', async () => {
            const result = await listTool.forward('unknown');
            expect(result).toHaveProperty('error');
        });
    });

    describe('get_file_info', () => {
        it('should get file info', async () => {
            const result = await infoTool.forward('file1.txt');
            expect(result.isFile).toBe(true);
            expect(result.isDirectory).toBe(false);
            expect(result.size).toBe(18); // "Hello World\nLine 2".length
            expect(result.modified).toBeTruthy();
        });

        it('should get dir info', async () => {
            const result = await infoTool.forward('dir1');
            expect(result.isFile).toBe(false);
            expect(result.isDirectory).toBe(true);
        });
    });
});
