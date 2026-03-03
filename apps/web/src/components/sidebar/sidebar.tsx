"use client";

import type { GeoJSONFeatureCollection, GeoJSONFeature } from "@sitalert/db";
import type { NormalizedEvent } from "@sitalert/shared";
import type { Filters } from "@/hooks/use-filters";
import { CategoryFilter } from "./category-filter";
import { SeverityFilter } from "./severity-filter";
import { ConfidenceFilter } from "./confidence-filter";
import { EventFeed } from "./event-feed";
import { Separator } from "@/components/ui/separator";
import { Drawer } from "vaul";
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

interface SidebarContentProps {
  filters: Filters;
  data: GeoJSONFeatureCollection | null;
  lastStreamEvent: NormalizedEvent | null;
  isLoading: boolean;
  counts?: Record<string, number>;
  onEventClick: (feature: GeoJSONFeature) => void;
}

function SidebarContent({
  filters,
  data,
  lastStreamEvent,
  isLoading,
  counts,
  onEventClick,
}: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">SitAlert</h1>
      </div>
      <Separator />
      <CategoryFilter
        selected={filters.categories}
        onToggle={filters.toggleCategory}
        counts={counts}
      />
      <SeverityFilter
        value={filters.minSeverity}
        onChange={filters.setMinSeverity}
      />
      <ConfidenceFilter
        value={filters.minConfidence}
        onChange={filters.setMinConfidence}
      />
      <Separator />
      <EventFeed
        data={data}
        lastStreamEvent={lastStreamEvent}
        onEventClick={onEventClick}
        isLoading={isLoading}
      />
    </div>
  );
}

interface SidebarProps extends SidebarContentProps {
  isConnected: boolean;
}

export function Sidebar(props: SidebarProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (isMobile) {
    return (
      <Drawer.Root>
        <Drawer.Trigger asChild>
          <button className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card text-card-foreground border border-border rounded-full px-4 py-2 shadow-lg flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="text-sm font-medium">Events</span>
            {props.isConnected && (
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            )}
          </button>
        </Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl max-h-[85vh] outline-none">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted my-3" />
            <div className="overflow-y-auto max-h-[calc(85vh-40px)]">
              <SidebarContent {...props} />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <aside className="w-[380px] shrink-0 h-screen bg-card border-r border-border overflow-y-auto">
      <SidebarContent {...props} />
      {props.isConnected && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </div>
        </div>
      )}
    </aside>
  );
}
