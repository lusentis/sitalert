"use client";

import { useEffect } from "react";
import type { GeoJSONFeature, GeoJSONFeatureCollection, Advisory, SituationWithCoords } from "@travelrisk/db";
import { useFilters } from "@/hooks/use-filters";
import { useMapEvents } from "@/hooks/use-map-events";
import { useSituations } from "@/hooks/use-situations";
import { useEventStream } from "@/hooks/use-event-stream";
import { useDeepLink } from "@/hooks/use-deep-link";
import { useMapViewport } from "@/hooks/use-map-viewport";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { MapView } from "@/components/map/map-view";
import { MapLegend } from "@/components/map/map-legend";
import { ChoroplethToggle } from "@/components/map/choropleth-toggle";
import { AdvisoryPopup } from "@/components/map/advisory-popup";
import { buildAdvisoryScores } from "@/lib/compute-country-risk";
import { Sidebar } from "@/components/sidebar/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

interface MainPageProps {
  advisories: Advisory[];
  initialEvents: GeoJSONFeatureCollection | null;
  initialSituations: SituationWithCoords[] | null;
}

export function MainPage({ advisories, initialEvents, initialSituations }: MainPageProps) {
  const filters = useFilters();
  const deepLink = useDeepLink();
  const mapViewport = useMapViewport();
  const debouncedSearch = useDebouncedValue(filters.q, 1500);

  const { data, isLoading: eventsLoading, error: eventsError, refetch } = useMapEvents({
    categories: filters.categories,
    minSeverity: filters.minSeverity,
    after: filters.after,
    initialData: initialEvents,
  });

  const { data: situations, isLoading: situationsLoading, error: situationsError, refetch: refetchSituations } = useSituations({
    categories: filters.categories,
    minSeverity: filters.minSeverity,
    after: filters.after,
    initialData: initialSituations,
  });

  const { lastEvent, isConnected } = useEventStream();

  // Refetch when a new SSE event arrives
  useEffect(() => {
    if (lastEvent) {
      refetch();
      refetchSituations();
    }
  }, [lastEvent, refetch, refetchSituations]);

  const countryScores = buildAdvisoryScores(advisories);

  const handleCountryClick = (countryCode: string, lngLat: { lng: number; lat: number }) => {
    const advisory = advisories.find(
      (a) => a.countryCode.toUpperCase() === countryCode,
    );
    if (advisory) {
      deepLink.selectAdvisory(countryCode, lngLat);
    }
  };

  // Derive category counts from situations so they match sidebar items
  let categoryCounts: Record<string, number> | undefined;
  if (situations) {
    categoryCounts = {};
    for (const s of situations) {
      categoryCounts[s.category] = (categoryCounts[s.category] ?? 0) + 1;
    }
  }

  const handleBoundsChange = () => {
    // Bounds tracked by MapView internally; kept for MapInitializer trigger
  };

  // Derive selectedEvent from URL eventId + fetched data
  const selectedEvent: GeoJSONFeature | null =
    deepLink.eventId && data
      ? data.features.find((f) => f.properties.id === deepLink.eventId) ?? null
      : null;

  // Derive selectedAdvisory from URL advisoryCode + fetched advisories
  const selectedAdvisory = (() => {
    if (!deepLink.advisoryCode || !deepLink.advisoryLngLat) return null;
    const advisory = advisories.find(
      (a) => a.countryCode.toUpperCase() === deepLink.advisoryCode?.toUpperCase(),
    );
    if (!advisory) return null;
    return { advisory, lngLat: deepLink.advisoryLngLat };
  })();

  const handleEventSelect = (feature: GeoJSONFeature) => {
    deepLink.selectEvent(feature.properties.id);
  };

  const handleDeselectEvent = () => {
    deepLink.selectEvent(null);
  };

  // Filter map events by debounced search query
  const filteredMapData = (() => {
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
  })();

  // Combine errors for display
  const error = eventsError ?? situationsError;

  const handleRetry = () => {
    refetch();
    refetchSituations();
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar
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
            initialCenter={mapViewport.center}
            initialZoom={mapViewport.zoom}
            onMoveEnd={mapViewport.onMoveEnd}
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
