export async function retryTransient<T>(
  operation: () => Promise<T>,
  isTransient: (error: unknown) => boolean,
  options: { attempts?: number; delayMs?: number; wait?: (delayMs: number) => Promise<void> } = {}
): Promise<T> {
  const attempts = options.attempts ?? 12;
  const delayMs = options.delayMs ?? 10_000;
  const wait = options.wait ?? (delay => new Promise(resolve => setTimeout(resolve, delay)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransient(error)) throw error;
      await wait(delayMs);
    }
  }
  throw lastError;
}
