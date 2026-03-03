"use client";

import { useCallback, useEffect, useRef } from "react";
import { Map, useMap, type MapRef, type MapViewport } from "@/components/ui/map";
import { EventLayer } from "./event-layer";
import { EventPopup } from "./event-popup";
import type { GeoJSONFeatureCollection, GeoJSONFeature } from "@sitalert/db";
import type { BBox } from "@/hooks/use-map-events";
import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, VIEWPORT_DEBOUNCE_MS } from "@/lib/constants";

interface MapViewProps {
  data: GeoJSONFeatureCollection | null;
  onBoundsChange: (bbox: BBox) => void;
  onEventSelect?: (feature: GeoJSONFeature) => void;
  selectedEvent?: GeoJSONFeature | null;
  onDeselectEvent?: () => void;
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
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleViewportChange = useCallback(
    (_viewport: MapViewport) => {
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
    },
    [onBoundsChange],
  );

  const handleEventClick = useCallback(
    (feature: GeoJSONFeature) => {
      onEventSelect?.(feature);
      const mapInstance = mapRef.current;
      if (mapInstance) {
        mapInstance.flyTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: Math.max(mapInstance.getZoom(), 8),
          duration: 1000,
        });
      }
    },
    [onEventSelect],
  );

  return (
    <div className="relative flex-1 h-full">
      <Map
        ref={mapRef}
        className="h-full w-full"
        theme="dark"
        center={MAP_DEFAULT_CENTER}
        zoom={MAP_DEFAULT_ZOOM}
        onViewportChange={handleViewportChange}
      >
        <MapInitializer onBoundsChange={onBoundsChange} />
        <EventLayer data={data} onEventClick={handleEventClick} />
        {selectedEvent && onDeselectEvent && (
          <EventPopup feature={selectedEvent} onClose={onDeselectEvent} />
        )}
      </Map>
    </div>
  );
}
