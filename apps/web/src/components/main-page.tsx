"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeoJSONFeature } from "@travelrisk/db";
import { useFilters } from "@/hooks/use-filters";
import { useMapEvents } from "@/hooks/use-map-events";
import { useEventStream } from "@/hooks/use-event-stream";
import { MapView } from "@/components/map/map-view";
import { MapLegend } from "@/components/map/map-legend";
import { ChoroplethToggle } from "@/components/map/choropleth-toggle";
import { computeCountryRisk } from "@/lib/compute-country-risk";
import { Sidebar } from "@/components/sidebar/sidebar";
import { TimelineBar } from "@/components/timeline/timeline-bar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function MainPage() {
  const filters = useFilters();
  const [selectedEvent, setSelectedEvent] = useState<GeoJSONFeature | null>(
    null,
  );

  const { data, isLoading, refetch } = useMapEvents({
    categories: filters.categories,
    minSeverity: filters.minSeverity,
    after: filters.after,
  });

  const { lastEvent, isConnected } = useEventStream();

  // Refetch when a new SSE event arrives
  useEffect(() => {
    if (lastEvent) {
      refetch();
    }
  }, [lastEvent, refetch]);

  const [choroplethVisible, setChoroplethVisible] = useState(false);

  const countryScores = useMemo(() => {
    if (!data) return new Map<string, number>();
    return computeCountryRisk(data);
  }, [data]);

  const handleChoroplethToggle = useCallback(() => {
    setChoroplethVisible((prev) => !prev);
  }, []);

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
    <TooltipProvider delayDuration={400}>
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
            choroplethScores={countryScores}
            choroplethVisible={choroplethVisible}
          />
          <TimelineBar
            value={filters.timeRange}
            onChange={filters.setTimeRange}
          />
          <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2">
            <MapLegend choroplethActive={choroplethVisible} />
            <ChoroplethToggle
              active={choroplethVisible}
              onToggle={handleChoroplethToggle}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
