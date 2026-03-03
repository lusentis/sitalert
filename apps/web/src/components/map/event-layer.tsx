"use client";

import { useEffect, useRef, useCallback } from "react";
import { useMap } from "@/components/ui/map";
import type { GeoJSONFeatureCollection, GeoJSONFeature } from "@travelrisk/db";
import { CATEGORY_COLORS } from "@travelrisk/shared";

const SOURCE_ID = "events-source";
const CLUSTER_LAYER = "events-clusters";
const CLUSTER_COUNT_LAYER = "events-cluster-count";
const UNCLUSTERED_LAYER = "events-unclustered-point";
const PULSE_LAYER = "events-pulse";

const CLUSTER_THRESHOLD_MEDIUM = 20;
const CLUSTER_THRESHOLD_LARGE = 100;
const CLUSTER_COLOR_SMALL = "#3B82F6";
const CLUSTER_COLOR_MEDIUM = "#F59E0B";
const CLUSTER_COLOR_LARGE = "#EF4444";
const CLUSTER_TEXT_COLOR = "#ffffff";

const SEVERITY_RADIUS_MIN = 6;
const SEVERITY_RADIUS_MAX = 14;

const PULSE_AGE_MINUTES = 30;
const PULSE_BASE_RADIUS = 14;
const PULSE_AMPLITUDE = 10;

interface EventLayerProps {
  data: GeoJSONFeatureCollection | null;
  onEventClick?: (feature: GeoJSONFeature) => void;
}

const EMPTY_COLLECTION: GeoJSONFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function buildCategoryColorExpression(): maplibregl.ExpressionSpecification {
  const entries = Object.entries(CATEGORY_COLORS);
  const matchExpr: unknown[] = ["match", ["get", "category"]];
  for (const [category, color] of entries) {
    matchExpr.push(category, color);
  }
  matchExpr.push("#9CA3AF"); // fallback
  return matchExpr as maplibregl.ExpressionSpecification;
}

const categoryColorExpr = buildCategoryColorExpression();

