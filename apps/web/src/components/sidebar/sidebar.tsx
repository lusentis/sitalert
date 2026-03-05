"use client";

import { useRef, useState, useEffect } from "react";
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
import { Activity, ChevronRight, AlertCircle, ArrowUp } from "lucide-react";
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
  const feedRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollTop(el.scrollTop > 300);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Fixed header */}
      <div className="shrink-0 p-4 pb-0 space-y-4">
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
                  ? `Last event ${formatRelativeTime(lastStreamEvent.timestamp)}`
                  : "Connected — waiting for events"}
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
                  className="ml-2 rounded px-1.5 py-0.5 bg-red-500/20 text-red-300 hover:bg-red-500/30 font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
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
            className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 ${
              filters.tab === "situations"
                ? "bg-background text-foreground shadow-sm shadow-[inset_0_-2px_0_0_hsl(var(--primary))]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Situations
          </button>
          <button
            onClick={() => filters.setTab("events")}
            className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 ${
              filters.tab === "events"
                ? "bg-background text-foreground shadow-sm shadow-[inset_0_-2px_0_0_hsl(var(--primary))]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Events
          </button>
        </div>
      </div>

      {/* Scrollable feed */}
      <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto p-4 pt-4 relative">
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

        {/* Back to top */}
        {showScrollTop && (
          <button
            onClick={scrollToTop}
            aria-label="Scroll to top"
            className="sticky bottom-3 mx-auto z-10 flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md hover:text-foreground transition-colors motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
          >
            <ArrowUp className="h-3 w-3" />
            Top
          </button>
        )}
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarContentProps) {
  const situationCount = props.situations?.length ?? 0;

  return (
    <>
      {/* Desktop sidebar — resizable via CSS */}
      <aside
        role="complementary"
        aria-label="Situations sidebar"
        className="hidden md:flex w-80 lg:w-96 min-w-[280px] max-w-[600px] shrink-0 h-screen flex-col bg-card border-r border-white/[0.08] shadow-[2px_0_15px_-3px_oklch(0_0_0/0.4)] overflow-hidden resize-x"
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
