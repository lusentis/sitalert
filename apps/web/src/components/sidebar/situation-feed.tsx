"use client";

import { useMemo, useState } from "react";
import type { SituationWithCoords } from "@travelrisk/db";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SituationCard } from "./situation-card";
import { SituationDialog } from "./situation-dialog";

interface SituationFeedProps {
  situations: SituationWithCoords[] | null;
  isLoading: boolean;
  searchQuery?: string;
}

export function SituationFeed({ situations, isLoading, searchQuery }: SituationFeedProps) {
  const [selectedSituation, setSelectedSituation] = useState<SituationWithCoords | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleClick = (situation: SituationWithCoords) => {
    setSelectedSituation(situation);
    setDialogOpen(true);
  };

  const items = useMemo(() => {
    const sorted = (situations ?? []).slice().sort(
      (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    );
    if (!searchQuery?.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.summary?.toLowerCase().includes(q) ?? false) ||
        (s.countryCodes?.some((c) => c.toLowerCase().includes(q)) ?? false),
    );
  }, [situations, searchQuery]);

  return (
    <div className="flex-1 min-h-0 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Situations
          <span className="ml-1.5 text-foreground font-bold tabular-nums">
            {items.length}
          </span>
        </h3>
        {isLoading && (
          <span className="text-xs text-muted-foreground motion-safe:animate-pulse">
            Loading...
          </span>
        )}
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div role="feed" aria-busy={isLoading} className="space-y-1.5 pr-2">
          {items.length === 0 && !isLoading && (
            <div className="text-center py-10 space-y-3">
              <div className="relative size-10 mx-auto opacity-40">
                <div className="absolute inset-0 rounded-full border border-current" />
                <div className="absolute inset-2.5 rounded-full border border-current" />
                <div className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  No active situations.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Try a wider time range or fewer category filters.
                </p>
              </div>
            </div>
          )}
          {items.map((situation) => (
            <SituationCard
              key={situation.id}
              situation={situation}
              onClick={handleClick}
              isSelected={selectedSituation?.id === situation.id && dialogOpen}
            />
          ))}
        </div>
      </ScrollArea>

      <SituationDialog
        situation={selectedSituation}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
