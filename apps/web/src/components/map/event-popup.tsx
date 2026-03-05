"use client";

import type { GeoJSONFeature } from "@travelrisk/db";
import { CATEGORY_METADATA, formatRelativeTime, isEventCategory } from "@travelrisk/shared";
import { MapPopup } from "@/components/ui/map";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/common/severity-badge";
import { MapPin, Clock, X, ExternalLink, Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { CATEGORY_ICONS } from "@/lib/category-icons";

interface EventPopupProps {
  features: GeoJSONFeature[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
}

function formatSourceName(name: string): string {
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EventPopup({ features, currentIndex, onNavigate, onClose }: EventPopupProps) {
  const feature = features[currentIndex];
  if (!feature) return null;

  const { properties, geometry } = feature;
  const [lng, lat] = geometry.coordinates;
  const categoryKey = properties.category;
  const categoryMeta = isEventCategory(categoryKey)
    ? CATEGORY_METADATA[categoryKey]
    : null;
  const CategoryIcon = isEventCategory(categoryKey)
    ? CATEGORY_ICONS[categoryKey]
    : null;

  const sources = properties.sources ?? [];
  const firstUrl = sources.find((s) => s.url)?.url;
  const hasMultiple = features.length > 1;

  return (
    <MapPopup longitude={lng} latitude={lat} onClose={onClose}>
      <div className="bg-card text-card-foreground border border-border rounded-lg shadow-lg p-3 max-w-[320px] min-w-[240px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-sm leading-tight flex-1">
            {properties.title}
          </h3>
          <button
            type="button"
            aria-label="Close popup"
            onClick={onClose}
            className="-m-1 p-1 rounded text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring transition-colors shrink-0"
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
          <p className="text-xs text-muted-foreground line-clamp-3 mb-2">
            {properties.summary}
          </p>
        )}

        {sources.length > 0 && (
          <div className="flex items-start gap-1 text-xs text-muted-foreground mb-2">
            <Layers className="h-3 w-3 shrink-0 mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {sources.map((source, i) =>
                source.url ? (
                  <a
                    key={i}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {formatSourceName(source.name)}
                  </a>
                ) : (
                  <span key={i}>{formatSourceName(source.name)}</span>
                ),
              )}
            </div>
          </div>
        )}

        {firstUrl && (
          <a
            href={firstUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
          >
            <ExternalLink className="h-3 w-3" />
            Read more
          </a>
        )}

        {hasMultiple && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
            <button
              type="button"
              aria-label="Previous event"
              onClick={() => onNavigate((currentIndex - 1 + features.length) % features.length)}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {currentIndex + 1} / {features.length}
            </span>
            <button
              type="button"
              aria-label="Next event"
              onClick={() => onNavigate((currentIndex + 1) % features.length)}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </MapPopup>
  );
}
