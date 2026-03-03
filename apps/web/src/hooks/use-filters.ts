"use client";

import {
  parseAsArrayOf,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { useCallback, useMemo } from "react";
import { timeRangeToDate, type TimeRange } from "@travelrisk/shared";

const TIME_RANGE_OPTIONS = ["1h", "6h", "24h", "7d", "30d"] as const;

const filtersParsers = {
  categories: parseAsArrayOf(parseAsString).withDefault([]),
  minSeverity: parseAsInteger.withDefault(1),
  minConfidence: parseAsFloat.withDefault(0),
  timeRange: parseAsStringLiteral(TIME_RANGE_OPTIONS).withDefault("24h"),
};

const filtersOptions = {
  shallow: true,
  throttleMs: 300,
} as const;

export function useFilters() {
  const [filters, setFilters] = useQueryStates(filtersParsers, filtersOptions);

  const toggleCategory = useCallback(
    (category: string) => {
      setFilters((prev) => {
        const current = prev.categories;
        const next = current.includes(category)
          ? current.filter((c) => c !== category)
          : [...current, category];
        return { ...prev, categories: next };
      });
    },
    [setFilters],
  );

  const setMinSeverity = useCallback(
    (value: number) => {
      setFilters((prev) => ({ ...prev, minSeverity: value }));
    },
    [setFilters],
  );

  const setMinConfidence = useCallback(
    (value: number) => {
      setFilters((prev) => ({ ...prev, minConfidence: value }));
    },
    [setFilters],
  );

  const setCategories = useCallback(
    (categories: string[]) => {
      setFilters((prev) => ({ ...prev, categories }));
    },
    [setFilters],
  );

  const setTimeRange = useCallback(
    (value: TimeRange) => {
      setFilters((prev) => ({ ...prev, timeRange: value }));
    },
    [setFilters],
  );

  const after = useMemo(
    () => timeRangeToDate(filters.timeRange).toISOString(),
    [filters.timeRange],
  );

  return {
    ...filters,
    after,
    toggleCategory,
    setCategories,
    setMinSeverity,
    setMinConfidence,
    setTimeRange,
  };
}

export type Filters = ReturnType<typeof useFilters>;
