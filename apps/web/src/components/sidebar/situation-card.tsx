"use client";

import type { SituationWithCoords } from "@travelrisk/db";
import {
  CATEGORY_METADATA,
  SEVERITY_LEVELS,
  formatRelativeTime,
  isEventCategory,
} from "@travelrisk/shared";
import { SeverityBadge } from "@/components/common/severity-badge";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import { MapPin, Layers, RadioTower } from "lucide-react";
import { formatCountryCodes } from "@/lib/country-codes";

interface SituationCardProps {
  situation: SituationWithCoords;
  onClick: (situation: SituationWithCoords) => void;
  isSelected?: boolean;
}

export function SituationCard({ situation, onClick, isSelected }: SituationCardProps) {
  const categoryMeta = isEventCategory(situation.category)
    ? CATEGORY_METADATA[situation.category]
    : null;
  const CategoryIcon = isEventCategory(situation.category)
    ? CATEGORY_ICONS[situation.category]
    : null;
  const severityColor = SEVERITY_LEVELS[situation.severity]?.color ?? "#9CA3AF";

  return (
    <button
      onClick={() => onClick(situation)}
      aria-label={situation.title}
      className={cn(
        "w-full text-left p-3 rounded-lg border border-border border-l-4 hover:bg-accent/50 transition-[color,background-color,border-color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px] motion-safe:active:translate-y-0",
        isSelected && "ring-1 ring-primary/60 bg-accent/30",
        situation.severity >= 4 && !isSelected && "bg-red-500/[0.08]",
        situation.severity >= 5 && !isSelected && "bg-red-500/[0.15]",
      )}
      style={{ borderLeftColor: severityColor }}
    >
      <div className="flex items-start gap-2">
        {CategoryIcon && categoryMeta && (
          <div
            className="mt-0.5 shrink-0"
            style={{ color: categoryMeta.color }}
          >
            <CategoryIcon className="h-4 w-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium line-clamp-2 mb-0.5">
            {situation.title}
          </h4>
          {situation.countryCodes && situation.countryCodes.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{formatCountryCodes(situation.countryCodes)}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <SeverityBadge
              severity={situation.severity}
              className="text-[10px] px-1.5 py-0"
            />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Layers className="h-3 w-3" />
              {situation.eventCount}
            </span>
            {situation.lastEventAt ? (
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(String(situation.lastEventAt))}
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-xs text-amber-500/80">
                <RadioTower className="h-3 w-3" />
                Low coverage
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
