"use client";

import { useEffect, useState } from "react";
import type { SituationWithCoords } from "@travelrisk/db";
import {
  CATEGORY_METADATA,
  formatRelativeTime,
  isEventCategory,
} from "@travelrisk/shared";
import { SeverityBadge } from "@/components/common/severity-badge";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { fetchSituationEvents, type SituationEvent } from "@/lib/api-client";
import { MapPin, Clock, Layers } from "lucide-react";

interface SituationDialogProps {
  situation: SituationWithCoords | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SituationDialog({
  situation,
  open,
  onOpenChange,
}: SituationDialogProps) {
  const [events, setEvents] = useState<SituationEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!situation || !open) {
      setEvents([]);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    fetchSituationEvents(situation.id, controller.signal)
      .then((data) => {
        setEvents(data);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to fetch situation events:", err);
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [situation, open]);

  if (!situation) return null;

  const categoryMeta = isEventCategory(situation.category)
    ? CATEGORY_METADATA[situation.category]
    : null;
  const CategoryIcon = isEventCategory(situation.category)
    ? CATEGORY_ICONS[situation.category]
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-4 pb-3 space-y-2">
          <div className="flex items-start gap-2">
            {CategoryIcon && categoryMeta && (
              <div className="mt-0.5 shrink-0" style={{ color: categoryMeta.color }}>
                <CategoryIcon className="h-5 w-5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-medium leading-snug">
                {situation.title}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                {situation.summary}
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {categoryMeta && (
              <Badge
                variant="outline"
                className="text-[10px]"
                style={{
                  color: categoryMeta.color,
                  borderColor: `${categoryMeta.color}40`,
                }}
              >
                {categoryMeta.label}
              </Badge>
            )}
            <SeverityBadge
              severity={situation.severity}
              className="text-[10px] px-1.5 py-0"
            />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Layers className="h-3 w-3" />
              {situation.eventCount} events
            </span>
          </div>
        </DialogHeader>

        <div className="border-t border-border" />

        <div className="px-4 py-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Events
            <span className="ml-1.5 text-foreground font-bold tabular-nums">
              {events.length}
            </span>
          </h3>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          {isLoading && (
            <div className="text-xs text-muted-foreground py-4 text-center motion-safe:animate-pulse">
              Loading events...
            </div>
          )}
          {!isLoading && events.length === 0 && (
            <div className="text-xs text-muted-foreground py-4 text-center">
              No linked events yet.
            </div>
          )}
          <div className="space-y-2">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatSourceName(name: string): string {
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function EventRow({ event }: { event: SituationEvent }) {
  const sources = Array.isArray(event.sources) ? event.sources : [];
  const categoryMeta = isEventCategory(event.category)
    ? CATEGORY_METADATA[event.category]
    : null;
  const CategoryIcon = isEventCategory(event.category)
    ? CATEGORY_ICONS[event.category]
    : null;

  return (
    <div className="p-3 rounded-lg border border-border bg-card/50">
      <h4 className="font-semibold text-sm leading-tight line-clamp-2 mb-2">
        {event.title}
      </h4>

      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {categoryMeta && (
          <Badge
            variant="outline"
            className="text-xs gap-1"
            style={{
              borderColor: `${categoryMeta.color}60`,
              color: categoryMeta.color,
            }}
          >
            {CategoryIcon && <CategoryIcon className="h-3 w-3" />}
            {categoryMeta.label}
          </Badge>
        )}
        <SeverityBadge severity={event.severity} className="text-xs" />
      </div>

      <div className="space-y-1 text-xs text-muted-foreground mb-2">
        <div className="flex items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{event.locationName}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{formatRelativeTime(event.timestamp)}</span>
        </div>
      </div>

      {event.summary && (
        <p className="text-xs text-muted-foreground line-clamp-3 mb-2">
          {event.summary}
        </p>
      )}

      {sources.length > 0 && (
        <div className="flex items-start gap-1 text-xs text-muted-foreground">
          <Layers className="h-3 w-3 shrink-0 mt-0.5" />
          <div className="flex flex-wrap gap-1">
            {sources.map((source, i) =>
              source.url ? (
                <a
                  key={i}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {formatSourceName(source.name)}
                </a>
              ) : (
                <span key={i}>{formatSourceName(source.name)}</span>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
