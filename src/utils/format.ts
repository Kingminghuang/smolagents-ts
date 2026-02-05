/**
 * Formatting helpers
 */

/**
 * Safely stringify value with optional truncation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeStringify(value: any, maxLength?: number): string {
  try {
    const seen = new WeakSet<object>();
    let str =
      typeof value === 'string'
        ? value
        : JSON.stringify(
            value,
            (_key, val) => {
              if (typeof val === 'object' && val !== null) {
                if (seen.has(val)) return '[Circular]';
                seen.add(val);
              }
              return val;
            },
            2
          );

    if (maxLength && str.length > maxLength) {
      str = str.slice(0, maxLength) + '... (truncated)';
    }

    return str;
  } catch {
    return String(value);
  }
}
