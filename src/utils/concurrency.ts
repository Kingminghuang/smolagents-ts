/**
 * Concurrency limiter for parallel operations
 */
export class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number) {}

  /**
   * Run a function with concurrency limit
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    // Wait until we have capacity
    while (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      // Release next queued operation
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * Get current number of running operations
   */
  getRunning(): number {
    return this.running;
  }

  /**
   * Get number of queued operations
   */
  getQueued(): number {
    return this.queue.length;
  }
}

/**
 * Execute promises in parallel with limit
 */
export async function parallelLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const limiter = new ConcurrencyLimiter(limit);
  const promises = tasks.map((task) => limiter.run(task));
  return Promise.all(promises);
}

/**
 * Execute promises in parallel and return as they complete
 */
export async function* parallelStream<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): AsyncGenerator<T> {
  const limiter = new ConcurrencyLimiter(limit);
  const promises = tasks.map((task) => limiter.run(task));

  // Yield results as they complete
  for (const promise of promises) {
    yield await promise;
  }
}
