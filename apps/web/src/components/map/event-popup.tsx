"use client";

import type { GeoJSONFeature } from "@sitalert/db";
import { CATEGORY_METADATA } from "@sitalert/shared";
import { formatRelativeTime, type EventCategory } from "@sitalert/shared";
import { MapPopup } from "@/components/ui/map";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/common/severity-badge";
import { MapPin, Clock, X } from "lucide-react";
import { CATEGORY_ICONS } from "@/lib/category-icons";

interface EventPopupProps {
  feature: GeoJSONFeature;
  onClose: () => void;
}

function isEventCategory(value: string): value is EventCategory {
  return value in CATEGORY_METADATA;
}

export function EventPopup({ feature, onClose }: EventPopupProps) {
  const { properties, geometry } = feature;
  const [lng, lat] = geometry.coordinates;
  const categoryKey = properties.category;
  const categoryMeta = isEventCategory(categoryKey)
    ? CATEGORY_METADATA[categoryKey]
    : null;
  const CategoryIcon = isEventCategory(categoryKey)
    ? CATEGORY_ICONS[categoryKey]
    : null;

  return (
    <MapPopup longitude={lng} latitude={lat} onClose={onClose}>
      <div className="bg-card text-card-foreground border border-border rounded-lg shadow-lg p-3 max-w-[280px] min-w-[220px]">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-sm leading-tight flex-1">
            {properties.title}
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {categoryMeta && (
            <Badge
              variant="outline"
              className="text-xs gap-1"
              style={{
                borderColor: `${categoryMeta.color}60`,
                color: categoryMeta.color,
              }}
            >
              {CategoryIcon && <CategoryIcon className="h-3 w-3" />}
              {categoryMeta.label}
            </Badge>
          )}
          <SeverityBadge severity={properties.severity} className="text-xs" />
        </div>

        <div className="space-y-1 text-xs text-muted-foreground mb-2">
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{properties.locationName}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{formatRelativeTime(properties.timestamp)}</span>
          </div>
        </div>

        {properties.summary && (
          <p className="text-xs text-muted-foreground line-clamp-3">
            {properties.summary}
          </p>
        )}
      </div>
    </MapPopup>
  );
}
