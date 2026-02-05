import { BaseTool } from './base-tool.js';

// --- Minimal File System Access API Interfaces ---

export type FileSystemHandleKind = 'file' | 'directory';

export interface FileSystemHandle {
  readonly kind: FileSystemHandleKind;
  readonly name: string;
  isSameEntry(other: FileSystemHandle): Promise<boolean>;
}

export interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: 'file';
  getFile(): Promise<File>;
}

export interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: 'directory';
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>;
}

// --- Helper Functions ---

const resolvePath = async (
  root: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemHandle> => {
  if (!path || path === '.' || path === './') {
    return root;
  }

  // Normalize path: remove leading slash, split by '/'
  const parts = path
    .replace(/^\/+/, '')
    .split('/')
    .filter((p) => p.length > 0 && p !== '.');

  let current: FileSystemDirectoryHandle = root;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const isLast = i === parts.length - 1;

    if (isLast) {
      // Try to get as file or directory
      try {
        return await current.getFileHandle(part);
      } catch (error: unknown) {
        // If not found as file, try directory
        // We catch TypeMismatchError (if it exists but is a dir) or NotFoundError (if file doesn't exist)
        try {
          return await current.getDirectoryHandle(part);
        } catch {
          // Rethrow the original error if we assume it was "not found"
          // But if e was TypeMismatch, e2 might be NotFound if it's neither?
          // Actually, if getFileHandle fails with TypeMismatch, getDirectoryHandle should succeed.
          // If getFileHandle fails with NotFound, getDirectoryHandle might also fail with NotFound.
          throw error;
        }
      }
    } else {
      // Must be a directory
      current = await current.getDirectoryHandle(part);
    }
  }

  return root; // Path was empty or root
};

const findFileHandleByName = async (
  root: FileSystemDirectoryHandle,
  filename: string,
  options: { maxEntries?: number; maxMatches?: number } = {}
): Promise<{ handle?: FileSystemHandle; matches: string[]; truncated: boolean }> => {
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    return { matches: [], truncated: false };
  }

  const maxEntries = options.maxEntries ?? 2000;
  const maxMatches = options.maxMatches ?? 5;
  const matches: string[] = [];
  let truncated = false;
  let entriesVisited = 0;
  let foundHandle: FileSystemHandle | undefined;

  const queue: Array<{ handle: FileSystemDirectoryHandle; prefix: string }> = [
    { handle: root, prefix: '' },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    for await (const [name, entry] of current.handle.entries()) {
      entriesVisited += 1;
      if (entriesVisited > maxEntries) {
        truncated = true;
        return { handle: foundHandle, matches, truncated };
      }

      const entryPath = current.prefix ? `${current.prefix}/${name}` : name;

      if (entry.kind === 'file' && name === filename) {
        matches.push(entryPath);
        if (!foundHandle) {
          foundHandle = entry;
        }
        if (matches.length >= maxMatches) {
          return { handle: foundHandle, matches, truncated };
        }
      }

      if (entry.kind === 'directory') {
        queue.push({ handle: entry as FileSystemDirectoryHandle, prefix: entryPath });
      }
    }
  }

  return { handle: matches.length === 1 ? foundHandle : undefined, matches, truncated };
};

// --- Tools ---

