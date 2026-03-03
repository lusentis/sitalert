/**
 * Telegram adapter using GramJS.
 * Listens to all channels/groups the authenticated user has joined.
 * The LLM classifier downstream filters out irrelevant messages.
 *
 * Required env vars: TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION_STRING
 */
import type { Platform, RawEvent, EventCallback } from "@sitalert/shared";

export class TelegramAdapter {
  readonly name = "telegram";
  readonly platform: Platform = "telegram";
  readonly defaultConfidence = 0.5;

  private client: unknown = null;
  private callback: EventCallback | null = null;

  static isAvailable(): boolean {
    return !!(
      process.env["TELEGRAM_API_ID"] &&
      process.env["TELEGRAM_API_HASH"] &&
      process.env["TELEGRAM_SESSION_STRING"]
    );
  }

  async start(callback: EventCallback): Promise<void> {
    if (!TelegramAdapter.isAvailable()) {
      console.log("[telegram] Missing env vars, skipping Telegram adapter");
      return;
    }

    this.callback = callback;

    try {
      const { TelegramClient } = await import("telegram" as string) as {
        TelegramClient: new (
          session: unknown,
          apiId: number,
          apiHash: string,
          opts: Record<string, unknown>,
        ) => {
          connect: () => Promise<void>;
          addEventHandler: (
            handler: (event: { message?: { peerId?: unknown; message?: string; date?: number; id?: number } }) => void,
            filter: unknown,
          ) => void;
          disconnect: () => Promise<void>;
        };
      };
      const { StringSession } = await import("telegram/sessions/index.js" as string) as {
        StringSession: new (session: string) => unknown;
      };
      const { NewMessage } = await import("telegram/events/index.js" as string) as {
        NewMessage: new (opts: Record<string, unknown>) => unknown;
      };

      const apiId = parseInt(process.env["TELEGRAM_API_ID"] ?? "0", 10);
      const apiHash = process.env["TELEGRAM_API_HASH"] ?? "";
      const sessionString = process.env["TELEGRAM_SESSION_STRING"] ?? "";

      const session = new StringSession(sessionString);
      const client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
      });

      await client.connect();
      this.client = client;

      console.log("[telegram] Connected, listening to all joined channels");

      // Listen to all incoming channel/group messages — the LLM classifier
      // downstream decides what's relevant.
      client.addEventHandler(
        (event: { message?: { peerId?: unknown; message?: string; date?: number; id?: number } }) => {
          const message = event.message;
          if (!message?.message) return;

          const raw: RawEvent = {
            sourceAdapter: this.name,
            platform: this.platform,
            externalId: `tg-${message.id ?? Date.now()}`,
            rawText: message.message,
            timestamp: message.date
              ? new Date(message.date * 1000).toISOString()
              : new Date().toISOString(),
            confidence: this.defaultConfidence,
            media: [],
          };

          this.callback?.(raw);
        },
        new NewMessage({}),
      );
    } catch (err: unknown) {
      console.error(
        "[telegram] Failed to start Telegram adapter:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  async stop(): Promise<void> {
    if (this.client) {
      const client = this.client as { disconnect: () => Promise<void> };
      await client.disconnect();
    }
  }

  async healthCheck(): Promise<boolean> {
    return this.client !== null;
  }
}
