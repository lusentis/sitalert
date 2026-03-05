import { Suspense } from "react";
import { cacheLife } from "next/cache";
import { createHttpClient } from "@travelrisk/db/client";
import { queryAllAdvisories, queryEventsGeoJSON, querySituationsForFeed } from "@travelrisk/db/queries";
import { timeRangeToDate } from "@travelrisk/shared";
import { Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { MainPage } from "@/components/main-page";

function SidebarSkeleton() {
  return (
    <aside className="hidden md:flex w-80 lg:w-96 shrink-0 h-screen flex-col bg-card border-r border-border p-4 space-y-4">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <span className="text-lg font-bold font-mono tracking-tight">TravelRisk</span>
      </div>
      <Separator />
      {/* Search */}
      <Skeleton className="h-9 w-full rounded-md" />
      {/* Category filters */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-full" />
        ))}
      </div>
      {/* Tab toggle */}
      <Skeleton className="h-8 w-full rounded-md" />
      <Separator />
      {/* Feed items */}
      <div className="flex-1 space-y-3 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-2">
            <Skeleton className="h-4 w-4 mt-0.5 rounded shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-[85%]" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-3 rounded" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-14 rounded-full" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function LoadingFallback() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SidebarSkeleton />
      {/* Map placeholder */}
      <div className="relative flex-1 bg-background">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative size-12">
              <div className="absolute inset-0 rounded-full border border-primary/20 motion-safe:animate-radar-fade" />
              <div className="absolute inset-2 rounded-full border border-primary/30 motion-safe:animate-radar-fade [animation-delay:0.5s]" />
              <div className="absolute inset-0 motion-safe:animate-radar-sweep origin-center">
                <div className="absolute top-1/2 left-1/2 w-1/2 h-[2px] bg-gradient-to-r from-primary/80 to-transparent origin-left rounded-full" />
              </div>
              <div className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/60" />
            </div>
            <p className="text-sm text-muted-foreground font-mono tracking-wide">Loading map...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function getDb() {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) return null;
  return createHttpClient(databaseUrl);
}

async function fetchAdvisories() {
  "use cache: remote";
  cacheLife("hours"); // advisories rarely change — revalidate every 1hr

  const db = getDb();
  if (!db) return [];

  try {
    return await queryAllAdvisories(db);
  } catch (err) {
    console.error("Failed to fetch advisories:", err instanceof Error ? err.message : err);
    return [];
  }
}

async function fetchInitialEvents() {
  "use cache: remote";
  cacheLife("seconds"); // real-time events — revalidate every 1s

  const db = getDb();
  if (!db) return null;

  try {
    return await queryEventsGeoJSON(db, {
      minSeverity: 2,
      after: timeRangeToDate("24h"),
      limit: 5000,
    });
  } catch (err) {
    console.error("Failed to fetch initial events:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchInitialSituations() {
  "use cache: remote";
  cacheLife("seconds"); // real-time situations — revalidate every 1s

  const db = getDb();
  if (!db) return null;

  try {
    return await querySituationsForFeed(db, {
      minSeverity: 2,
      after: timeRangeToDate("24h"),
    });
  } catch (err) {
    console.error("Failed to fetch initial situations:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function CachedContent() {
  "use cache: remote";
  cacheLife("seconds"); // page wrapper matches real-time inner data

  const [advisories, initialEvents, initialSituations] = await Promise.all([
    fetchAdvisories(),
    fetchInitialEvents(),
    fetchInitialSituations(),
  ]);

  return (
    <MainPage
      advisories={advisories}
      initialEvents={initialEvents}
      initialSituations={initialSituations}
    />
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CachedContent />
    </Suspense>
  );
}
