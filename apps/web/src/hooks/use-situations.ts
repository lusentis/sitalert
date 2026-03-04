"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SituationWithCoords } from "@travelrisk/db";
import { fetchSituations } from "@/lib/api-client";

interface UseSituationsOptions {
  categories: string[];
  minSeverity: number;
  after: string;
}

interface UseSituationsReturn {
  data: SituationWithCoords[] | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSituations(options: UseSituationsOptions): UseSituationsReturn {
  const { categories, minSeverity, after } = options;
  const [data, setData] = useState<SituationWithCoords[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);

  const doFetch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentFetchId = ++fetchIdRef.current;

    setIsLoading(true);
    setError(null);

    fetchSituations(
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
            err instanceof Error ? err.message : "Unknown error fetching situations";
          setError(message);
          setIsLoading(false);
        }
      });
  }, [categories, minSeverity, after]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { data, isLoading, error, refetch: doFetch };
}
