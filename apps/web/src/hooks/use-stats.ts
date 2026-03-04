"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventStats } from "@travelrisk/db";
import { fetchStats } from "@/lib/api-client";

interface UseStatsReturn {
  data: EventStats | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useStats(): UseStatsReturn {
  const [data, setData] = useState<EventStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const doFetch = useCallback(() => {
    const currentFetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    fetchStats()
      .then((result) => {
        if (currentFetchId === fetchIdRef.current) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (currentFetchId === fetchIdRef.current) {
          const message =
            err instanceof Error ? err.message : "Unknown error fetching stats";
          setError(message);
          setIsLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  return { data, isLoading, error, refetch: doFetch };
}