export class BrowserReadTextFileTool extends BaseTool {
  name = 'read_text_file';
  description =
    "Read the contents of a text file at the specified path. Can read full file or just head/tail lines. head and tail are mutually exclusive. You can specify one or neither. IMPORTANT: use `read_text_file` over python `open` or file I/O directly.\n\nImportant: This tool returns structured output! Use the JSON schema below to directly access fields like result['field_name']. NO print() statements needed to inspect the output!";
  output_type = 'dict';
  output_description =
    'dict (structured output): This tool ALWAYS returns a dictionary that strictly adheres to the following JSON schema:';
  output_schema = {
    description: 'Output schema for the read_text_file tool.',
    properties: {
      content: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        default: null,
        description: 'The file content (if read was successful)',
        title: 'Content',
      },
      error: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        default: null,
        description: 'The error message (if read was not successful)',
        title: 'Error',
      },
    },
    title: 'ReadFileOutput',
    type: 'object',
  };
  inputs = {
    path: {
      type: 'string' as const,
      description:
        'The path of the file to read (absolute path or relative path to the current working directory)',
    },
    head: {
      type: 'integer' as const,
      description: 'Read the first N lines of the file.',
      nullable: true,
    },
    tail: {
      type: 'integer' as const,
      description: 'Read the last N lines of the file.',
      nullable: true,
    },
  };

  constructor(private rootDirHandle: FileSystemDirectoryHandle) {
    super();
  }

  async forward(
    args: { path: string; head?: number | null; tail?: number | null } | string,
    head?: number | null,
    tail?: number | null
  ): Promise<{ content: string } | { content: null; error: string }> {
    const errorResult = (message: string): { content: null; error: string } => ({
      content: null,
      error: message,
    });
    const resolvedArgs =
      typeof args === 'string'
        ? { path: args, head, tail }
        : args && typeof args === 'object'
          ? {
              path: typeof args.path === 'string' ? args.path : '',
              head: args.head,
              tail: args.tail,
            }
          : null;

    if (!resolvedArgs || resolvedArgs.path === '') {
      return errorResult('Invalid path argument');
    }

    if (
      resolvedArgs.head !== undefined &&
      resolvedArgs.head !== null &&
      resolvedArgs.tail !== undefined &&
      resolvedArgs.tail !== null
    ) {
      return errorResult('Cannot specify both head and tail');
    }

    try {
      let handle: FileSystemHandle;
      try {
        handle = await resolvePath(this.rootDirHandle, resolvedArgs.path);
      } catch (error: unknown) {
        const fallback = await findFileHandleByName(this.rootDirHandle, resolvedArgs.path);
        if (fallback.handle) {
          handle = fallback.handle;
        } else if (fallback.matches.length > 1) {
          return errorResult(
            `Multiple files named '${resolvedArgs.path}' found: ${fallback.matches.join(', ')}`
          );
        } else if (fallback.truncated) {
          return errorResult(
            `File search for '${resolvedArgs.path}' exceeded the scan limit. Please provide a more specific path.`
          );
        } else {
          throw error;
        }
      }

      if (handle.kind !== 'file') {
        return errorResult(`Not a regular file: ${resolvedArgs.path}`);
      }

      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      let text = await file.text();

      if (resolvedArgs.head || resolvedArgs.tail) {
        const lines = text.split('\n');
        if (resolvedArgs.head) {
          text = lines.slice(0, resolvedArgs.head).join('\n');
        } else if (resolvedArgs.tail) {
          text = lines.slice(-resolvedArgs.tail).join('\n');
        }
      }

      return { content: text };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Error reading file: ${message}`);
    }
  }
}

export class BrowserListDirectoryTool extends BaseTool {
  name = 'list_directory';
  description =
    "List directory contents with file sizes and summary statistics.\n\nImportant: This tool returns structured output! Use the JSON schema below to directly access fields like result['field_name']. NO print() statements needed to inspect the output!";
  output_type = 'dict';
  output_description =
    'dict (structured output): This tool ALWAYS returns a dictionary that strictly adheres to the following JSON schema:';
  output_schema = {
    $defs: {
      FileEntry: {
        description: 'Schema for a single file or directory entry.',
        properties: {
          path: {
            description: 'Relative path to current working directory',
            title: 'Path',
            type: 'string',
          },
          type: {
            description: "Type of the entry: 'file' or 'directory'",
            title: 'Type',
            type: 'string',
          },
          size: {
            description: 'Size in bytes',
            title: 'Size',
            type: 'integer',
          },
        },
        required: ['path', 'type', 'size'],
        title: 'FileEntry',
        type: 'object',
      },
    },
    description: 'Output schema for the list_directory tool.',
    properties: {
      entries: {
        anyOf: [{ items: { $ref: '#/$defs/FileEntry' }, type: 'array' }, { type: 'null' }],
        description: 'List of file and directory entries',
        title: 'Entries',
      },
      total_files: {
        anyOf: [{ type: 'integer' }, { type: 'null' }],
        description: 'Total number of files',
        title: 'Total Files',
      },
      total_dirs: {
        anyOf: [{ type: 'integer' }, { type: 'null' }],
        description: 'Total number of directories',
        title: 'Total Dirs',
      },
      total_size: {
        anyOf: [{ type: 'integer' }, { type: 'null' }],
        description: 'Total size of all files in bytes',
        title: 'Total Size',
      },
      error: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        default: null,
        description: 'The error message (if retrieval was not successful)',
        title: 'Error',
      },
    },
    required: ['entries', 'total_files', 'total_dirs', 'total_size'],
    title: 'DirectoryListing',
    type: 'object',
  };
  inputs = {
    path: {
      type: 'string' as const,
      description:
        'The path to list contents for (absolute path or relative path to the current working directory)',
    },
    sort_by: {
      type: 'string' as const,
      description: "Sort entries by 'name' or 'size'",
      default: 'name',
      enum: ['name', 'size'] as const,
      nullable: true,
    },
  };

  constructor(private rootDirHandle: FileSystemDirectoryHandle) {
    super();
  }

  async forward(
    args: { path: string; sort_by?: string } | string,
    sort_by: string = 'name'
  ): Promise<{
    entries: Array<{ path: string; type: FileSystemHandleKind; size: number }> | null;
    total_files: number | null;
    total_dirs: number | null;
    total_size: number | null;
    error: string | null;
  }> {
    const errorResult = (message: string) => ({
      entries: null,
      total_files: null,
      total_dirs: null,
      total_size: null,
      error: message,
    });
    const resolvedArgs =
      typeof args === 'string'
        ? { path: args, sort_by }
        : args && typeof args === 'object'
          ? {
              path: typeof args.path === 'string' ? args.path : '',
              sort_by: args.sort_by,
            }
          : null;

    if (!resolvedArgs || resolvedArgs.path === '') {
      return errorResult('Invalid path argument');
    }

    const resolvedSortBy = resolvedArgs.sort_by ?? 'name';

    try {
      let handle: FileSystemHandle;
      try {
        handle = await resolvePath(this.rootDirHandle, resolvedArgs.path);
      } catch {
        const fallback = await findFileHandleByName(this.rootDirHandle, resolvedArgs.path);
        if (fallback.handle) {
          handle = fallback.handle;
        } else if (fallback.matches.length > 1) {
          return errorResult(
            `Multiple files named '${resolvedArgs.path}' found: ${fallback.matches.join(', ')}`
          );
        } else if (fallback.truncated) {
          return errorResult(
            `File search for '${resolvedArgs.path}' exceeded the scan limit. Please provide a more specific path.`
          );
        } else {
          return errorResult(`Path not found: ${resolvedArgs.path}`);
        }
      }

      if (handle.kind !== 'directory') {
        return errorResult(`Not a directory: ${resolvedArgs.path}`);
      }

      const dirHandle = handle as FileSystemDirectoryHandle;
      const entries = [];
      let total_files = 0;
      let total_dirs = 0;
      let total_size = 0;

      for await (const entry of dirHandle.values()) {
        const isDir = entry.kind === 'directory';
        let size = 0;

        if (isDir) {
          total_dirs++;
        } else {
          total_files++;
          const fileHandle = entry as FileSystemFileHandle;
          try {
            const file = await fileHandle.getFile();
            size = file.size;
          } catch {
            // ignore file access errors
          }
          total_size += size;
        }

        entries.push({
          path: entry.name,
          type: entry.kind,
          size: size,
        });
      }

      // Sort
      if (resolvedSortBy === 'size') {
        entries.sort((a, b) => {
          // Files first, then size descending
          if (a.type !== b.type) return a.type === 'file' ? -1 : 1;
          return b.size - a.size;
        });
      } else {
        entries.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'file' ? -1 : 1;
          return a.path.localeCompare(b.path);
        });
      }

      return {
        entries,
        total_files,
        total_dirs,
        total_size,
        error: null,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Error listing directory: ${message}`);
    }
  }
}

