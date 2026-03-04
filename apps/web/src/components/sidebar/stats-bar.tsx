"use client";

import type { EventStats } from "@travelrisk/db";
import { BarChart3, Globe, Clock } from "lucide-react";
import { formatRelativeTime } from "@travelrisk/shared";

interface StatsBarProps {
  stats: EventStats | null;
}

export function StatsBar({ stats }: StatsBarProps) {
  if (!stats) return null;

  const countryCount = Object.keys(stats.byCategory).length;

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
      <span className="flex items-center gap-1">
        <BarChart3 className="h-3 w-3" />
        <span className="font-medium text-foreground">{stats.total}</span> events
      </span>
      <span className="flex items-center gap-1">
        <Globe className="h-3 w-3" />
        <span className="font-medium text-foreground">{countryCount}</span> categories
      </span>
      {stats.lastEventAt && (
        <span className="flex items-center gap-1 ml-auto">
          <Clock className="h-3 w-3" />
          {formatRelativeTime(stats.lastEventAt)}
        </span>
      )}
    </div>
  );
}
