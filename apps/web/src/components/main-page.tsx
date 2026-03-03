"use client";

import { useCallback, useEffect, useState } from "react";
import type { GeoJSONFeature } from "@sitalert/db";
import type { EventStats } from "@sitalert/db";
import { useFilters } from "@/hooks/use-filters";
import { useMapEvents, type BBox } from "@/hooks/use-map-events";
import { useEventStream } from "@/hooks/use-event-stream";
import { MapView } from "@/components/map/map-view";
import { Sidebar } from "@/components/sidebar/sidebar";
import { TimelineBar } from "@/components/timeline/timeline-bar";
import { fetchStats } from "@/lib/api-client";

export function MainPage() {
  const filters = useFilters();
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<GeoJSONFeature | null>(
    null,
  );
  const [stats, setStats] = useState<EventStats | null>(null);

  const { data, isLoading, refetch } = useMapEvents({
    bbox,
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

  // Load stats
  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(() => {
        // Stats are non-critical; swallow errors
      });

    const interval = setInterval(() => {
      fetchStats()
        .then(setStats)
        .catch(() => {});
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const handleBoundsChange = useCallback((newBbox: BBox) => {
    setBbox(newBbox);
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
        counts={stats?.byCategory}
        onEventClick={handleEventSelect}
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