export class BrowserGetFileInfoTool extends BaseTool {
  name = 'get_file_info';
  description =
    "Retrieve detailed metadata about a file or directory. Returns comprehensive information including size, creation time, last modified time, permissions, and type.\n\nImportant: This tool returns structured output! Use the JSON schema below to directly access fields like result['field_name']. NO print() statements needed to inspect the output!";
  output_type = 'dict';
  output_description =
    'dict (structured output): This tool ALWAYS returns a dictionary that strictly adheres to the following JSON schema:';
  output_schema = {
    description: 'Output schema for the get_file_info tool.',
    properties: {
      size: {
        anyOf: [{ type: 'integer' }, { type: 'null' }],
        description: 'Size in bytes',
        title: 'Size',
      },
      modified: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description: 'Last modified time (ISO format)',
        title: 'Modified',
      },
      isDirectory: {
        anyOf: [{ type: 'boolean' }, { type: 'null' }],
        description: 'Whether the path is a directory',
        title: 'Isdirectory',
      },
      isFile: {
        anyOf: [{ type: 'boolean' }, { type: 'null' }],
        description: 'Whether the path is a regular file',
        title: 'Isfile',
      },
      error: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        default: null,
        description: 'The error message (if retrieval was not successful)',
        title: 'Error',
      },
    },
    required: ['size', 'modified', 'isDirectory', 'isFile'],
    title: 'GetFileInfoOutput',
    type: 'object',
  };
  inputs = {
    path: {
      type: 'string' as const,
      description:
        'The path of the file or directory (absolute path or relative path to the current working directory)',
    },
  };

  constructor(private rootDirHandle: FileSystemDirectoryHandle) {
    super();
  }

  async forward(args: { path: string } | string): Promise<{
    size: number | null;
    modified: string | null;
    isDirectory: boolean | null;
    isFile: boolean | null;
    error: string | null;
  }> {
    const errorResult = (message: string) => ({
      size: null,
      modified: null,
      isDirectory: null,
      isFile: null,
      error: message,
    });
    const resolvedArgs =
      typeof args === 'string'
        ? { path: args }
        : args && typeof args === 'object'
          ? { path: typeof args.path === 'string' ? args.path : '' }
          : null;

    if (!resolvedArgs || resolvedArgs.path === '') {
      return errorResult('Invalid path argument');
    }

    try {
      let handle: FileSystemHandle;
      try {
        handle = await resolvePath(this.rootDirHandle, resolvedArgs.path);
      } catch {
        const fallback = await findFileHandleByName(this.rootDirHandle, resolvedArgs.path);
        if (fallback.handle) {
          handle = fallback.handle;
        } else if (fallback.matches.length > 1) {
          return errorResult(
            `Multiple files named '${resolvedArgs.path}' found: ${fallback.matches.join(', ')}`
          );
        } else if (fallback.truncated) {
          return errorResult(
            `File search for '${resolvedArgs.path}' exceeded the scan limit. Please provide a more specific path.`
          );
        } else {
          return errorResult(`Path not found: ${resolvedArgs.path}`);
        }
      }

      const isDir = handle.kind === 'directory';

      let size = 0;
      let lastModifiedStr: string | null = null;

      if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        size = file.size;
        lastModifiedStr = new Date(file.lastModified).toISOString();
      }

      return {
        size: size,
        modified: lastModifiedStr,
        isDirectory: isDir,
        isFile: !isDir,
        error: null,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Error getting file info: ${message}`);
    }
  }
}
