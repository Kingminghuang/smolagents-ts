/**
 * Formatting helpers
 */

/**
 * Safely stringify value with optional truncation.
 */
export function safeStringify(value: unknown, maxLength?: number): string {
  try {
    const seen = new WeakSet<object>();
    let str =
      typeof value === 'string'
        ? value
        : (JSON.stringify(
            value,
            (_key, val) => {
              if (typeof val === 'object' && val !== null) {
                const obj = val as object;
                if (seen.has(obj)) return '[Circular]';
                seen.add(obj);
              }
              return val as unknown;
            },
            2
          ) ?? '');

    if (maxLength && str.length > maxLength) {
      str = str.slice(0, maxLength) + '... (truncated)';
    }

    return str;
  } catch {
    return String(value);
  }
}
