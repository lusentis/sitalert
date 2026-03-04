"use client";

import { useEffect, useMemo, useRef } from "react";
import type { GeoJSONFeatureCollection, GeoJSONFeature } from "@travelrisk/db";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EventCard } from "./event-card";
import type { NormalizedEvent } from "@travelrisk/shared";
import { ageInMinutes } from "@travelrisk/shared";

interface EventFeedProps {
  data: GeoJSONFeatureCollection | null;
  lastStreamEvent: NormalizedEvent | null;
  onEventClick: (feature: GeoJSONFeature) => void;
  isLoading: boolean;
  selectedEventId?: string | null;
}

export function EventFeed({
  data,
  lastStreamEvent,
  onEventClick,
  isLoading,
  selectedEventId,
}: EventFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const features = useMemo(() => {
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
    return featureList.sort(
      (a, b) =>
        new Date(b.properties.timestamp).getTime() -
        new Date(a.properties.timestamp).getTime(),
    );
  }, [data, lastStreamEvent]);

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
          <span className="ml-1.5 text-foreground font-bold tabular-nums">
            {features.length}
          </span>
        </h3>
        {isLoading && (
          <span className="text-xs text-muted-foreground motion-safe:animate-pulse">
            Loading...
          </span>
        )}
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} role="feed" aria-busy={isLoading} className="space-y-1.5 p-0.5 pr-2">
          {features.length === 0 && !isLoading && (
            <div className="text-center py-10 space-y-3">
              <div className="relative size-10 mx-auto opacity-40">
                <div className="absolute inset-0 rounded-full border border-current" />
                <div className="absolute inset-2.5 rounded-full border border-current" />
                <div className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  All clear for these filters.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Try a wider time range or fewer category filters.
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
        </div>
      </ScrollArea>
    </div>
  );
}
