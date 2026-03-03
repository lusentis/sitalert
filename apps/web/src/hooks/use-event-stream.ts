"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NormalizedEventSchema, type NormalizedEvent } from "@travelrisk/shared";
import { SSE_CONFIG } from "@/lib/constants";

interface UseEventStreamReturn {
  lastEvent: NormalizedEvent | null;
  isConnected: boolean;
}

function parseSSEEvent(data: string): NormalizedEvent | null {
  try {
    const parsed: unknown = JSON.parse(data);
    const result = NormalizedEventSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

export function useEventStream(): UseEventStreamReturn {
  const [lastEvent, setLastEvent] = useState<NormalizedEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const retryCountRef = useRef(0);
  const retryDelayRef = useRef(SSE_CONFIG.initialDelayMs);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    cleanup();

    if (retryCountRef.current >= SSE_CONFIG.maxRetries) {
      return;
    }

    const eventSource = new EventSource("/api/stream");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      retryCountRef.current = 0;
      retryDelayRef.current = SSE_CONFIG.initialDelayMs;
    };

    eventSource.addEventListener("new_event", (event) => {
      const parsed = parseSSEEvent(event.data);
      if (parsed) {
        setLastEvent(parsed);
      }
    });

    eventSource.addEventListener("update_event", (event) => {
      const parsed = parseSSEEvent(event.data);
      if (parsed) {
        setLastEvent(parsed);
      }
    });

    eventSource.addEventListener("heartbeat", () => {
      // Heartbeat received — connection is alive
    });

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
      setIsConnected(false);

      if (retryCountRef.current < SSE_CONFIG.maxRetries) {
        const delay = Math.min(retryDelayRef.current, SSE_CONFIG.maxDelayMs);
        reconnectTimerRef.current = setTimeout(() => {
          retryCountRef.current += 1;
          retryDelayRef.current *= SSE_CONFIG.multiplier;
          connect();
        }, delay);
      }
    };
  }, [cleanup]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  return { lastEvent, isConnected };
}
