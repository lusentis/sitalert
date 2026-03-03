"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONFeatureCollection } from "@sitalert/db";
import { fetchEventsGeoJSON } from "@/lib/api-client";
import { VIEWPORT_DEBOUNCE_MS } from "@/lib/constants";

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface UseMapEventsOptions {
  bbox: BBox | null;
  categories: string[];
  minSeverity: number;
  minConfidence: number;
  after: string;
}

interface UseMapEventsReturn {
  data: GeoJSONFeatureCollection | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMapEvents(options: UseMapEventsOptions): UseMapEventsReturn {
  const { bbox, categories, minSeverity, minConfidence, after } = options;
  const [data, setData] = useState<GeoJSONFeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);

  const doFetch = useCallback(() => {
    if (!bbox) return;

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
        bbox,
        categories: categories.length > 0 ? categories : undefined,
        minSeverity,
        minConfidence,
        after,
      },
      controller.signal,
    )
      .then((result) => {
        // Only update if this is still the latest request
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
            err instanceof Error ? err.message : "Unknown error fetching events";
          setError(message);
          setIsLoading(false);
        }
      });
  }, [bbox, categories, minSeverity, minConfidence, after]);

  // Debounce on viewport (bbox) changes
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      doFetch();
    }, VIEWPORT_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
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
