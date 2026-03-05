"use client";

import { useEffect, useRef } from "react";
import type { GeoJSONFeatureCollection, GeoJSONFeature } from "@travelrisk/db";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EventCard } from "./event-card";
import type { NormalizedEvent } from "@travelrisk/shared";
import { ageInMinutes } from "@travelrisk/shared";
import { Clock } from "lucide-react";

interface EventFeedProps {
  data: GeoJSONFeatureCollection | null;
  lastStreamEvent: NormalizedEvent | null;
  onEventClick: (feature: GeoJSONFeature) => void;
  isLoading: boolean;
  selectedEventId?: string | null;
  searchQuery?: string;
}

export function EventFeed({
  data,
  lastStreamEvent,
  onEventClick,
  isLoading,
  selectedEventId,
  searchQuery,
}: EventFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const features = (() => {
    if (!data) return [];

    const featureList = [...data.features];

    // Merge SSE event if not already in the list
    if (lastStreamEvent) {
      const exists = featureList.some(
        (f) => f.properties.id === lastStreamEvent.id,
      );
      if (!exists) {
        const sseFeature: GeoJSONFeature = {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [
              lastStreamEvent.location.lng,
              lastStreamEvent.location.lat,
            ],
          },
          properties: {
            id: lastStreamEvent.id,
            title: lastStreamEvent.title,
            summary: lastStreamEvent.summary,
            category: lastStreamEvent.category,
            severity: lastStreamEvent.severity,
            confidence: lastStreamEvent.confidence,
            locationName: lastStreamEvent.locationName,
            countryCodes: lastStreamEvent.countryCodes ?? null,
            timestamp: lastStreamEvent.timestamp,
            ageMinutes: ageInMinutes(lastStreamEvent.timestamp),
            sourceCount: lastStreamEvent.sources.length,
            sources: lastStreamEvent.sources.map((s) => ({ name: s.name, platform: s.platform, url: s.url })),
          },
        };
        featureList.unshift(sseFeature);
      }
    }

    // Sort newest first
    const sorted = featureList.sort(
      (a, b) =>
        new Date(b.properties.timestamp).getTime() -
        new Date(a.properties.timestamp).getTime(),
    );

    // Filter by search query
    if (!searchQuery?.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter(
      (f) =>
        f.properties.title.toLowerCase().includes(q) ||
        (f.properties.summary?.toLowerCase().includes(q) ?? false) ||
        (f.properties.locationName?.toLowerCase().includes(q) ?? false) ||
        (f.properties.countryCodes?.some((c: string) => c.toLowerCase().includes(q)) ?? false),
    );
  })();

  // Scroll selected card into view
  useEffect(() => {
    if (!selectedEventId || !scrollRef.current) return;
    const card = scrollRef.current.querySelector(`[data-event-id="${selectedEventId}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedEventId]);

  return (
    <div className="flex-1 min-h-0 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Events
          {!isLoading && (
            <span className="ml-1.5 text-foreground font-bold tabular-nums">
              {features.length}
            </span>
          )}
        </h3>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} role="feed" aria-busy={isLoading} className="space-y-1.5 p-0.5 pr-2">
          {isLoading && features.length === 0 && (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg border border-border border-l-[3px] border-l-muted">
                <div className="flex items-start gap-2">
                  <Skeleton className="h-4 w-4 mt-0.5 rounded shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-[90%]" />
                    <div className="flex items-center gap-1">
                      <Skeleton className="h-3 w-3 rounded" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-14 rounded-full" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          {features.length === 0 && !isLoading && (
            <div className="text-center py-10 space-y-3">
              <div className="relative size-10 mx-auto opacity-40">
                <div className="absolute inset-0 rounded-full border border-current" />
                <div className="absolute inset-2.5 rounded-full border border-current" />
                <div className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  No events match your filters.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Try a different time range or broaden your filters.
                </p>
              </div>
            </div>
          )}
          {features.map((feature) => (
            <div key={feature.properties.id} data-event-id={feature.properties.id}>
              <EventCard
                feature={feature}
                onClick={onEventClick}
                isSelected={feature.properties.id === selectedEventId}
              />
            </div>
          ))}
          {features.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 py-3 text-[10px] text-muted-foreground/50">
              <Clock className="h-3 w-3" />
              <span>Showing last 24 hours</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
