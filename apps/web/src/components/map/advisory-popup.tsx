"use client";

import { MapPopup } from "@/components/ui/map";
import { X, ExternalLink, ShieldAlert } from "lucide-react";
import type { AdvisoryData } from "@/lib/api-client";

interface AdvisoryPopupProps {
  advisory: AdvisoryData;
  lngLat: { lng: number; lat: number };
  onClose: () => void;
}

const LEVEL_LABELS: Record<number, { label: string; className: string }> = {
  1: { label: "Exercise Normal Precautions", className: "text-muted-foreground" },
  2: { label: "Exercise Increased Caution", className: "text-muted-foreground" },
  3: { label: "Reconsider Travel", className: "text-amber-500" },
  4: { label: "Do Not Travel", className: "text-red-700" },
};

export function AdvisoryPopup({ advisory, lngLat, onClose }: AdvisoryPopupProps) {
  return (
    <MapPopup longitude={lngLat.lng} latitude={lngLat.lat} onClose={onClose}>
      <div className="bg-card text-card-foreground border border-border rounded-lg shadow-lg p-3 max-w-[320px] min-w-[240px]">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className={`h-4 w-4 shrink-0 ${LEVEL_LABELS[advisory.level]?.className ?? "text-muted-foreground"}`} />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Travel Advisory
            </span>
          </div>
          <button
            type="button"
            aria-label="Close popup"
            onClick={onClose}
            className="-m-1 p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3 className="font-semibold text-sm leading-tight mb-1">
          {advisory.title}
        </h3>

        <div className={`text-xs font-medium mb-2 ${LEVEL_LABELS[advisory.level]?.className ?? "text-muted-foreground"}`}>
          Level {advisory.level}: {LEVEL_LABELS[advisory.level]?.label ?? "Unknown"}
        </div>

        <p className="text-xs text-muted-foreground line-clamp-4 mb-2">
          {advisory.summary}
        </p>

        <a
          href={advisory.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Full advisory
        </a>
      </div>
    </MapPopup>
  );
}
