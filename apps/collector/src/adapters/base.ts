import type { Platform, RawEvent, EventCallback } from "@sitalert/shared";

export abstract class BaseAdapter {
  abstract readonly name: string;
  abstract readonly platform: Platform;
  readonly defaultConfidence: number;
  readonly pollingInterval: number;

  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private callback: EventCallback | null = null;
  private consecutiveErrors = 0;
  private readonly maxBackoff = 300_000; // 5 min max

  constructor(opts: { defaultConfidence?: number; pollingInterval: number }) {
    this.defaultConfidence = opts.defaultConfidence ?? 1.0;
    this.pollingInterval = opts.pollingInterval;
  }

  async start(callback: EventCallback): Promise<void> {
    this.callback = callback;
    this.consecutiveErrors = 0;
    await this.init();
    // Run first poll immediately, then schedule subsequent ones
    try {
      await this.poll();
      this.consecutiveErrors = 0;
    } catch (err: unknown) {
      this.consecutiveErrors++;
      console.error(
        `[${this.name}] Initial poll error:`,
        err instanceof Error ? err.message : err,
      );
    }
    this.scheduleNext();
  }

  private scheduleNext(): void {
    const delay =
      this.consecutiveErrors > 0
        ? Math.min(
            this.pollingInterval * Math.pow(2, this.consecutiveErrors),
            this.maxBackoff,
          )
        : this.pollingInterval;

    this.intervalId = setTimeout(async () => {
      try {
        await this.poll();
        this.consecutiveErrors = 0;
      } catch (err: unknown) {
        this.consecutiveErrors++;
        console.error(
          `[${this.name}] Poll error (attempt ${this.consecutiveErrors}):`,
          err,
        );
      }
      this.scheduleNext();
    }, delay);
  }

  async stop(): Promise<void> {
    if (this.intervalId) clearTimeout(this.intervalId);
    await this.cleanup();
  }

  async healthCheck(): Promise<boolean> {
    return this.consecutiveErrors < 5;
  }

  protected emit(event: RawEvent): void {
    this.callback?.(event);
  }

  protected async init(): Promise<void> {
    // Override in subclass if needed
  }

  protected async cleanup(): Promise<void> {
    // Override in subclass if needed
  }

  protected abstract poll(): Promise<void>;
}
