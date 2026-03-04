"use client";

import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from "nuqs";
import { useCallback, useMemo } from "react";
import { timeRangeToDate } from "@travelrisk/shared";

const filtersParsers = {
  categories: parseAsArrayOf(parseAsString).withDefault([]),
  minSeverity: parseAsInteger.withDefault(2),
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

  const setCategories = useCallback(
    (categories: string[]) => {
      setFilters((prev) => ({ ...prev, categories }));
    },
    [setFilters],
  );

  const after = useMemo(
    () => timeRangeToDate("24h").toISOString(),
    [],
  );

  return {
    ...filters,
    after,
    toggleCategory,
    setCategories,
    setMinSeverity,
  };
}

export type Filters = ReturnType<typeof useFilters>;
