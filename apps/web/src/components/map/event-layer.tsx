"use client";

import { useEffect, useRef, useCallback } from "react";
import { useMap } from "@/components/ui/map";
import type { GeoJSONFeatureCollection, GeoJSONFeature } from "@sitalert/db";

const SOURCE_ID = "events-source";
const CLUSTER_LAYER = "events-clusters";
const CLUSTER_COUNT_LAYER = "events-cluster-count";
const UNCLUSTERED_LAYER = "events-unclustered-point";
const PULSE_LAYER = "events-pulse";

interface EventLayerProps {
  data: GeoJSONFeatureCollection | null;
  onEventClick?: (feature: GeoJSONFeature) => void;
}

const EMPTY_COLLECTION: GeoJSONFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function EventLayer({ data, onEventClick }: EventLayerProps) {
  const { map, isLoaded } = useMap();
  const animationRef = useRef<number | null>(null);
  const layersAddedRef = useRef(false);
  const onEventClickRef = useRef(onEventClick);
  onEventClickRef.current = onEventClick;

  const setupLayers = useCallback(() => {
    if (!map || layersAddedRef.current) return;

    // Add GeoJSON source with clustering
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: data ?? EMPTY_COLLECTION,
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 14,
    });

    // Cluster circle layer
    map.addLayer({
      id: CLUSTER_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#51bbd6",
          20,
          "#f1f075",
          100,
          "#f28cb1",
        ],
        "circle-radius": [
          "step",
          ["get", "point_count"],
          15,
          20,
          20,
          100,
          25,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.85,
      },
    });

    // Cluster count text layer
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
        "text-color": "#1a1a1a",
      },
    });

    // Unclustered point layer
    map.addLayer({
      id: UNCLUSTERED_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": [
          "match",
          ["get", "category"],
          "conflict",
          "#DC2626",
          "terrorism",
          "#7C2D12",
          "natural_disaster",
          "#EA580C",
          "weather_extreme",
          "#2563EB",
          "health_epidemic",
          "#16A34A",
          "civil_unrest",
          "#CA8A04",
          "transport",
          "#9333EA",
          "infrastructure",
          "#64748B",
          "#6B7280",
        ],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "severity"],
          1,
          6,
          5,
          14,
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

    // Pulse layer for events < 30 minutes old
    map.addLayer({
      id: PULSE_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: [
        "all",
        ["!", ["has", "point_count"]],
        ["<", ["get", "ageMinutes"], 30],
      ],
      paint: {
        "circle-color": [
          "match",
          ["get", "category"],
          "conflict",
          "#DC2626",
          "terrorism",
          "#7C2D12",
          "natural_disaster",
          "#EA580C",
          "weather_extreme",
          "#2563EB",
          "health_epidemic",
          "#16A34A",
          "civil_unrest",
          "#CA8A04",
          "transport",
          "#9333EA",
          "infrastructure",
          "#64748B",
          "#6B7280",
        ],
        "circle-radius": 20,
        "circle-opacity": 0,
        "circle-stroke-width": 0,
      },
    });

    layersAddedRef.current = true;
  }, [map, data]);

  // Set up layers once the map style is loaded
  useEffect(() => {
    if (!map || !isLoaded) return;

    setupLayers();

    // Cluster click handler — zoom to expand
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

    // Point click handler
    const handlePointClick = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    ) => {
      const features = e.features;
      if (!features || features.length === 0) return;
      const feature = features[0];
      const geometry = feature.geometry;

      if (geometry.type === "Point" && onEventClickRef.current) {
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
          },
        };
        onEventClickRef.current(geoFeature);
      }
    };

    // Cursor changes
    const handleMouseEnterCluster = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleMouseLeaveCluster = () => {
      map.getCanvas().style.cursor = "";
    };
    const handleMouseEnterPoint = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleMouseLeavePoint = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", CLUSTER_LAYER, handleClusterClick);
    map.on("click", UNCLUSTERED_LAYER, handlePointClick);
    map.on("mouseenter", CLUSTER_LAYER, handleMouseEnterCluster);
    map.on("mouseleave", CLUSTER_LAYER, handleMouseLeaveCluster);
    map.on("mouseenter", UNCLUSTERED_LAYER, handleMouseEnterPoint);
    map.on("mouseleave", UNCLUSTERED_LAYER, handleMouseLeavePoint);

    // Pulse animation
    let pulsePhase = 0;
    const animatePulse = () => {
      pulsePhase = (pulsePhase + 0.02) % 1;
      const radius = 14 + Math.sin(pulsePhase * Math.PI * 2) * 10;
      const opacity = 0.3 - Math.sin(pulsePhase * Math.PI * 2) * 0.2;

      if (map.getLayer(PULSE_LAYER)) {
        map.setPaintProperty(PULSE_LAYER, "circle-radius", radius);
        map.setPaintProperty(PULSE_LAYER, "circle-opacity", Math.max(0, opacity));
      }
      animationRef.current = requestAnimationFrame(animatePulse);
    };
    animationRef.current = requestAnimationFrame(animatePulse);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      map.off("click", CLUSTER_LAYER, handleClusterClick);
      map.off("click", UNCLUSTERED_LAYER, handlePointClick);
      map.off("mouseenter", CLUSTER_LAYER, handleMouseEnterCluster);
      map.off("mouseleave", CLUSTER_LAYER, handleMouseLeaveCluster);
      map.off("mouseenter", UNCLUSTERED_LAYER, handleMouseEnterPoint);
      map.off("mouseleave", UNCLUSTERED_LAYER, handleMouseLeavePoint);

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

  // Update GeoJSON data when it changes
  useEffect(() => {
    if (!map || !isLoaded || !layersAddedRef.current) return;

    const source = map.getSource(SOURCE_ID);
    if (source && "setData" in source) {
      (source as maplibregl.GeoJSONSource).setData(
        data ?? EMPTY_COLLECTION,
      );
    }
  }, [map, isLoaded, data]);

  return null;
}
