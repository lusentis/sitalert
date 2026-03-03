"use client";

import type { GeoJSONFeature } from "@travelrisk/db";
import {
  CATEGORY_METADATA,
  SEVERITY_LEVELS,
  formatRelativeTime,
  isEventCategory,
} from "@travelrisk/shared";
import { SeverityBadge } from "@/components/common/severity-badge";
import { NewBadge } from "@/components/common/new-badge";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { NEW_EVENT_THRESHOLD_MINUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";

interface EventCardProps {
  feature: GeoJSONFeature;
  onClick: (feature: GeoJSONFeature) => void;
  isSelected?: boolean;
}

export function EventCard({ feature, onClick, isSelected }: EventCardProps) {
  const { properties } = feature;
  const categoryKey = properties.category;
  const categoryMeta = isEventCategory(categoryKey)
    ? CATEGORY_METADATA[categoryKey]
    : null;
  const CategoryIcon = isEventCategory(categoryKey)
    ? CATEGORY_ICONS[categoryKey]
    : null;
  const isNew = properties.ageMinutes < NEW_EVENT_THRESHOLD_MINUTES;
  const severityColor = SEVERITY_LEVELS[properties.severity]?.color ?? "#9CA3AF";

  return (
    <button
      onClick={() => onClick(feature)}
      aria-label={properties.title}
      className={cn(
        "w-full text-left p-3 rounded-lg border border-border border-l-[3px] hover:bg-accent/50 transition-[color,background-color,border-color,box-shadow,transform] duration-150 overflow-hidden motion-safe:hover:-translate-y-[1px] motion-safe:active:translate-y-0",
        isSelected && "ring-1 ring-primary/60 bg-accent/30",
        properties.severity >= 4 && !isSelected && "bg-red-500/[0.03]",
        isNew && "motion-safe:animate-slide-in",
      )}
      style={{ borderLeftColor: severityColor }}
    >
      <div className="flex items-start gap-2">
        {CategoryIcon && categoryMeta && (
          <div
            className="mt-0.5 shrink-0"
            style={{ color: categoryMeta.color }}
          >
            <CategoryIcon className="h-4 w-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <h4 className="text-sm font-medium line-clamp-2 flex-1">
              {properties.title}
            </h4>
            {isNew && <NewBadge />}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{properties.locationName}</span>
          </div>
          <div className="flex items-center gap-2">
            <SeverityBadge
              severity={properties.severity}
              className="text-[10px] px-1.5 py-0"
            />
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(properties.timestamp)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
