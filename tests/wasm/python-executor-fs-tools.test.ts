import { describe, it, expect } from 'vitest';
import { PyodideExecutor } from '../../src/utils/python-executor.js';
import {
  BrowserReadTextFileTool,
  BrowserListDirectoryTool,
  BrowserGetFileInfoTool,
  type FileSystemDirectoryHandle,
  type FileSystemFileHandle,
  type FileSystemHandle,
  type FileSystemHandleKind,
} from '../../src/tools/fs-tools.js';

class MockFile {
  public readonly name: string;
  public readonly lastModified: number;
  private readonly content: string;

  constructor(name: string, content: string) {
    this.name = name;
    this.content = content;
    this.lastModified = Date.now();
  }

  get size(): number {
    return Buffer.byteLength(this.content, 'utf8');
  }

  async text(): Promise<string> {
    return this.content;
  }
}

class MockHandleBase implements FileSystemHandle {
  readonly kind: FileSystemHandleKind;
  readonly name: string;
  public parent: MockDirectoryHandle | null;

  constructor(kind: FileSystemHandleKind, name: string, parent: MockDirectoryHandle | null) {
    this.kind = kind;
    this.name = name;
    this.parent = parent;
  }

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return other === this;
  }
}

class MockFileHandle extends MockHandleBase implements FileSystemFileHandle {
  readonly kind = 'file' as const;
  private readonly file: MockFile;

  constructor(name: string, content: string, parent: MockDirectoryHandle | null) {
    super('file', name, parent);
    this.file = new MockFile(name, content);
  }

  async getFile(): Promise<File> {
    return this.file as unknown as File;
  }
}

class MockDirectoryHandle extends MockHandleBase implements FileSystemDirectoryHandle {
  readonly kind = 'directory' as const;
  private entriesMap: Map<string, MockHandleBase> = new Map();

  constructor(name: string, parent: MockDirectoryHandle | null) {
    super('directory', name, parent);
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<FileSystemDirectoryHandle> {
    const existing = this.entriesMap.get(name);
    if (existing) {
      if (existing.kind !== 'directory') {
        throw new Error('TypeMismatchError');
      }
      return existing as unknown as FileSystemDirectoryHandle;
    }

    if (options?.create) {
      const created = new MockDirectoryHandle(name, this);
      this.entriesMap.set(name, created);
      return created;
    }

    throw new Error('NotFoundError');
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    const existing = this.entriesMap.get(name);
    if (existing) {
      if (existing.kind !== 'file') {
        throw new Error('TypeMismatchError');
      }
      return existing as unknown as FileSystemFileHandle;
    }

    if (options?.create) {
      const created = new MockFileHandle(name, '', this);
      this.entriesMap.set(name, created);
      return created;
    }

    throw new Error('NotFoundError');
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const existing = this.entriesMap.get(name);
    if (!existing) {
      throw new Error('NotFoundError');
    }

    if (existing.kind === 'directory') {
      const dir = existing as MockDirectoryHandle;
      if (!options?.recursive && dir.entriesMap.size > 0) {
        throw new Error('InvalidModificationError');
      }
    }

    this.entriesMap.delete(name);
  }

  async resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null> {
    const target = possibleDescendant as MockHandleBase;
    const parts: string[] = [];
    let current: MockHandleBase | null = target;
    while (current && current !== this) {
      parts.unshift(current.name);
      current = current.parent;
    }
    if (current !== this) {
      return null;
    }
    return parts;
  }

  async *keys(): AsyncIterableIterator<string> {
    for (const key of this.entriesMap.keys()) {
      yield key;
    }
  }

  async *values(): AsyncIterableIterator<FileSystemHandle> {
    for (const value of this.entriesMap.values()) {
      yield value;
    }
  }

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    for (const entry of this.entriesMap.entries()) {
      yield entry;
    }
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]> {
    return this.entries();
  }

  addEntry(name: string, handle: MockHandleBase) {
    this.entriesMap.set(name, handle);
  }
}