export function EventLayer({ data, onEventClick }: EventLayerProps) {
  const { map, isLoaded } = useMap();
  const animationRef = useRef<number | null>(null);
  const layersAddedRef = useRef(false);
  const onEventClickRef = useRef(onEventClick);
  const lastDataRef = useRef<{ length: number; firstTimestamp: string | null }>({
    length: 0,
    firstTimestamp: null,
  });
  onEventClickRef.current = onEventClick;

  const setupLayers = useCallback(() => {
    if (!map || layersAddedRef.current) return;

    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: data ?? EMPTY_COLLECTION,
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 14,
    });

    map.addLayer({
      id: CLUSTER_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          CLUSTER_COLOR_SMALL,
          CLUSTER_THRESHOLD_MEDIUM,
          CLUSTER_COLOR_MEDIUM,
          CLUSTER_THRESHOLD_LARGE,
          CLUSTER_COLOR_LARGE,
        ],
        "circle-radius": [
          "step",
          ["get", "point_count"],
          15,
          CLUSTER_THRESHOLD_MEDIUM,
          20,
          CLUSTER_THRESHOLD_LARGE,
          25,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.85,
      },
    });

    map.addLayer({
      id: CLUSTER_COUNT_LAYER,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 12,
      },
      paint: {
        "text-color": CLUSTER_TEXT_COLOR,
      },
    });

    map.addLayer({
      id: UNCLUSTERED_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": categoryColorExpr,
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "severity"],
          1,
          SEVERITY_RADIUS_MIN,
          5,
          SEVERITY_RADIUS_MAX,
        ],
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["get", "confidence"],
          0,
          0.4,
          1,
          1.0,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });

    map.addLayer({
      id: PULSE_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: [
        "all",
        ["!", ["has", "point_count"]],
        ["<", ["get", "ageMinutes"], PULSE_AGE_MINUTES],
      ],
      paint: {
        "circle-color": categoryColorExpr,
        "circle-radius": PULSE_BASE_RADIUS,
        "circle-opacity": 0,
        "circle-stroke-width": 0,
      },
    });

    layersAddedRef.current = true;
  }, [map, data]);

  useEffect(() => {
    if (!map || !isLoaded) return;

    setupLayers();

    const handleClusterClick = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    ) => {
      const features = e.features;
      if (!features || features.length === 0) return;
      const feature = features[0];
      const clusterId = feature.properties?.["cluster_id"] as number | undefined;
      if (clusterId === undefined) return;

      const source = map.getSource(SOURCE_ID);
      if (source && "getClusterExpansionZoom" in source) {
        (
          source as maplibregl.GeoJSONSource
        ).getClusterExpansionZoom(clusterId).then((zoom) => {
          const geometry = feature.geometry;
          if (geometry.type === "Point") {
            map.easeTo({
              center: geometry.coordinates as [number, number],
              zoom: zoom,
            });
          }
        });
      }
    };

    const handlePointClick = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    ) => {
      const features = e.features;
      if (!features || features.length === 0) return;
      const feature = features[0];
      const geometry = feature.geometry;

      if (geometry.type === "Point" && onEventClickRef.current) {
        let sources: Array<{ name: string; platform: string; url?: string }> = [];
        try {
          const raw = feature.properties?.["sources"];
          sources = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
        } catch {
          // ignore parse errors
        }

        const geoFeature: GeoJSONFeature = {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: geometry.coordinates as [number, number],
          },
          properties: {
            id: feature.properties?.["id"] as string,
            title: feature.properties?.["title"] as string,
            summary: feature.properties?.["summary"] as string,
            category: feature.properties?.["category"] as string,
            severity: Number(feature.properties?.["severity"]),
            confidence: Number(feature.properties?.["confidence"]),
            locationName: feature.properties?.["locationName"] as string,
            countryCode: (feature.properties?.["countryCode"] as string | null) ?? null,
            timestamp: feature.properties?.["timestamp"] as string,
            ageMinutes: Number(feature.properties?.["ageMinutes"]),
            sourceCount: Number(feature.properties?.["sourceCount"]),
            sources,
          },
        };
        onEventClickRef.current(geoFeature);
      }
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", CLUSTER_LAYER, handleClusterClick);
    map.on("click", UNCLUSTERED_LAYER, handlePointClick);
    map.on("click", PULSE_LAYER, handlePointClick);
    map.on("mouseenter", CLUSTER_LAYER, handleMouseEnter);
    map.on("mouseleave", CLUSTER_LAYER, handleMouseLeave);
    map.on("mouseenter", UNCLUSTERED_LAYER, handleMouseEnter);
    map.on("mouseleave", UNCLUSTERED_LAYER, handleMouseLeave);
    map.on("mouseenter", PULSE_LAYER, handleMouseEnter);
    map.on("mouseleave", PULSE_LAYER, handleMouseLeave);

    // Pulse animation — respects prefers-reduced-motion and tab visibility
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let pulsePhase = 0;
    let paused = prefersReducedMotion.matches;

    if (prefersReducedMotion.matches && map.getLayer(PULSE_LAYER)) {
      map.setPaintProperty(PULSE_LAYER, "circle-radius", PULSE_BASE_RADIUS);
      map.setPaintProperty(PULSE_LAYER, "circle-opacity", 0.15);
    }

    const animatePulse = () => {
      if (paused) {
        animationRef.current = requestAnimationFrame(animatePulse);
        return;
      }

      pulsePhase = (pulsePhase + 0.02) % 1;
      const radius = PULSE_BASE_RADIUS + Math.sin(pulsePhase * Math.PI * 2) * PULSE_AMPLITUDE;
      const opacity = 0.3 - Math.sin(pulsePhase * Math.PI * 2) * 0.2;

      if (map.getLayer(PULSE_LAYER)) {
        map.setPaintProperty(PULSE_LAYER, "circle-radius", radius);
        map.setPaintProperty(PULSE_LAYER, "circle-opacity", Math.max(0, opacity));
      }
      animationRef.current = requestAnimationFrame(animatePulse);
    };

    if (!prefersReducedMotion.matches) {
      animationRef.current = requestAnimationFrame(animatePulse);
    }

    const handleVisibilityChange = () => {
      paused = document.hidden || prefersReducedMotion.matches;
    };

    const handleMotionChange = () => {
      paused = prefersReducedMotion.matches || document.hidden;
      if (prefersReducedMotion.matches) {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
        if (map.getLayer(PULSE_LAYER)) {
          map.setPaintProperty(PULSE_LAYER, "circle-radius", PULSE_BASE_RADIUS);
          map.setPaintProperty(PULSE_LAYER, "circle-opacity", 0.15);
        }
      } else if (!animationRef.current) {
        animationRef.current = requestAnimationFrame(animatePulse);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    prefersReducedMotion.addEventListener("change", handleMotionChange);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      document.removeEventListener("visibilitychange", handleVisibilityChange);
      prefersReducedMotion.removeEventListener("change", handleMotionChange);

      map.off("click", CLUSTER_LAYER, handleClusterClick);
      map.off("click", UNCLUSTERED_LAYER, handlePointClick);
      map.off("click", PULSE_LAYER, handlePointClick);
      map.off("mouseenter", CLUSTER_LAYER, handleMouseEnter);
      map.off("mouseleave", CLUSTER_LAYER, handleMouseLeave);
      map.off("mouseenter", UNCLUSTERED_LAYER, handleMouseEnter);
      map.off("mouseleave", UNCLUSTERED_LAYER, handleMouseLeave);
      map.off("mouseenter", PULSE_LAYER, handleMouseEnter);
      map.off("mouseleave", PULSE_LAYER, handleMouseLeave);

      if (layersAddedRef.current) {
        if (map.getLayer(PULSE_LAYER)) map.removeLayer(PULSE_LAYER);
        if (map.getLayer(UNCLUSTERED_LAYER)) map.removeLayer(UNCLUSTERED_LAYER);
        if (map.getLayer(CLUSTER_COUNT_LAYER)) map.removeLayer(CLUSTER_COUNT_LAYER);
        if (map.getLayer(CLUSTER_LAYER)) map.removeLayer(CLUSTER_LAYER);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        layersAddedRef.current = false;
      }
    };
  }, [map, isLoaded, setupLayers]);

  // Update GeoJSON data when it changes (with equality check)
  useEffect(() => {
    if (!map || !isLoaded || !layersAddedRef.current) return;

    const incoming = data ?? EMPTY_COLLECTION;
    const firstTimestamp = incoming.features[0]?.properties?.timestamp ?? null;

    if (
      incoming.features.length === lastDataRef.current.length &&
      firstTimestamp === lastDataRef.current.firstTimestamp
    ) {
      return;
    }

    lastDataRef.current = { length: incoming.features.length, firstTimestamp };

    const source = map.getSource(SOURCE_ID);
    if (source && "setData" in source) {
      (source as maplibregl.GeoJSONSource).setData(incoming);
    }
  }, [map, isLoaded, data]);

  return null;
}
