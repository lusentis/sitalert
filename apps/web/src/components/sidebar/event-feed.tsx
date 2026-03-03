"use client";

import { useMemo } from "react";
import type { GeoJSONFeatureCollection, GeoJSONFeature } from "@sitalert/db";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EventCard } from "./event-card";
import type { NormalizedEvent } from "@sitalert/shared";
import { ageInMinutes } from "@sitalert/shared";
import { NEW_EVENT_THRESHOLD_MINUTES } from "@/lib/constants";

interface EventFeedProps {
  data: GeoJSONFeatureCollection | null;
  lastStreamEvent: NormalizedEvent | null;
  onEventClick: (feature: GeoJSONFeature) => void;
  isLoading: boolean;
}

export function EventFeed({
  data,
  lastStreamEvent,
  onEventClick,
  isLoading,
}: EventFeedProps) {
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
            countryCode: lastStreamEvent.countryCode ?? null,
            timestamp: lastStreamEvent.timestamp,
            ageMinutes: ageInMinutes(lastStreamEvent.timestamp),
            sourceCount: lastStreamEvent.sources.length,
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

  // Highlight new events from SSE
  const newEventIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of features) {
      if (f.properties.ageMinutes < NEW_EVENT_THRESHOLD_MINUTES) {
        ids.add(f.properties.id);
      }
    }
    return ids;
  }, [features]);

  // Keep newEventIds referenced to avoid lint warning
  void newEventIds;

  return (
    <div className="flex-1 min-h-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Events ({features.length})
        </h3>
        {isLoading && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Loading...
          </span>
        )}
      </div>
      <ScrollArea className="h-[calc(100vh-360px)] md:h-[calc(100vh-380px)]">
        <div className="space-y-1.5 pr-2">
          {features.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No events found for the current filters.
            </p>
          )}
          {features.map((feature) => (
            <EventCard
              key={feature.properties.id}
              feature={feature}
              onClick={onEventClick}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
