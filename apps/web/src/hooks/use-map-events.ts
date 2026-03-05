"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONFeatureCollection } from "@travelrisk/db";
import { fetchEventsGeoJSON } from "@/lib/api-client";

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface UseMapEventsOptions {
  categories: string[];
  minSeverity: number;
  after: string;
}

interface UseMapEventsReturn {
  data: GeoJSONFeatureCollection | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches all events matching the current filters (no bbox — we get everything).
 * The map handles viewport clipping natively; the sidebar can filter by bbox client-side.
 * Refetches only when filters change or refetch() is called (e.g. on SSE event).
 */
export function useMapEvents(options: UseMapEventsOptions): UseMapEventsReturn {
  const { categories, minSeverity, after } = options;
  const [data, setData] = useState<GeoJSONFeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);

  const doFetch = useCallback(() => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentFetchId = ++fetchIdRef.current;

    setIsLoading(true);
    setError(null);

    fetchEventsGeoJSON(
      {
        categories: categories.length > 0 ? categories : undefined,
        minSeverity,
        after,
      },
      controller.signal,
    )
      .then((result) => {
        if (currentFetchId === fetchIdRef.current) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (currentFetchId === fetchIdRef.current) {
          const message =
            err instanceof TypeError
              ? "Network error — check your connection and try again."
              : err instanceof Error ? err.message : "Something went wrong. Try again.";
          setError(message);
          setIsLoading(false);
        }
      });
  }, [categories, minSeverity, after]);

  // Fetch when filters change
  useEffect(() => {
    doFetch();
  }, [doFetch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { data, isLoading, error, refetch: doFetch };
}
