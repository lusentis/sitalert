"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@/components/ui/map";
import { riskColor } from "@/lib/compute-country-risk";

const SOURCE_ID = "country-boundaries";
const FILL_LAYER = "country-risk-fill";
const LINE_LAYER = "country-risk-outline";

// The Natural Earth GeoJSON at public/geo/countries-110m.json uses ISO_A2 as the property name
const ISO_PROPERTY = "ISO_A2";

interface ChoroplethLayerProps {
  /** Map of uppercase country code -> total severity score */
  countryScores: Map<string, number>;
  visible: boolean;
}

function buildFillColorExpression(
  scores: Map<string, number>,
): maplibregl.ExpressionSpecification {
  const matchExpr: unknown[] = ["match", ["get", ISO_PROPERTY]];
  for (const [code, score] of scores) {
    matchExpr.push(code, riskColor(score));
  }
  matchExpr.push("transparent"); // default
  return matchExpr as maplibregl.ExpressionSpecification;
}

export function ChoroplethLayer({ countryScores, visible }: ChoroplethLayerProps) {
  const { map, isLoaded } = useMap();
  const layersAddedRef = useRef(false);

  // Add source + layers once
  useEffect(() => {
    if (!map || !isLoaded || layersAddedRef.current) return;

    // Find the first symbol layer to insert choropleth below all labels/markers
    const firstSymbolId = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: "/geo/countries-110m.json",
    });

    map.addLayer(
      {
        id: FILL_LAYER,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": buildFillColorExpression(countryScores),
          "fill-opacity": 0.35,
        },
        layout: {
          visibility: visible ? "visible" : "none",
        },
      },
      firstSymbolId,
    );

    map.addLayer(
      {
        id: LINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "rgba(255, 255, 255, 0.1)",
          "line-width": 0.5,
        },
        layout: {
          visibility: visible ? "visible" : "none",
        },
      },
      firstSymbolId,
    );

    layersAddedRef.current = true;

    return () => {
      if (layersAddedRef.current) {
        if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
        if (map.getLayer(FILL_LAYER)) map.removeLayer(FILL_LAYER);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        layersAddedRef.current = false;
      }
    };
  }, [map, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update fill color when scores change
  useEffect(() => {
    if (!map || !layersAddedRef.current || !map.getLayer(FILL_LAYER)) return;
    map.setPaintProperty(FILL_LAYER, "fill-color", buildFillColorExpression(countryScores));
  }, [map, countryScores]);

  // Update visibility when toggled
  useEffect(() => {
    if (!map || !layersAddedRef.current) return;
    const vis = visible ? "visible" : "none";
    if (map.getLayer(FILL_LAYER)) map.setLayoutProperty(FILL_LAYER, "visibility", vis);
    if (map.getLayer(LINE_LAYER)) map.setLayoutProperty(LINE_LAYER, "visibility", vis);
  }, [map, visible]);

  return null;
}
