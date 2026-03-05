const HEARTBEAT_INTERVAL_MS = 30_000;
const CHANNEL = "events:new";

interface SSEMessage {
  event: string;
  data: string;
}

function formatSSE(message: SSEMessage): string {
  return `event: ${message.event}\ndata: ${message.data}\n\n`;
}

export async function GET(): Promise<Response> {
  const redisUrl = process.env["KV_REST_API_URL"] ?? process.env["UPSTASH_REDIS_REST_URL"];
  const redisToken = process.env["KV_REST_API_TOKEN"] ?? process.env["UPSTASH_REDIS_REST_TOKEN"];

  if (!redisUrl || !redisToken) {
    return new Response("Redis not configured", { status: 500 });
  }

  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let isActive = true;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(
          formatSSE({ event: "heartbeat", data: JSON.stringify({ ts: Date.now() }) }),
        ),
      );

      // Set up heartbeat
      heartbeatTimer = setInterval(() => {
        if (!isActive) return;
        try {
          controller.enqueue(
            encoder.encode(
              formatSSE({ event: "heartbeat", data: JSON.stringify({ ts: Date.now() }) }),
            ),
          );
        } catch {
          // Stream likely closed
          isActive = false;
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Poll Upstash Redis for new messages using SUBSCRIBE-like polling via LIST
      // Upstash REST doesn't support true pub/sub, so we use a polling approach
      // with BRPOP-like behavior via LIST operations
      const pollInterval = setInterval(async () => {
        if (!isActive) return;

        try {
          const response = await fetch(`${redisUrl}/lpop/${CHANNEL}`, {
            headers: {
              Authorization: `Bearer ${redisToken}`,
            },
          });

          if (!response.ok) return;

          const result: unknown = await response.json();
          if (
            result &&
            typeof result === "object" &&
            "result" in result &&
            (result as { result: unknown }).result !== null
          ) {
            const messageData = (result as { result: string }).result;
            try {
              controller.enqueue(
                encoder.encode(
                  formatSSE({ event: "new_event", data: messageData }),
                ),
              );
            } catch {
              isActive = false;
            }
          }
        } catch {
          // Redis poll error — continue polling
        }
      }, 2_000);

      // Store poll interval for cleanup
      const cleanup = () => {
        isActive = false;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        clearInterval(pollInterval);
      };

      // If the reader cancels, clean up
      // Note: Edge Runtime doesn't support AbortSignal on ReadableStream directly,
      // but the stream will be cancelled when the client disconnects
      void new Promise<void>((resolve) => {
        // This will resolve when the stream is cancelled
        const check = setInterval(() => {
          if (!isActive) {
            clearInterval(check);
            cleanup();
            resolve();
          }
        }, 5_000);
      });
    },
    cancel() {
      isActive = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
