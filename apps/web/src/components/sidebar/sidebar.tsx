"use client";

import type { GeoJSONFeatureCollection, GeoJSONFeature } from "@travelrisk/db";
import type { NormalizedEvent } from "@travelrisk/shared";
import type { Filters } from "@/hooks/use-filters";
import { CategoryFilter } from "./category-filter";
import { SeverityFilter } from "./severity-filter";
import { ConfidenceFilter } from "./confidence-filter";
import { EventFeed } from "./event-feed";
import { WelcomeBanner } from "./welcome-banner";
import { Separator } from "@/components/ui/separator";
import { Drawer } from "vaul";
import { Activity } from "lucide-react";
import { useOnboardingDismissed } from "@/hooks/use-onboarding";

interface SidebarContentProps {
  filters: Filters;
  data: GeoJSONFeatureCollection | null;
  lastStreamEvent: NormalizedEvent | null;
  isLoading: boolean;
  isConnected: boolean;
  counts?: Record<string, number>;
  onEventClick: (feature: GeoJSONFeature) => void;
  selectedEventId?: string | null;
}

function SidebarContent({
  filters,
  data,
  lastStreamEvent,
  isLoading,
  isConnected,
  counts,
  onEventClick,
  selectedEventId,
}: SidebarContentProps) {
  const { dismissed, dismiss } = useOnboardingDismissed();

  return (
    <div className="flex flex-col h-full p-4 space-y-4 min-w-0">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold font-mono tracking-tight">TravelRisk</h1>
        {isConnected && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
            <span className="text-[10px] font-medium text-emerald-400/80 uppercase tracking-wider">Live</span>
            <span className="sr-only">Live connection active</span>
          </div>
        )}
      </div>
      <Separator />
      {!dismissed && <WelcomeBanner onDismiss={dismiss} />}
      <CategoryFilter
        selected={filters.categories}
        onToggle={filters.toggleCategory}
        onSetAll={() => filters.setCategories([] as string[])}
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
        selectedEventId={selectedEventId}
      />
    </div>
  );
}

export function Sidebar(props: SidebarContentProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside
        role="complementary"
        aria-label="Event sidebar"
        className="hidden md:flex w-80 lg:w-96 shrink-0 h-screen flex-col bg-card border-r border-border overflow-y-auto overflow-x-hidden"
      >
        <SidebarContent {...props} />
      </aside>

      {/* Mobile drawer */}
      <div className="md:hidden">
        <Drawer.Root>
          <Drawer.Trigger asChild>
            <button
              aria-label="Open event panel"
              className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card text-card-foreground border border-border rounded-full px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lg flex items-center gap-2 transition-[transform,box-shadow] duration-150 motion-safe:active:scale-95 active:shadow-md"
            >
              <Activity className="h-4 w-4" />
              <span className="text-sm font-medium">Events</span>
              {props.data && props.data.features.length > 0 && (
                <span className="text-xs font-bold tabular-nums bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                  {props.data.features.length}
                </span>
              )}
              {props.isConnected && (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                  <span className="sr-only">Live</span>
                </>
              )}
            </button>
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
            <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl max-h-[85dvh] outline-none flex flex-col">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted my-3" />
              <div className="flex-1 min-h-0 overflow-y-auto">
                <SidebarContent {...props} />
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </>
  );
}
