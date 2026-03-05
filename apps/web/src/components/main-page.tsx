"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeoJSONFeature } from "@travelrisk/db";
import { useFilters } from "@/hooks/use-filters";
import { useMapEvents } from "@/hooks/use-map-events";
import { useSituations } from "@/hooks/use-situations";
import { useEventStream } from "@/hooks/use-event-stream";
import { useDeepLink } from "@/hooks/use-deep-link";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { MapView } from "@/components/map/map-view";
import { MapLegend } from "@/components/map/map-legend";
import { ChoroplethToggle } from "@/components/map/choropleth-toggle";
import { AdvisoryPopup } from "@/components/map/advisory-popup";
import { buildAdvisoryScores } from "@/lib/compute-country-risk";
import { fetchAdvisories, type AdvisoryData } from "@/lib/api-client";
import { Sidebar } from "@/components/sidebar/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

interface MainPageProps {
  onboardingDismissed: boolean;
}

export function MainPage({ onboardingDismissed }: MainPageProps) {
  const filters = useFilters();
  const deepLink = useDeepLink();
  const debouncedSearch = useDebouncedValue(filters.q, 1500);

  const { data, isLoading: eventsLoading, error: eventsError, refetch } = useMapEvents({
    categories: filters.categories,
    minSeverity: filters.minSeverity,
    after: filters.after,
  });

  const { data: situations, isLoading: situationsLoading, error: situationsError, refetch: refetchSituations } = useSituations({
    categories: filters.categories,
    minSeverity: filters.minSeverity,
    after: filters.after,
  });

  const { lastEvent, isConnected } = useEventStream();

  const [advisories, setAdvisories] = useState<AdvisoryData[]>([]);

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

  const countryScores = useMemo(
    () => buildAdvisoryScores(advisories),
    [advisories],
  );

  const handleCountryClick = useCallback(
    (countryCode: string, lngLat: { lng: number; lat: number }) => {
      const advisory = advisories.find(
        (a) => a.countryCode.toUpperCase() === countryCode,
      );
      if (advisory) {
        deepLink.selectAdvisory(countryCode, lngLat);
      }
    },
    [advisories, deepLink],
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

  // Derive selectedEvent from URL eventId + fetched data
  const selectedEvent = useMemo<GeoJSONFeature | null>(() => {
    if (!deepLink.eventId || !data) return null;
    return data.features.find((f) => f.properties.id === deepLink.eventId) ?? null;
  }, [deepLink.eventId, data]);

  // Derive selectedAdvisory from URL advisoryCode + fetched advisories
  const selectedAdvisory = useMemo(() => {
    if (!deepLink.advisoryCode || !deepLink.advisoryLngLat) return null;
    const advisory = advisories.find(
      (a) => a.countryCode.toUpperCase() === deepLink.advisoryCode?.toUpperCase(),
    );
    if (!advisory) return null;
    return { advisory, lngLat: deepLink.advisoryLngLat };
  }, [deepLink.advisoryCode, deepLink.advisoryLngLat, advisories]);

  const handleEventSelect = useCallback((feature: GeoJSONFeature) => {
    deepLink.selectEvent(feature.properties.id);
  }, [deepLink]);

  const handleDeselectEvent = useCallback(() => {
    deepLink.selectEvent(null);
  }, [deepLink]);

  // Filter map events by debounced search query
  const filteredMapData = useMemo(() => {
    if (!data || !debouncedSearch.trim()) return data;
    const q = debouncedSearch.toLowerCase();
    return {
      ...data,
      features: data.features.filter(
        (f) =>
          f.properties.title.toLowerCase().includes(q) ||
          (f.properties.summary?.toLowerCase().includes(q) ?? false) ||
          (f.properties.locationName?.toLowerCase().includes(q) ?? false) ||
          (f.properties.countryCodes?.some((c: string) => c.toLowerCase().includes(q)) ?? false),
      ),
    };
  }, [data, debouncedSearch]);

  // Combine errors for display
  const error = eventsError ?? situationsError;

  const handleRetry = useCallback(() => {
    refetch();
    refetchSituations();
  }, [refetch, refetchSituations]);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar
          onboardingDismissed={onboardingDismissed}
          filters={filters}
          situations={situations}
          isLoading={situationsLoading}
          isConnected={isConnected}
          counts={categoryCounts}
          error={error}
          onRetry={handleRetry}
          events={data}
          lastStreamEvent={lastEvent}
          eventsLoading={eventsLoading}
          onEventClick={handleEventSelect}
          selectedEventId={selectedEvent?.properties.id ?? null}
          deepLinkSituationId={deepLink.situationId}
          onSituationSelect={deepLink.selectSituation}
          searchQuery={filters.q}
          debouncedSearch={debouncedSearch}
          onSearchChange={filters.setSearch}
        />
        <div className="relative flex-1">
          <MapView
            data={filteredMapData}
            onBoundsChange={handleBoundsChange}
            onEventSelect={handleEventSelect}
            selectedEvent={selectedEvent}
            onDeselectEvent={handleDeselectEvent}
            choroplethScores={countryScores}
            choroplethVisible={filters.advisories}
            onCountryClick={filters.advisories ? handleCountryClick : undefined}
            advisoryPopup={
              selectedAdvisory && filters.advisories ? (
                <AdvisoryPopup
                  advisory={selectedAdvisory.advisory}
                  lngLat={selectedAdvisory.lngLat}
                  onClose={() => deepLink.selectAdvisory(null)}
                />
              ) : null
            }
          />
          <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2">
            <MapLegend choroplethActive={filters.advisories} />
            <ChoroplethToggle
              active={filters.advisories}
              onToggle={filters.toggleAdvisories}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
