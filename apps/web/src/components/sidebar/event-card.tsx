"use client";

import type { GeoJSONFeature } from "@sitalert/db";
import {
  CATEGORY_METADATA,
  formatRelativeTime,
  type EventCategory,
} from "@sitalert/shared";
import { SeverityBadge } from "@/components/common/severity-badge";
import { NewBadge } from "@/components/common/new-badge";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { NEW_EVENT_THRESHOLD_MINUTES } from "@/lib/constants";
import { MapPin } from "lucide-react";

interface EventCardProps {
  feature: GeoJSONFeature;
  onClick: (feature: GeoJSONFeature) => void;
}

function isEventCategory(value: string): value is EventCategory {
  return value in CATEGORY_METADATA;
}

export function EventCard({ feature, onClick }: EventCardProps) {
  const { properties } = feature;
  const categoryKey = properties.category;
  const categoryMeta = isEventCategory(categoryKey)
    ? CATEGORY_METADATA[categoryKey]
    : null;
  const CategoryIcon = isEventCategory(categoryKey)
    ? CATEGORY_ICONS[categoryKey]
    : null;
  const isNew = properties.ageMinutes < NEW_EVENT_THRESHOLD_MINUTES;

  return (
    <button
      onClick={() => onClick(feature)}
      className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
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
            <h4 className="text-sm font-medium truncate flex-1">
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
