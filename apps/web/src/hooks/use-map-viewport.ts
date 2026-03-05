"use client";

import { useRef } from "react";
import { parseAsFloat, useQueryStates } from "nuqs";
import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, VIEWPORT_DEBOUNCE_MS } from "@/lib/constants";

const viewportParsers = {
  lat: parseAsFloat.withDefault(MAP_DEFAULT_CENTER[1]),
  lng: parseAsFloat.withDefault(MAP_DEFAULT_CENTER[0]),
  z: parseAsFloat.withDefault(MAP_DEFAULT_ZOOM),
};

const options = { shallow: true, throttleMs: VIEWPORT_DEBOUNCE_MS } as const;

export function useMapViewport() {
  const [state, setState] = useQueryStates(viewportParsers, options);
  const hasUrlViewport = useRef(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("lat"),
  );

  const center: [number, number] = [state.lng, state.lat];
  const zoom = state.z;

  const onMoveEnd = (newCenter: [number, number], newZoom: number) => {
    setState({
      lng: Math.round(newCenter[0] * 1000) / 1000,
      lat: Math.round(newCenter[1] * 1000) / 1000,
      z: Math.round(newZoom * 100) / 100,
    });
  };

  return {
    center,
    zoom,
    onMoveEnd,
    hasUrlViewport: hasUrlViewport.current,
  };
}
