import { Suspense } from "react";
import { MainPage } from "@/components/main-page";

function LoadingFallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-12">
          {/* Radar rings */}
          <div className="absolute inset-0 rounded-full border border-primary/20 motion-safe:animate-radar-fade" />
          <div className="absolute inset-2 rounded-full border border-primary/30 motion-safe:animate-radar-fade [animation-delay:0.5s]" />
          {/* Sweep line */}
          <div className="absolute inset-0 motion-safe:animate-radar-sweep origin-center">
            <div className="absolute top-1/2 left-1/2 w-1/2 h-[2px] bg-gradient-to-r from-primary/80 to-transparent origin-left rounded-full" />
          </div>
          {/* Center dot */}
          <div className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/60" />
        </div>
        <p className="text-sm text-muted-foreground font-mono tracking-wide">Scanning global feeds...</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MainPage />
    </Suspense>
  );
}
