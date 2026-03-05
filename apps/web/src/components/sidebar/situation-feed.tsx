"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SituationWithCoords } from "@travelrisk/db";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { SituationCard } from "./situation-card";
import { SituationDialog } from "./situation-dialog";

interface SituationFeedProps {
  situations: SituationWithCoords[] | null;
  isLoading: boolean;
  searchQuery?: string;
  deepLinkSituationId?: string | null;
  onSituationSelect?: (id: string | null) => void;
}

export function SituationFeed({
  situations,
  isLoading,
  searchQuery,
  deepLinkSituationId,
  onSituationSelect,
}: SituationFeedProps) {
  const [selectedSituation, setSelectedSituation] = useState<SituationWithCoords | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleClick = (situation: SituationWithCoords) => {
    setSelectedSituation(situation);
    setDialogOpen(true);
    onSituationSelect?.(situation.id);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      onSituationSelect?.(null);
    }
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

  // Restore situation from deep link on initial data load
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !deepLinkSituationId || !situations) return;
    const match = situations.find((s) => s.id === deepLinkSituationId);
    if (match) {
      setSelectedSituation(match);
      setDialogOpen(true);
      restoredRef.current = true;
    }
  }, [deepLinkSituationId, situations]);

  return (
    <div className="flex-1 min-h-0 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Situations
          {!isLoading && (
            <span className="ml-1.5 text-foreground font-bold tabular-nums">
              {items.length}
            </span>
          )}
        </h3>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div role="feed" aria-busy={isLoading} className="space-y-1.5 p-0.5 pr-2">
          {isLoading && items.length === 0 && (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg border border-border border-l-[3px] border-l-muted">
                <div className="flex items-start gap-2">
                  <Skeleton className="h-4 w-4 mt-0.5 rounded shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-[85%]" />
                    <div className="flex items-center gap-1">
                      <Skeleton className="h-3 w-3 rounded" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-14 rounded-full" />
                      <Skeleton className="h-3 w-8" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          {items.length === 0 && !isLoading && (
            <div className="text-center py-10 space-y-3">
              <div className="relative size-10 mx-auto opacity-40">
                <div className="absolute inset-0 rounded-full border border-current" />
                <div className="absolute inset-2.5 rounded-full border border-current" />
                <div className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  No situations match your filters.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Try a different time range or broaden your filters.
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
        onOpenChange={handleDialogChange}
      />
    </div>
  );
}
