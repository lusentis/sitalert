"use client";

import { useEffect, useRef, useState } from "react";
import { Map, useMap, type MapRef, type MapViewport } from "@/components/ui/map";
import { ChoroplethLayer } from "./choropleth-layer";
import { EventLayer } from "./event-layer";
import { EventPopup } from "./event-popup";
import type { GeoJSONFeatureCollection, GeoJSONFeature } from "@travelrisk/db";
import type { BBox } from "@/hooks/use-map-events";
import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, VIEWPORT_DEBOUNCE_MS } from "@/lib/constants";

interface MapViewProps {
  data: GeoJSONFeatureCollection | null;
  onBoundsChange: (bbox: BBox) => void;
  onEventSelect?: (feature: GeoJSONFeature) => void;
  selectedEvent?: GeoJSONFeature | null;
  onDeselectEvent?: () => void;
  choroplethScores?: Map<string, number>;
  choroplethVisible?: boolean;
  onCountryClick?: (countryCode: string, lngLat: { lng: number; lat: number }) => void;
  advisoryPopup?: React.ReactNode;
}

/** Inner component that fires initial bounds via useMap() */
function MapInitializer({
  onBoundsChange,
}: {
  onBoundsChange: (bbox: BBox) => void;
}) {
  const { map, isLoaded } = useMap();
  const hasFired = useRef(false);

  useEffect(() => {
    if (map && isLoaded && !hasFired.current) {
      hasFired.current = true;
      const bounds = map.getBounds();
      onBoundsChange({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    }
  }, [map, isLoaded, onBoundsChange]);

  return null;
}

export function MapView({
  data,
  onBoundsChange,
  onEventSelect,
  selectedEvent,
  onDeselectEvent,
  choroplethScores,
  choroplethVisible,
  onCountryClick,
  advisoryPopup,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track stacked features at a clicked point
  const [stackedFeatures, setStackedFeatures] = useState<GeoJSONFeature[]>([]);
  const [stackIndex, setStackIndex] = useState(0);

  const handleViewportChange = (_viewport: MapViewport) => {
    const mapInstance = mapRef.current;
    if (!mapInstance) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const bounds = mapInstance.getBounds();
      onBoundsChange({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    }, VIEWPORT_DEBOUNCE_MS);
  };

  const handleEventClick = (features: GeoJSONFeature[]) => {
    setStackedFeatures(features);
    setStackIndex(0);
    onEventSelect?.(features[0]);
  };

  const handleDeselect = () => {
    setStackedFeatures([]);
    setStackIndex(0);
    onDeselectEvent?.();
  };

  const handleStackNavigate = (index: number) => {
    setStackIndex(index);
    onEventSelect?.(stackedFeatures[index]);
  };

  // Fly to the selected event (triggered by both map clicks and sidebar clicks)
  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!selectedEvent || !mapInstance) return;

    mapInstance.flyTo({
      center: selectedEvent.geometry.coordinates as [number, number],
      zoom: Math.max(mapInstance.getZoom(), 5),
      duration: 1200,
      essential: true,
    });
  }, [selectedEvent]);

  // When selectedEvent is set externally (e.g. sidebar click) without going through handleEventClick,
  // reset the stack to just that single event
  useEffect(() => {
    if (selectedEvent && stackedFeatures.length > 0) {
      const isInStack = stackedFeatures.some(
        (f) => f.properties.id === selectedEvent.properties.id,
      );
      if (!isInStack) {
        setStackedFeatures([selectedEvent]);
        setStackIndex(0);
      }
    } else if (selectedEvent && stackedFeatures.length === 0) {
      setStackedFeatures([selectedEvent]);
      setStackIndex(0);
    }
  }, [selectedEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative flex-1 h-full" tabIndex={0} role="application" aria-label="Interactive event map">
      <Map
        ref={mapRef}
        className="h-full w-full"
        theme="dark"
        center={MAP_DEFAULT_CENTER}
        zoom={MAP_DEFAULT_ZOOM}
        onViewportChange={handleViewportChange}
      >
        <MapInitializer onBoundsChange={onBoundsChange} />
        {choroplethScores && (
          <ChoroplethLayer
            countryScores={choroplethScores}
            visible={choroplethVisible ?? false}
            onCountryClick={onCountryClick}
          />
        )}
        <EventLayer data={data} onEventClick={handleEventClick} />
        {selectedEvent && (
          <EventPopup
            features={stackedFeatures}
            currentIndex={stackIndex}
            onNavigate={handleStackNavigate}
            onClose={handleDeselect}
          />
        )}
        {advisoryPopup}
      </Map>
    </div>
  );
}
