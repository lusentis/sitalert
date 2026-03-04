"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeoJSONFeature } from "@travelrisk/db";
import { useFilters } from "@/hooks/use-filters";
import { useMapEvents } from "@/hooks/use-map-events";
import { useSituations } from "@/hooks/use-situations";
import { useEventStream } from "@/hooks/use-event-stream";
import { MapView } from "@/components/map/map-view";
import { MapLegend } from "@/components/map/map-legend";
import { ChoroplethToggle } from "@/components/map/choropleth-toggle";
import { AdvisoryPopup } from "@/components/map/advisory-popup";
import { buildAdvisoryScores } from "@/lib/compute-country-risk";
import { fetchAdvisories, type AdvisoryData } from "@/lib/api-client";
import { Sidebar } from "@/components/sidebar/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function MainPage() {
  const filters = useFilters();
  const [selectedEvent, setSelectedEvent] = useState<GeoJSONFeature | null>(
    null,
  );

  const { data, isLoading: eventsLoading, refetch } = useMapEvents({
    categories: filters.categories,
    minSeverity: filters.minSeverity,
    after: filters.after,
  });

  const { data: situations, isLoading: situationsLoading, refetch: refetchSituations } = useSituations({
    categories: filters.categories,
    minSeverity: filters.minSeverity,
    after: filters.after,
  });

  const { lastEvent, isConnected } = useEventStream();

  const [advisories, setAdvisories] = useState<AdvisoryData[]>([]);
  const [selectedAdvisory, setSelectedAdvisory] = useState<{
    advisory: AdvisoryData;
    lngLat: { lng: number; lat: number };
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAdvisories(controller.signal)
      .then(setAdvisories)
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Failed to fetch advisories:", err.message);
        }
      });
    return () => controller.abort();
  }, []);

  // Refetch when a new SSE event arrives
  useEffect(() => {
    if (lastEvent) {
      refetch();
      refetchSituations();
    }
  }, [lastEvent, refetch, refetchSituations]);

  const [choroplethVisible, setChoroplethVisible] = useState(true);

  const countryScores = useMemo(
    () => buildAdvisoryScores(advisories),
    [advisories],
  );

  const handleChoroplethToggle = useCallback(() => {
    setChoroplethVisible((prev) => !prev);
  }, []);

  const handleCountryClick = useCallback(
    (countryCode: string, lngLat: { lng: number; lat: number }) => {
      const advisory = advisories.find(
        (a) => a.countryCode.toUpperCase() === countryCode,
      );
      if (advisory) {
        setSelectedAdvisory({ advisory, lngLat });
        setSelectedEvent(null); // dismiss event popup when advisory is selected
      }
    },
    [advisories],
  );

  // Derive category counts from situations so they match sidebar items
  const categoryCounts = useMemo(() => {
    if (!situations) return undefined;
    const counts: Record<string, number> = {};
    for (const s of situations) {
      counts[s.category] = (counts[s.category] ?? 0) + 1;
    }
    return counts;
  }, [situations]);

  const handleBoundsChange = useCallback(() => {
    // Bounds tracked by MapView internally; kept for MapInitializer trigger
  }, []);

  const handleEventSelect = useCallback((feature: GeoJSONFeature) => {
    setSelectedEvent(feature);
    setSelectedAdvisory(null); // dismiss advisory popup when an event is selected
  }, []);

  const handleDeselectEvent = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar
          filters={filters}
          situations={situations}
          isLoading={situationsLoading}
          isConnected={isConnected}
          counts={categoryCounts}
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
            onCountryClick={choroplethVisible ? handleCountryClick : undefined}
            advisoryPopup={
              selectedAdvisory && choroplethVisible ? (
                <AdvisoryPopup
                  advisory={selectedAdvisory.advisory}
                  lngLat={selectedAdvisory.lngLat}
                  onClose={() => setSelectedAdvisory(null)}
                />
              ) : null
            }
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
