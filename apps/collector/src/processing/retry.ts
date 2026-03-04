/**
 * Retry wrapper with exponential backoff for rate-limited LLM calls.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, baseDelayMs = 1000 } = {},
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const t0 = performance.now();
      const result = await fn();
      const ms = (performance.now() - t0).toFixed(0);
      if (attempt > 1) {
        console.log(`[retry] Succeeded on attempt ${attempt} (${ms}ms)`);
      }
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        message.includes("Rate limit") || message.includes("429");

      if (!isRateLimit || attempt === maxAttempts) {
        throw err;
      }

      // Parse "try again in Xs" from error message
      const match = message.match(/try again in ([\d.]+)s/);
      const waitMs = match
        ? Math.ceil(parseFloat(match[1]) * 1000) + 500
        : baseDelayMs * Math.pow(2, attempt - 1);

      console.warn(
        `[retry] Rate limited (attempt ${attempt}/${maxAttempts}), waiting ${waitMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("withRetry: exhausted attempts");
}
