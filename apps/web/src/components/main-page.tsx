"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeoJSONFeature } from "@travelrisk/db";
import { useFilters } from "@/hooks/use-filters";
import { useMapEvents } from "@/hooks/use-map-events";
import { useEventStream } from "@/hooks/use-event-stream";
import { MapView } from "@/components/map/map-view";
import { Sidebar } from "@/components/sidebar/sidebar";
import { TimelineBar } from "@/components/timeline/timeline-bar";

export function MainPage() {
  const filters = useFilters();
  const [selectedEvent, setSelectedEvent] = useState<GeoJSONFeature | null>(
    null,
  );

  const { data, isLoading, refetch } = useMapEvents({
    categories: filters.categories,
    minSeverity: filters.minSeverity,
    minConfidence: filters.minConfidence,
    after: filters.after,
  });

  const { lastEvent, isConnected } = useEventStream();

  // Refetch when a new SSE event arrives
  useEffect(() => {
    if (lastEvent) {
      refetch();
    }
  }, [lastEvent, refetch]);

  // Derive category counts from loaded data so they match visible events
  const categoryCounts = useMemo(() => {
    if (!data) return undefined;
    const counts: Record<string, number> = {};
    for (const f of data.features) {
      const cat = f.properties.category;
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  const handleBoundsChange = useCallback(() => {
    // Bounds tracked by MapView internally; kept for MapInitializer trigger
  }, []);

  const handleEventSelect = useCallback((feature: GeoJSONFeature) => {
    setSelectedEvent(feature);
  }, []);

  const handleDeselectEvent = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        filters={filters}
        data={data}
        lastStreamEvent={lastEvent}
        isLoading={isLoading}
        isConnected={isConnected}
        counts={categoryCounts}
        onEventClick={handleEventSelect}
        selectedEventId={selectedEvent?.properties.id ?? null}
      />
      <div className="relative flex-1">
        <MapView
          data={data}
          onBoundsChange={handleBoundsChange}
          onEventSelect={handleEventSelect}
          selectedEvent={selectedEvent}
          onDeselectEvent={handleDeselectEvent}
        />
        <TimelineBar
          value={filters.timeRange}
          onChange={filters.setTimeRange}
        />
      </div>
    </div>
  );
}
