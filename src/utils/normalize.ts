export type NormalizeOptions = {
  depth?: number;
};

const DEFAULT_DEPTH = 6;

export function normalizeForLog(value: unknown, options: NormalizeOptions = {}): unknown {
  const depth = options.depth ?? DEFAULT_DEPTH;
  return normalizeInner(value, depth, new WeakMap<object, unknown>());
}

function normalizeInner(value: unknown, depth: number, seen: WeakMap<object, unknown>): unknown {
  if (value === null || value === undefined) return value;
  const valueType = typeof value;
  if (valueType !== 'object') return value;
  if (depth <= 0) return { __js_type__: 'MaxDepth', value: '[MaxDepth]' };

  const obj = value as object;
  if (seen.has(obj)) return { __js_type__: 'Circular', value: '[Circular]' };
  seen.set(obj, true);

  if (value instanceof Error) {
    return {
      __js_type__: 'Error',
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof File !== 'undefined' && value instanceof File) {
    return {
      __js_type__: 'File',
      name: value.name,
      size: value.size,
      type: value.type,
      lastModified: value.lastModified,
    };
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return {
      __js_type__: 'Blob',
      size: value.size,
      type: value.type,
    };
  }

  if (value instanceof Date) {
    return { __js_type__: 'Date', value: value.toISOString() };
  }

  if (Array.isArray(value)) {
    const arrayValue: unknown[] = value;
    return arrayValue.map((entry) => normalizeInner(entry, depth - 1, seen));
  }

  if (ArrayBuffer.isView(value)) {
    return {
      __js_type__: 'TypedArray',
      value: Array.from(value as unknown as ArrayLike<number>),
    };
  }

  if (value instanceof ArrayBuffer) {
    return { __js_type__: 'ArrayBuffer', value: Array.from(new Uint8Array(value)) };
  }

  if (value instanceof Map) {
    const entries: Array<[unknown, unknown]> = Array.from(value.entries()).map(([key, entry]) => [
      key,
      normalizeInner(entry, depth - 1, seen),
    ]);
    return { __js_type__: 'Map', value: entries };
  }

  if (value instanceof Set) {
    const entries = Array.from(value.values()).map((entry) =>
      normalizeInner(entry, depth - 1, seen)
    );
    return { __js_type__: 'Set', value: entries };
  }

  const maybeToJson = value as { toJSON?: () => unknown };
  if (typeof maybeToJson.toJSON === 'function') {
    const converted = maybeToJson.toJSON();
    return normalizeInner(converted, depth - 1, seen);
  }

  if ('name' in (value as { name?: unknown }) && 'kind' in (value as { kind?: unknown })) {
    const handle = value as { name?: unknown; kind?: unknown };
    return {
      __js_type__: 'FileSystemHandle',
      name: typeof handle.name === 'string' ? handle.name : undefined,
      kind: typeof handle.kind === 'string' ? handle.kind : undefined,
    };
  }

  const prototype = Object.getPrototypeOf(value as object) as object | null;
  const isPlain = prototype === Object.prototype || prototype === null;
  if (isPlain) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = normalizeInner(entry, depth - 1, seen);
    }
    return result;
  }

  const constructorName = (value as { constructor?: { name?: string } }).constructor?.name;
  return {
    __js_type__: constructorName || 'Object',
    value: Object.prototype.toString.call(value),
  };
}
