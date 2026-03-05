"use client";

import type { SituationWithCoords } from "@travelrisk/db";
import type { GeoJSONFeatureCollection, GeoJSONFeature } from "@travelrisk/db";
import type { NormalizedEvent } from "@travelrisk/shared";
import { formatRelativeTime } from "@travelrisk/shared";
import type { Filters } from "@/hooks/use-filters";
import { CategoryFilter } from "./category-filter";
import { SeverityFilter } from "./severity-filter";
import { SituationFeed } from "./situation-feed";
import { EventFeed } from "./event-feed";
import { WelcomeBanner } from "./welcome-banner";
import { SearchInput } from "./search-input";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Drawer } from "vaul";
import Link from "next/link";
import { Activity, ChevronRight, AlertCircle } from "lucide-react";
import { useOnboardingDismissed } from "@/hooks/use-onboarding";

interface SidebarContentProps {
  filters: Filters;
  situations: SituationWithCoords[] | null;
  isLoading: boolean;
  isConnected: boolean;
  counts?: Record<string, number>;
  error: string | null;
  events: GeoJSONFeatureCollection | null;
  lastStreamEvent: NormalizedEvent | null;
  eventsLoading: boolean;
  onEventClick: (feature: GeoJSONFeature) => void;
  selectedEventId?: string | null;
  deepLinkSituationId?: string | null;
  onSituationSelect?: (id: string | null) => void;
  searchQuery: string;
  debouncedSearch: string;
  onSearchChange: (value: string) => void;
  onRetry?: () => void;
}

function SidebarContent({
  filters,
  situations,
  isLoading,
  isConnected,
  counts,
  error,
  events,
  lastStreamEvent,
  eventsLoading,
  onEventClick,
  selectedEventId,
  deepLinkSituationId,
  onSituationSelect,
  searchQuery,
  debouncedSearch,
  onSearchChange,
  onRetry,
}: SidebarContentProps) {
  const { dismissed, dismiss } = useOnboardingDismissed();

  return (
    <div className="flex flex-col h-full p-4 space-y-4 min-w-0">
      <div className="flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold font-mono tracking-tight">TravelRisk</h1>
        </Link>
        {isConnected && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 ml-auto cursor-default">
                <span className="h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                <span className="text-[10px] font-medium text-emerald-400/80 uppercase tracking-wider">Live</span>
                <span className="sr-only">Live connection active</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {lastStreamEvent
                ? `Last event: ${formatRelativeTime(lastStreamEvent.timestamp)}`
                : "Live — listening for new events"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <Separator />

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <span>{error}</span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="ml-2 underline underline-offset-2 hover:text-red-300 transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {!dismissed && <WelcomeBanner onDismiss={dismiss} />}

      <SearchInput value={searchQuery} onChange={onSearchChange} />

      <CategoryFilter
        selected={filters.categories}
        onToggle={filters.toggleCategory}
        onSetCategories={filters.setCategories}
        counts={counts}
      />
      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full">
          <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
          More filters
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <SeverityFilter
            value={filters.minSeverity}
            onChange={filters.setMinSeverity}
          />
        </CollapsibleContent>
      </Collapsible>
      <Separator />

      {/* Feed tab toggle */}
      <div className="flex gap-1 bg-muted/50 rounded-md p-0.5">
        <button
          onClick={() => filters.setTab("situations")}
          className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors ${
            filters.tab === "situations"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Situations
        </button>
        <button
          onClick={() => filters.setTab("events")}
          className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors ${
            filters.tab === "events"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Events
        </button>
      </div>

      {filters.tab === "situations" ? (
        <SituationFeed
          situations={situations}
          isLoading={isLoading}
          searchQuery={debouncedSearch}
          deepLinkSituationId={deepLinkSituationId}
          onSituationSelect={onSituationSelect}
        />
      ) : (
        <EventFeed
          data={events}
          lastStreamEvent={lastStreamEvent}
          onEventClick={onEventClick}
          isLoading={eventsLoading}
          selectedEventId={selectedEventId}
          searchQuery={debouncedSearch}
        />
      )}
    </div>
  );
}

export function Sidebar(props: SidebarContentProps) {
  const situationCount = props.situations?.length ?? 0;

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        role="complementary"
        aria-label="Situations sidebar"
        className="hidden md:flex w-80 lg:w-96 shrink-0 h-screen flex-col bg-card border-r border-border overflow-y-auto overflow-x-hidden"
      >
        <SidebarContent {...props} />
      </aside>

      {/* Mobile drawer */}
      <div className="md:hidden">
        <Drawer.Root>
          <Drawer.Trigger asChild>
            <button
              aria-label="Open situations panel"
              className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card text-card-foreground border border-border rounded-full px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lg flex items-center gap-2 transition-[transform,box-shadow] duration-150 motion-safe:active:scale-95 active:shadow-md"
            >
              <Activity className="h-4 w-4" />
              <span className="text-sm font-medium">Situations</span>
              {situationCount > 0 && (
                <span className="text-xs font-bold tabular-nums bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                  {situationCount}
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
