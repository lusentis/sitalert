"use client";

import { useEffect, useRef, useState } from "react";
import type { SituationWithCoords } from "@travelrisk/db";
import { fetchSituations } from "@/lib/api-client";

interface UseSituationsOptions {
  categories: string[];
  minSeverity: number;
  after: string;
  initialData?: SituationWithCoords[] | null;
}

interface UseSituationsReturn {
  data: SituationWithCoords[] | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSituations(options: UseSituationsOptions): UseSituationsReturn {
  const { categories, minSeverity, after, initialData } = options;
  const [data, setData] = useState<SituationWithCoords[] | null>(initialData ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);
  const hasUsedInitialData = useRef(!!initialData);

  const doFetch = () => {
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
            err instanceof TypeError
              ? "Network error — check your connection and try again."
              : err instanceof Error ? err.message : "Something went wrong. Try again.";
          setError(message);
          setIsLoading(false);
        }
      });
  };

  useEffect(() => {
    if (hasUsedInitialData.current) {
      hasUsedInitialData.current = false;
      return;
    }
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
