"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import {
  EVENT_CATEGORIES,
  CATEGORY_METADATA,
  SEVERITY_LEVELS,
  type EventCategory,
} from "@travelrisk/shared";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { ADVISORY_LEVELS } from "@/lib/compute-country-risk";

interface MapLegendProps {
  choroplethActive?: boolean;
}

export function MapLegend({ choroplethActive = false }: MapLegendProps) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <div className="bg-card/90 backdrop-blur border border-border rounded-lg shadow-lg p-3 w-52 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Legend
          </span>
          <button
            onClick={() => setExpanded(false)}
            aria-expanded={expanded}
            aria-label="Collapse legend"
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Categories */}
        <div className="space-y-1">
          {EVENT_CATEGORIES.map((category: EventCategory) => {
            const meta = CATEGORY_METADATA[category];
            const Icon = CATEGORY_ICONS[category];
            return (
              <div key={category} className="flex items-center gap-2">
                <Icon
                  className="h-3 w-3 shrink-0"
                  style={{ color: meta.color }}
                />
                <span className="text-[11px] text-muted-foreground">
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Severity scale */}
        <div className="mt-2.5 pt-2 border-t border-border">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Severity
          </span>
          <div className="flex gap-0.5 mt-1">
            {([1, 2, 3, 4, 5] as const).map((level) => {
              const sev = SEVERITY_LEVELS[level];
              return (
                <div key={level} className="flex-1 text-center">
                  <div
                    className="h-1.5 rounded-full"
                    style={{ backgroundColor: sev.color }}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    {level}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] text-muted-foreground">Minor</span>
            <span className="text-[9px] text-muted-foreground">
              Catastrophic
            </span>
          </div>
        </div>

        {/* Country risk scale — shown when choropleth is active */}
        {choroplethActive && (
          <div className="mt-2.5 pt-2 border-t border-border">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Travel Advisory
            </span>
            <div className="flex gap-0.5 mt-1">
              {ADVISORY_LEVELS.map((level) => (
                <div key={level.label} className="flex-1 text-center">
                  <div
                    className="h-1.5 rounded-full"
                    style={{ backgroundColor: level.color }}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    {level.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setExpanded(true)}
      aria-expanded={expanded}
      aria-label="Show map legend"
      className="bg-card/90 backdrop-blur border border-border rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg text-muted-foreground hover:text-foreground transition-colors"
    >
      <Info className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">Legend</span>
    </button>
  );
}
