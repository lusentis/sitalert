"use client";

import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { timeRangeToDate } from "@travelrisk/shared";

const FEED_TABS = ["situations", "events"] as const;
export type FeedTab = (typeof FEED_TABS)[number];

const filtersParsers = {
  categories: parseAsArrayOf(parseAsString).withDefault([]),
  minSeverity: parseAsInteger.withDefault(2),
  q: parseAsString.withDefault(""),
  tab: parseAsStringLiteral(FEED_TABS).withDefault("situations"),
  advisories: parseAsBoolean.withDefault(true),
};

const filtersOptions = {
  shallow: true,
  throttleMs: 300,
} as const;

export function useFilters() {
  const [filters, setFilters] = useQueryStates(filtersParsers, filtersOptions);

  const toggleCategory = (category: string) => {
    setFilters((prev) => {
      const current = prev.categories;
      const next = current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category];
      return { ...prev, categories: next };
    });
  };

  const setMinSeverity = (value: number) => {
    setFilters((prev) => ({ ...prev, minSeverity: value }));
  };

  const setCategories = (categories: string[]) => {
    setFilters((prev) => ({ ...prev, categories }));
  };

  const setSearch = (q: string) => {
    setFilters((prev) => ({ ...prev, q }));
  };

  const setTab = (tab: FeedTab) => {
    setFilters((prev) => ({ ...prev, tab }));
  };

  const toggleAdvisories = () => {
    setFilters((prev) => ({ ...prev, advisories: !prev.advisories }));
  };

  const after = timeRangeToDate("24h").toISOString();

  return {
    ...filters,
    after,
    toggleCategory,
    setCategories,
    setMinSeverity,
    setSearch,
    setTab,
    toggleAdvisories,
  };
}

export type Filters = ReturnType<typeof useFilters>;