const createMockFs = (): MockDirectoryHandle => {
  const root = new MockDirectoryHandle('', null);

  const foo = new MockFileHandle('foo.txt', 'hello wasm', root);
  root.addEntry('foo.txt', foo);

  const docs = new MockDirectoryHandle('docs', root);
  root.addEntry('docs', docs);
  const readme = new MockFileHandle('readme.md', 'readme', docs);
  docs.addEntry('readme.md', readme);

  const empty = new MockDirectoryHandle('empty', root);
  root.addEntry('empty', empty);

  return root;
};

describe('PyodideExecutor fs tools (WASM)', () => {
  it('executes file system tools in Pyodide', async () => {
    const executor = new PyodideExecutor();
    await executor.init();

    const rootHandle = createMockFs() as unknown as FileSystemDirectoryHandle;
    const readTool = new BrowserReadTextFileTool(rootHandle);
    const listTool = new BrowserListDirectoryTool(rootHandle);
    const infoTool = new BrowserGetFileInfoTool(rootHandle);

    const readArgs = (args: unknown[]) => {
      if (args.length === 1 && args[0] && typeof args[0] === 'object') {
        const options = args[0] as { path?: string; head?: number | null; tail?: number | null };
        return {
          path: options.path ?? '',
          head: options.head ?? null,
          tail: options.tail ?? null,
        };
      }
      if (args.length >= 2 && args[1] && typeof args[1] === 'object') {
        const options = args[1] as { head?: number | null; tail?: number | null };
        return {
          path: (args[0] as string) ?? '',
          head: options.head ?? null,
          tail: options.tail ?? null,
        };
      }
      return {
        path: (args[0] as string) ?? '',
        head: (args[1] as number | null) ?? null,
        tail: (args[2] as number | null) ?? null,
      };
    };

    const listArgs = (args: unknown[]) => {
      if (args.length === 1 && args[0] && typeof args[0] === 'object') {
        const options = args[0] as { path?: string; sort_by?: string };
        return {
          path: options.path ?? '',
          sort_by: options.sort_by ?? 'name',
        };
      }
      if (args.length >= 2 && args[1] && typeof args[1] === 'object') {
        const options = args[1] as { sort_by?: string };
        return {
          path: (args[0] as string) ?? '',
          sort_by: options.sort_by ?? 'name',
        };
      }
      return {
        path: (args[0] as string) ?? '',
        sort_by: (args[1] as string) ?? 'name',
      };
    };

    const infoArgs = (args: unknown[]) => {
      if (args.length === 1 && args[0] && typeof args[0] === 'object') {
        const options = args[0] as { path?: string };
        return {
          path: options.path ?? '',
        };
      }
      return {
        path: (args[0] as string) ?? '',
      };
    };

    await executor.sendTools({
      read_text_file: async (...args: unknown[]) => {
        const parsed = readArgs(args);
        return readTool.forward(parsed.path, parsed.head, parsed.tail);
      },
      list_directory: async (...args: unknown[]) => {
        const parsed = listArgs(args);
        return listTool.forward(parsed.path, parsed.sort_by);
      },
      get_file_info: async (...args: unknown[]) => {
        const parsed = infoArgs(args);
        return infoTool.forward(parsed.path);
      },
    });

    const readResult = await executor.run('read_text_file("foo.txt")');
    expect(readResult.is_final_answer).toBe(false);
    expect((readResult.output as { content?: string }).content ?? '').toContain('hello wasm');

    const headResult = await executor.run('read_text_file("foo.txt", head=1)');
    expect((headResult.output as { content?: string }).content ?? '').toContain('hello wasm');

    const listResult = await executor.run('list_directory(".")');
    const listOutput = listResult.output as {
      entries?: Array<{ path: string; type: string; size: number }>;
      total_files?: number;
      total_dirs?: number;
      total_size?: number;
    };
    const normalizedOutput =
      listOutput && 'value' in listOutput
        ? (listOutput as { value: typeof listOutput }).value
        : listOutput;
    expect(normalizedOutput.total_files).toBe(1);
    expect(listOutput.total_dirs).toBe(2);
    expect(listOutput.entries?.map((entry) => entry.path).sort()).toEqual(
      ['docs', 'empty', 'foo.txt'].sort()
    );

    const infoResult = await executor.run('get_file_info("foo.txt")');
    const infoOutput = infoResult.output as {
      isFile?: boolean;
      isDirectory?: boolean;
      size?: number;
    };
    expect(infoOutput.isFile).toBe(true);
    expect(infoOutput.isDirectory).toBe(false);
    expect((infoOutput.size ?? 0) > 0).toBe(true);
  }, 30000);

  it('handles error cases from fs tools', async () => {
    const executor = new PyodideExecutor();
    await executor.init();

    const rootHandle = createMockFs() as unknown as FileSystemDirectoryHandle;
    const readTool = new BrowserReadTextFileTool(rootHandle);
    const listTool = new BrowserListDirectoryTool(rootHandle);
    const infoTool = new BrowserGetFileInfoTool(rootHandle);

    const readArgs = (args: unknown[]) => {
      if (args.length === 1 && args[0] && typeof args[0] === 'object') {
        const options = args[0] as { path?: string; head?: number | null; tail?: number | null };
        return {
          path: options.path ?? '',
          head: options.head ?? null,
          tail: options.tail ?? null,
        };
      }
      if (args.length >= 2 && args[1] && typeof args[1] === 'object') {
        const options = args[1] as { head?: number | null; tail?: number | null };
        return {
          path: (args[0] as string) ?? '',
          head: options.head ?? null,
          tail: options.tail ?? null,
        };
      }
      return {
        path: (args[0] as string) ?? '',
        head: (args[1] as number | null) ?? null,
        tail: (args[2] as number | null) ?? null,
      };
    };

    const listArgs = (args: unknown[]) => {
      if (args.length === 1 && args[0] && typeof args[0] === 'object') {
        const options = args[0] as { path?: string; sort_by?: string };
        return {
          path: options.path ?? '',
          sort_by: options.sort_by ?? 'name',
        };
      }
      if (args.length >= 2 && args[1] && typeof args[1] === 'object') {
        const options = args[1] as { sort_by?: string };
        return {
          path: (args[0] as string) ?? '',
          sort_by: options.sort_by ?? 'name',
        };
      }
      return {
        path: (args[0] as string) ?? '',
        sort_by: (args[1] as string) ?? 'name',
      };
    };

    const infoArgs = (args: unknown[]) => {
      if (args.length === 1 && args[0] && typeof args[0] === 'object') {
        const options = args[0] as { path?: string };
        return {
          path: options.path ?? '',
        };
      }
      return {
        path: (args[0] as string) ?? '',
      };
    };

    await executor.sendTools({
      read_text_file: async (...args: unknown[]) => {
        const parsed = readArgs(args);
        return readTool.forward(parsed.path, parsed.head, parsed.tail);
      },
      list_directory: async (...args: unknown[]) => {
        const parsed = listArgs(args);
        return listTool.forward(parsed.path, parsed.sort_by);
      },
      get_file_info: async (...args: unknown[]) => {
        const parsed = infoArgs(args);
        return infoTool.forward(parsed.path);
      },
    });

    const bothResult = await executor.run('read_text_file("foo.txt", head=1, tail=1)');
    expect((bothResult.output as { error?: string }).error ?? '').toContain(
      'Cannot specify both head and tail'
    );

    const missingRead = await executor.run('read_text_file("missing.txt")');
    expect((missingRead.output as { error?: string }).error).toContain('Error reading file');

    const listFile = await executor.run('list_directory("foo.txt")');
    expect((listFile.output as { error?: string }).error ?? '').toContain(
      'Not a directory: foo.txt'
    );

    const listMissing = await executor.run('list_directory("missing")');
    expect((listMissing.output as { error?: string }).error ?? '').toContain(
      'Path not found: missing'
    );

    const infoMissing = await executor.run('get_file_info("missing")');
    expect((infoMissing.output as { error?: string }).error ?? '').toContain(
      'Path not found: missing'
    );
  }, 30000);
});
